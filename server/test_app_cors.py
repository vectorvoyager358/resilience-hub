import importlib
import os
import sys
import types
import unittest
from unittest.mock import patch


os.environ.setdefault("ALLOWED_ORIGINS", "https://client.example")
os.environ.setdefault("PINECONE_API_KEY", "test-key")
os.environ.setdefault("PINECONE_INDEX_NAME", "test-index")


class _FakePineconeIndex:
    pass


class _FakePinecone:
    def __init__(self, *args, **kwargs):
        pass

    def Index(self, *args, **kwargs):
        return _FakePineconeIndex()


class CorsPreflightTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fake_pinecone_module = types.SimpleNamespace(Pinecone=_FakePinecone)
        with patch.dict(sys.modules, {"pinecone": fake_pinecone_module}):
            cls.app_module = importlib.import_module("app")
        cls.client = cls.app_module.app.test_client()

    def test_chat_preflight_allows_authorization_header(self):
        response = self.client.options(
            "/api/chat-assistant",
            headers={
                "Origin": "https://client.example",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "Authorization, Content-Type",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.headers.get("Access-Control-Allow-Origin"),
            "https://client.example",
        )
        allowed_headers = response.headers.get("Access-Control-Allow-Headers", "")
        self.assertIn("Authorization", allowed_headers)
        self.assertIn("Content-Type", allowed_headers)


if __name__ == "__main__":
    unittest.main()
