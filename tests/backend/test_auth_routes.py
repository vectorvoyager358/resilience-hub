"""Smoke tests: protected routes reject unauthenticated callers, ownership is enforced."""

import importlib
import os
import sys
import types
import unittest
from unittest.mock import patch


os.environ.setdefault("ALLOWED_ORIGINS", "https://client.example")
os.environ.setdefault("PINECONE_API_KEY", "test-key")
os.environ.setdefault("PINECONE_INDEX_NAME", "test-index")


class _FakeIndex:
    def __init__(self):
        self.upserts = []
        self.deletes = []
        self.queries = []

    def upsert(self, vectors):
        self.upserts.append(vectors)

    def delete(self, ids=None):
        self.deletes.append(list(ids or []))

    def query(self, **kwargs):
        self.queries.append(kwargs)
        return types.SimpleNamespace(matches=[])


class _FakePinecone:
    def __init__(self, *_args, **_kwargs):
        pass

    def Index(self, *_args, **_kwargs):
        return _FakeIndex()


def _load_app_with_fake_pinecone():
    """Load the Flask app and inject an in-memory fake into the route module.

    The route module lazy-initializes the Pinecone client on first request, so
    we just pre-populate the singleton with our fake to avoid any network I/O.
    """
    if "server.app" in sys.modules:
        del sys.modules["server.app"]
    app_module = importlib.import_module("server.app")

    import server.routes.pinecone as pinecone_module

    fake_index = _FakeIndex()
    pinecone_module._index_singleton = fake_index
    return app_module, fake_index


class _MultiPatch:
    def __init__(self, patches):
        self._patches = patches

    def __enter__(self):
        for p in self._patches:
            p.start()
        return self

    def __exit__(self, exc_type, exc, tb):
        for p in reversed(self._patches):
            p.stop()
        return False


class ProtectedRoutesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app_module, cls.fake_index = _load_app_with_fake_pinecone()
        cls.client = cls.app_module.app.test_client()

    def test_upsert_requires_auth(self):
        r = self.client.post(
            "/api/upsert-pinecone",
            json={"userId": "victim", "vector": [0.0] * 768, "metadata": {"type": "note"}},
        )
        self.assertEqual(r.status_code, 401)

    def test_delete_requires_auth(self):
        r = self.client.post("/api/delete-pinecone", json={"vectorId": "victim-note-x-123"})
        self.assertEqual(r.status_code, 401)

    def test_embed_requires_auth(self):
        r = self.client.post("/api/embed", json={"text": "hello"})
        self.assertEqual(r.status_code, 401)

    def test_push_register_requires_auth(self):
        r = self.client.post("/api/push/register", json={"token": "abc" * 20})
        self.assertEqual(r.status_code, 401)


class OwnershipEnforcementTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app_module, cls.fake_index = _load_app_with_fake_pinecone()
        cls.client = cls.app_module.app.test_client()

    def _with_uid(self, uid):
        # require_uid is imported into each route module, so we patch the wrapper
        # at every call site to bypass real Firebase verification.
        targets = [
            "server.routes.pinecone.require_uid",
            "server.routes.embed.require_uid",
            "server.routes.push.require_uid",
        ]
        return _MultiPatch([patch(t, return_value=(uid, None)) for t in targets])

    def test_delete_by_vector_id_rejects_other_owner(self):
        with self._with_uid("attacker-uid"):
            r = self.client.post(
                "/api/delete-pinecone",
                json={"vectorId": "victim-uid-note-c1-1700000000000"},
                headers={"Authorization": "Bearer fake"},
            )
        self.assertEqual(r.status_code, 403)

    def test_delete_by_prefix_rejects_other_owner(self):
        with self._with_uid("attacker-uid"):
            r = self.client.post(
                "/api/delete-pinecone",
                json={"prefix": "victim-uid-note-c1-"},
                headers={"Authorization": "Bearer fake"},
            )
        self.assertEqual(r.status_code, 403)

    def test_upsert_ignores_body_userId(self):
        with self._with_uid("real-uid"):
            r = self.client.post(
                "/api/upsert-pinecone",
                json={
                    "userId": "victim-uid",
                    "vector": [0.0] * 768,
                    "metadata": {"type": "note", "challengeId": "c1", "content": "hi"},
                },
                headers={"Authorization": "Bearer fake"},
            )
        self.assertEqual(r.status_code, 200, msg=r.get_data(as_text=True))
        body = r.get_json()
        self.assertTrue(body["vectorId"].startswith("real-uid-"))

    def test_content_upsert_indexes_chunks(self):
        long_content = ("Note text for indexing. " * 80).strip()
        with self._with_uid("real-uid"):
            with patch("server.gemini_client.embed_document_text", return_value=[0.0] * 768):
                with patch.dict(
                    os.environ,
                    {
                        "RAG_CHUNK_THRESHOLD_CHARS": "400",
                        "RAG_CHUNK_TARGET_CHARS": "500",
                        "RAG_CHUNK_OVERLAP_CHARS": "50",
                    },
                    clear=False,
                ):
                    r = self.client.post(
                        "/api/upsert-pinecone",
                        json={
                            "content": long_content,
                            "metadata": {
                                "type": "note",
                                "challengeId": "c9",
                                "dayNumber": 2,
                            },
                        },
                        headers={"Authorization": "Bearer fake"},
                    )
        self.assertEqual(r.status_code, 200, msg=r.get_data(as_text=True))
        body = r.get_json()
        self.assertEqual(body["parentId"], "real-uid-note-c9-2")
        self.assertGreater(body["chunkCount"], 1)
        self.assertTrue(len(self.fake_index.upserts) >= 1)


if __name__ == "__main__":
    unittest.main()
