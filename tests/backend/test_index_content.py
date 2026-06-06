"""Tests for RAG indexing chunking (#76)."""

from __future__ import annotations

import os
import types
import unittest
from unittest.mock import patch

os.environ.setdefault("ALLOWED_ORIGINS", "https://client.example")
os.environ.setdefault("PINECONE_API_KEY", "test-key")
os.environ.setdefault("PINECONE_INDEX_NAME", "test-index")


class TextChunkingTest(unittest.TestCase):
    def test_short_text_single_chunk(self):
        from server.text_chunking import split_text_for_indexing

        text = "Short note for today."
        self.assertEqual(split_text_for_indexing(text, threshold_chars=2000), [text])

    def test_long_text_multiple_chunks_with_overlap(self):
        from server.text_chunking import split_text_for_indexing

        para = "Sentence one about resilience. " * 40
        text = (para + "\n\n") * 6
        chunks = split_text_for_indexing(
            text,
            threshold_chars=500,
            target_chars=800,
            overlap_chars=100,
        )
        self.assertGreater(len(chunks), 1)
        self.assertTrue(all(c.strip() for c in chunks))
        joined = " ".join(chunks)
        self.assertIn("resilience", joined)

    def test_parent_id_note(self):
        from server.index_content import parent_id_for

        pid = parent_id_for(
            "uid1",
            {"type": "note", "challengeId": "c1", "dayNumber": 3},
        )
        self.assertEqual(pid, "uid1-note-c1-3")

    def test_vector_id_for_chunk(self):
        from server.index_content import vector_id_for_chunk

        self.assertEqual(vector_id_for_chunk("uid1-note-c1-3", 2), "uid1-note-c1-3-c2")


class _FakeIndex:
    def __init__(self):
        self.upserts = []
        self.deletes = []

    def upsert(self, vectors):
        self.upserts.append(vectors)

    def delete(self, ids=None):
        self.deletes.append(list(ids or []))

    def query(self, **_kwargs):
        return types.SimpleNamespace(matches=[])


class IndexContentChunksTest(unittest.TestCase):
    def test_index_long_note_produces_multiple_vectors(self):
        from server.index_content import index_content_chunks

        long_content = ("Daily reflection paragraph. " * 120).strip()
        fake = _FakeIndex()
        embed_sizes: list[int] = []

        def fake_embed(text: str):
            embed_sizes.append(len(text))
            return [0.01] * 768

        with patch("server.gemini_client.embed_document_text", side_effect=fake_embed):
            with patch.dict(
                os.environ,
                {
                    "RAG_CHUNK_THRESHOLD_CHARS": "500",
                    "RAG_CHUNK_TARGET_CHARS": "800",
                    "RAG_CHUNK_OVERLAP_CHARS": "100",
                },
                clear=False,
            ):
                vid, count = index_content_chunks(
                    fake,
                    uid="uid-a",
                    content=long_content,
                    metadata={
                        "type": "note",
                        "challengeId": "ch1",
                        "dayNumber": 1,
                    },
                )
        self.assertGreater(count, 1)
        self.assertEqual(vid, "uid-a-note-ch1-1-c0")
        self.assertEqual(len(fake.upserts), 1)
        self.assertEqual(len(fake.upserts[0]), count)
        self.assertGreater(len(embed_sizes), 1)
        first_meta = fake.upserts[0][0][2]
        self.assertEqual(first_meta.get("parent_id"), "uid-a-note-ch1-1")
        self.assertEqual(first_meta.get("chunk_index"), 0)
        self.assertEqual(first_meta.get("chunk_count"), count)


if __name__ == "__main__":
    unittest.main()
