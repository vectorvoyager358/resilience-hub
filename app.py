from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import os

# Load environment variables
load_dotenv()

# Flask app
app = Flask(__name__)

# CORS: comma-separated origins, or omit / empty for "*" (local dev).
# For GitHub Pages + credentialed fetch, set e.g. ALLOWED_ORIGINS=https://YOU.github.io/resilience-hub,http://localhost:5173
_allowed_raw = os.environ.get("ALLOWED_ORIGINS", "").strip()
_cors_origins = [o.strip() for o in _allowed_raw.split(",") if o.strip()] if _allowed_raw else "*"

CORS(app, resources={
    r"/*": {
        "origins": _cors_origins,
        "methods": ["GET", "POST", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Accept"],
        "supports_credentials": True,
    }
})

# Import and register blueprints
from server.routes.pinecone import pinecone_routes
from server.routes.reminders import reminder_routes

# Add debug print to see registered routes
print("Available Routes:")
app.register_blueprint(pinecone_routes)
app.register_blueprint(reminder_routes)
for rule in app.url_map.iter_rules():
    print(f"Route: {rule.rule}, Methods: {rule.methods}")

@app.route('/api/test', methods=['GET'])
def test_endpoint():
    return jsonify({"status": "Server is running"})

@app.route("/")
def home():
    return "RAG backend is running!"

if __name__ == "__main__":
    _port = int(os.environ.get("PORT", "5001"))
    _debug = os.environ.get("FLASK_DEBUG", "1").lower() in ("1", "true", "yes")
    app.run(host="0.0.0.0", port=_port, debug=_debug, use_reloader=False)