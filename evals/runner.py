"""Offline chat eval checks (#79): routing and optional mocked endpoint meta."""

from __future__ import annotations

import importlib
import os
import sys
import types
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from unittest.mock import patch

from evals.dataset import load_golden_rows
from server.intent_chat import needs_semantic_retrieval

REPO_ROOT = Path(__file__).resolve().parents[1]


@dataclass
class CaseResult:
    id: str
    status: str  # "pass" | "fail"
    checks: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


@dataclass
class EvalReport:
    generated_at: str
    mode: str
    dataset: str
    summary: dict[str, int]
    results: list[CaseResult]

    def to_dict(self) -> dict[str, Any]:
        return {
            "generatedAt": self.generated_at,
            "mode": self.mode,
            "dataset": self.dataset,
            "summary": self.summary,
            "results": [
                {
                    "id": r.id,
                    "status": r.status,
                    "checks": r.checks,
                    **({"errors": r.errors} if r.errors else {}),
                }
                for r in self.results
            ],
        }


def _check_routing(row: dict[str, Any]) -> CaseResult:
    case_id = row["id"]
    got = needs_semantic_retrieval(row["message"])
    expected = row["expect_rag"]
    errors: list[str] = []
    if got != expected:
        errors.append(f"routing: expected expect_rag={expected}, got {got}")

    if row.get("forbid_stats_from_memories") and row["expect_rag"]:
        errors.append("rules: forbid_stats_from_memories requires expect_rag=false")

    return CaseResult(
        id=case_id,
        status="fail" if errors else "pass",
        checks=["routing", "rules"],
        errors=errors,
    )


def run_routing_eval(rows: list[dict[str, Any]]) -> list[CaseResult]:
    return [_check_routing(row) for row in rows]


def _ensure_app_stubs() -> Any:
    """Load Flask app once with Pinecone stubbed (mirrors tests/backend/test_chat.py)."""
    os.environ.setdefault("ALLOWED_ORIGINS", "https://client.example")
    os.environ.setdefault("PINECONE_API_KEY", "test-key")
    os.environ.setdefault("PINECONE_INDEX_NAME", "test-index")
    os.environ.setdefault("CHAT_UID_RATE_CAPACITY", "100")
    os.environ.setdefault("CHAT_UID_RATE_REFILL_PER_SEC", "100")
    os.environ.setdefault("CHAT_IP_RATE_CAPACITY", "100")
    os.environ.setdefault("CHAT_IP_RATE_REFILL_PER_SEC", "100")

    class _FakePineconeIndex:
        def query(self, **_kw):
            return types.SimpleNamespace(matches=[])

    class _FakePinecone:
        def __init__(self, *_a, **_kw):
            pass

        def Index(self, *_a, **_kw):
            return _FakePineconeIndex()

    sys.modules.setdefault("pinecone", types.SimpleNamespace(Pinecone=_FakePinecone))
    app_module = importlib.import_module("server.app")
    import server.routes.pinecone as pc_mod

    pc_mod._index_singleton = _FakePineconeIndex()
    return app_module


def _mock_chat_case(row: dict[str, Any], client: Any) -> CaseResult:
    case_id = row["id"]
    errors: list[str] = []
    user_doc = row.get("fixture_user_doc") or {"challenges": [], "dailyNotes": {}}
    history = row.get("history") or []
    payload: dict[str, Any] = {"message": row["message"]}
    if history:
        payload["conversationHistory"] = history

    with patch(
        "server.routes.chat.verify_bearer_uid_and_email_verified",
        return_value=("eval-user", True),
    ):
        with patch("server.routes.chat.firestore.Client") as mock_fs:
            mock_fs.return_value.collection.return_value.document.return_value.get.return_value = (
                types.SimpleNamespace(exists=True, to_dict=lambda: user_doc)
            )
            with patch(
                "server.routes.chat._pinecone_matches_for_user",
                return_value=[],
            ):
                with patch(
                    "server.routes.chat.generate_chat_reply",
                    return_value="eval stub reply",
                ):
                    response = client.post(
                        "/api/chat-assistant",
                        json=payload,
                        headers={"Authorization": "Bearer eval-token"},
                    )

    if response.status_code != 200:
        errors.append(f"mock_chat: HTTP {response.status_code}")
        return CaseResult(id=case_id, status="fail", checks=["mock_chat"], errors=errors)

    body = response.get_json() or {}
    meta = body.get("meta") or {}

    if meta.get("ragRequested") != row["expect_rag"]:
        errors.append(
            f"mock_chat: meta.ragRequested expected {row['expect_rag']}, "
            f"got {meta.get('ragRequested')}"
        )

    if row["expect_rag"]:
        if meta.get("usedRag") is not False:
            errors.append("mock_chat: empty Pinecone should set usedRag=false")
        expected_mode = row.get("expect_grounding_mode", "facts_only")
        if meta.get("groundingMode") != expected_mode:
            errors.append(
                f"mock_chat: groundingMode expected {expected_mode!r}, "
                f"got {meta.get('groundingMode')!r}"
            )
    else:
        if meta.get("usedRag"):
            errors.append("mock_chat: facts-only row should not set usedRag")
        if body.get("sources"):
            errors.append("mock_chat: facts-only row should return empty sources")

    return CaseResult(
        id=case_id,
        status="fail" if errors else "pass",
        checks=["mock_chat"],
        errors=errors,
    )


def run_mock_chat_eval(rows: list[dict[str, Any]]) -> list[CaseResult]:
    import logging

    logging.getLogger("server.routes.chat").setLevel(logging.WARNING)
    app_module = _ensure_app_stubs()
    client = app_module.app.test_client()
    return [_mock_chat_case(row, client) for row in rows]


def merge_results(routing: list[CaseResult], mock_chat: list[CaseResult] | None) -> list[CaseResult]:
    if not mock_chat:
        return routing
    by_id = {r.id: r for r in routing}
    merged: list[CaseResult] = []
    for mc in mock_chat:
        base = by_id.get(mc.id)
        if base is None:
            merged.append(mc)
            continue
        errors = base.errors + mc.errors
        merged.append(
            CaseResult(
                id=mc.id,
                status="fail" if errors else "pass",
                checks=base.checks + mc.checks,
                errors=errors,
            )
        )
    return merged


def build_report(
    *,
    mode: str,
    dataset_path: Path,
    results: list[CaseResult],
) -> EvalReport:
    passed = sum(1 for r in results if r.status == "pass")
    failed = len(results) - passed
    return EvalReport(
        generated_at=datetime.now(timezone.utc).isoformat(),
        mode=mode,
        dataset=str(dataset_path.relative_to(REPO_ROOT) if dataset_path.is_relative_to(REPO_ROOT) else dataset_path),
        summary={"total": len(results), "passed": passed, "failed": failed},
        results=results,
    )


def run_eval(
    *,
    dataset_path: Path | None = None,
    mock_chat: bool = False,
) -> EvalReport:
    path = dataset_path or Path(__file__).resolve().parent / "chat_golden.jsonl"
    rows = load_golden_rows(path)
    routing = run_routing_eval(rows)
    mock_results = run_mock_chat_eval(rows) if mock_chat else None
    results = merge_results(routing, mock_results)
    mode = "routing+mock_chat" if mock_chat else "routing"
    return build_report(mode=mode, dataset_path=path, results=results)
