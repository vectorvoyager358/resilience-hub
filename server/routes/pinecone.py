from flask import Blueprint, request, jsonify
from pinecone import Pinecone
import os
import time
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

pinecone_routes = Blueprint('pinecone', __name__)

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


@pinecone_routes.route('/api/query-pinecone', methods=['POST'])
def query_pinecone_route():
    """Semantic search over the user’s vectors (embedding + query); requires Firebase ID token."""
    from server.firebase_util import verify_bearer_uid
    from server.gemini_client import embed_query_text

    auth_header = request.headers.get('Authorization')
    try:
        uid = verify_bearer_uid(auth_header)
    except ValueError:
        return jsonify({"error": "unauthorized", "matches": []}), 401
    except Exception:
        return jsonify({"error": "unauthorized", "matches": []}), 401

    data = request.get_json(silent=True) or {}
    body_uid = data.get('userId')
    if body_uid != uid:
        return jsonify({"error": "forbidden", "matches": []}), 403

    query_text = data.get('query')
    if not isinstance(query_text, str) or not query_text.strip():
        return jsonify({"error": "query required", "matches": []}), 400

    try:
        top_k = int(data.get('topK') or 8)
    except Exception:
        top_k = 8
    top_k = max(1, min(top_k, 25))

    try:
        vec = embed_query_text(query_text.strip())
        q = index.query(
            vector=vec,
            top_k=top_k,
            include_metadata=True,
            filter={"user_id": uid},
        )
        matches = []
        for m in q.matches:
            md_raw = getattr(m, 'metadata', None) or {}
            md = dict(md_raw) if hasattr(md_raw, 'keys') else {}
            matches.append({
                "id": getattr(m, 'id', ''),
                "score": getattr(m, 'score', None),
                "content": md.get('content', '') if isinstance(md.get('content'), str) else '',
                "metadata": {
                    "type": md.get('type'),
                    "date": md.get('date') or md.get('dateCreated'),
                    "challengeId": md.get('challengeId'),
                    "dayNumber": md.get('dayNumber'),
                },
            })
        return jsonify({"matches": matches})
    except Exception as e:
        logger.error(f"query_pinecone: {str(e)}", exc_info=True)
        return jsonify({"matches": [], "error": "query_failed"}), 200