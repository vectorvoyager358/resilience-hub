from flask import Blueprint, request, jsonify
from pinecone import Pinecone
import os
import time
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

pinecone_routes = Blueprint('pinecone', __name__)

# RAG / Chat assistant: client calls POST /api/query-pinecone (see ChatAssistant.getRelevantContext);
# that route is not registered here yet—implement query + embedding + index.query with user filter.

# Create a Pinecone client instance
pc = Pinecone(api_key=os.getenv('PINECONE_API_KEY'))
index = pc.Index(os.getenv('PINECONE_INDEX_NAME'))

def create_vector_id(user_id, metadata):
    """Create a consistent vector ID format"""
    timestamp = int(time.time() * 1000)
    type_str = metadata.get('type', 'unknown')
    challenge_id = metadata.get('challengeId', '')
    return f"{user_id}-{type_str}-{challenge_id}-{timestamp}"

def validate_request_data(data, required_fields):
    """Validate request data has all required fields"""
    if not data:
        raise ValueError("No JSON data received")
    
    missing_fields = [field for field in required_fields if field not in data]
    if missing_fields:
        raise ValueError(f"Missing required fields: {', '.join(missing_fields)}")

@pinecone_routes.route('/api/upsert-pinecone', methods=['POST'])
def upsert_to_pinecone():
    try:
        logger.info("Received request at /api/upsert-pinecone")
        data = request.json
        logger.info(f"Request data: {data}")
        
        # Validate request data
        validate_request_data(data, ['userId', 'vector', 'metadata'])
        
        user_id = data['userId']
        vector = data['vector']
        metadata = data['metadata']
        
        # Create vector ID
        vector_id = create_vector_id(user_id, metadata)
        
        logger.info(f"Upserting vector for user {user_id} with ID {vector_id}")
        
        # Add user_id to metadata for easier querying
        metadata['user_id'] = user_id
        
        # Upsert to Pinecone
        index.upsert(vectors=[(vector_id, vector, metadata)])
        logger.info(f"Successfully upserted vector {vector_id}")
        
        return jsonify({
            "status": "success",
            "vectorId": vector_id,
            "message": "Vector successfully upserted"
        })
        
    except ValueError as ve:
        logger.error(f"Validation error: {str(ve)}")
        return jsonify({"error": str(ve)}), 400
    except Exception as e:
        logger.error(f"Error in upsert_to_pinecone: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500

@pinecone_routes.route('/api/delete-pinecone', methods=['POST'])
def delete_from_pinecone():
    try:
        logger.info("[PINECONE][DELETE] Received request at /api/delete-pinecone")
        data = request.json
        logger.info(f"[PINECONE][DELETE] Request data: {data}")

        prefix = data.get('prefix')
        vector_id = data.get('vectorId')

        if not prefix and not vector_id:
            logger.error("[PINECONE][DELETE] Missing required fields")
            return jsonify({"error": "Missing required fields"}), 400

        if vector_id:
            logger.info(f"[PINECONE][DELETE] Deleting vector by ID: {vector_id}")
            index.delete(ids=[vector_id])
            logger.info(f"[PINECONE][DELETE] Deleted vector: {vector_id}")
            return jsonify({
                "status": "success",
                "message": f"Deleted vector {vector_id}",
                "deletedIds": [vector_id]
            })

        if prefix:
            logger.info(f"[PINECONE][DELETE] Deleting vectors by prefix: {prefix}")
            filter_user_id = prefix.split('-')[0]
            logger.info(f"[PINECONE][DELETE] Using filter: user_id={filter_user_id}")
            fetch_response = index.query(
                vector=[0] * 768,
                top_k=10000,
                include_metadata=True,
                filter={
                    "user_id": filter_user_id
                }
            )
            logger.info(f"[PINECONE][DELETE] Query response: {fetch_response}")
            vectors_to_delete = [
                match.id for match in fetch_response.matches
                if match.id.startswith(prefix)
            ]
            logger.info(f"[PINECONE][DELETE] Vectors to delete: {vectors_to_delete}")
            if vectors_to_delete:
                batch_size = 100
                for i in range(0, len(vectors_to_delete), batch_size):
                    batch = vectors_to_delete[i:i + batch_size]
                    logger.info(f"[PINECONE][DELETE] Deleting batch: {batch}")
                    index.delete(ids=batch)
                logger.info(f"[PINECONE][DELETE] Deleted vectors with prefix: {prefix}")
                return jsonify({
                    "status": "success",
                    "message": f"Deleted {len(vectors_to_delete)} vectors",
                    "deletedIds": vectors_to_delete
                })
            else:
                logger.info("[PINECONE][DELETE] No matching vectors found to delete")
                return jsonify({
                    "status": "success",
                    "message": "No matching vectors found to delete"
                })
    except Exception as e:
        logger.error(f"[PINECONE][DELETE] Error in delete_from_pinecone: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 500

@pinecone_routes.route('/api/test-pinecone', methods=['GET'])
def test_pinecone():
    try:
        # Test connection to Pinecone
        stats = index.describe_index_stats()
        return jsonify({
            "status": "success",
            "message": "Pinecone connection successful",
            "stats": stats
        })
    except Exception as e:
        logger.error(f"Error testing Pinecone connection: {str(e)}")
        return jsonify({"error": "Failed to connect to Pinecone"}), 500