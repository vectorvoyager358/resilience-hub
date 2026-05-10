from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import logging
import os

load_dotenv()

# Configure logging once, here. Blueprints must NOT call logging.basicConfig.
logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

app = Flask(__name__)

# CORS: comma-separated origins. When unset we default to localhost dev only —
# never `*` with `supports_credentials=True`, since Flask-CORS would echo any Origin.
_allowed_raw = os.environ.get("ALLOWED_ORIGINS", "").strip()
if _allowed_raw:
    _cors_origins = [o.strip() for o in _allowed_raw.split(",") if o.strip()]
else:
    _cors_origins = ["http://localhost:5173"]

CORS(app, resources={
    r"/*": {
        "origins": _cors_origins,
        "methods": ["GET", "POST", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Accept", "Authorization"],
        "supports_credentials": True,
    }
})

from server.routes.pinecone import pinecone_routes
from server.routes.reminders import reminder_routes
from server.routes.chat import chat_routes
from server.routes.embed import embed_routes
from server.routes.push import push_routes

app.register_blueprint(pinecone_routes)
app.register_blueprint(reminder_routes)
app.register_blueprint(chat_routes)
app.register_blueprint(embed_routes)
app.register_blueprint(push_routes)

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
