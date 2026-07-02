"""RAGAS faithfulness + answer relevancy for a golden subset (#82)."""

from __future__ import annotations

import importlib
import logging
import os
import sys
import types
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from unittest.mock import patch

from evals.ragas_dataset import load_ragas_rows

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_JUDGE_MODEL = "gemini-2.5-flash-lite"
DEFAULT_EMBED_MODEL = "models/gemini-embedding-001"
# Gemini 2.5 Flash-Lite list pricing (USD per 1M tokens) — judge cost estimate only.
_GEMINI_INPUT_USD_PER_M = 0.10
_GEMINI_OUTPUT_USD_PER_M = 0.40

logger = logging.getLogger(__name__)


@dataclass
class RagasCaseResult:
    id: str
    golden_id: str
    faithfulness: float | None
    answer_relevancy: float | None
    status: str  # "pass" | "fail"
    errors: list[str] = field(default_factory=list)


@dataclass
class RagasReport:
    generated_at: str
    mode: str
    dataset: str
    judge_model: str
    min_faithfulness: float
    min_answer_relevancy: float
    summary: dict[str, Any]
    results: list[RagasCaseResult]
    estimated_cost_usd: float | None = None

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "generatedAt": self.generated_at,
            "mode": self.mode,
            "dataset": self.dataset,
            "judgeModel": self.judge_model,
            "thresholds": {
                "minFaithfulness": self.min_faithfulness,
                "minAnswerRelevancy": self.min_answer_relevancy,
            },
            "summary": self.summary,
            "results": [
                {
                    "id": r.id,
                    "goldenId": r.golden_id,
                    "faithfulness": r.faithfulness,
                    "answerRelevancy": r.answer_relevancy,
                    "status": r.status,
                    **({"errors": r.errors} if r.errors else {}),
                }
                for r in self.results
            ],
        }
        if self.estimated_cost_usd is not None:
            out["estimatedCostUsd"] = round(self.estimated_cost_usd, 4)
        return out


def _ragas_api_key() -> str:
    return (os.environ.get("RAGAS_API_KEY") or "").strip()


def _ensure_live_app() -> Any:
    """Flask test client with auth/firestore mocked; Gemini/Pinecone use env when set."""
    os.environ.setdefault("ALLOWED_ORIGINS", "https://client.example")
    os.environ.setdefault("CHAT_UID_RATE_CAPACITY", "100")
    os.environ.setdefault("CHAT_UID_RATE_REFILL_PER_SEC", "100")
    os.environ.setdefault("CHAT_IP_RATE_CAPACITY", "100")
    os.environ.setdefault("CHAT_IP_RATE_REFILL_PER_SEC", "100")

    if not (os.environ.get("PINECONE_API_KEY") or "").strip():
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

    return importlib.import_module("server.app")


def _contexts_from_chat_body(body: dict[str, Any]) -> list[str]:
    contexts: list[str] = []
    for source in body.get("sources") or []:
        if not isinstance(source, dict):
            continue
        snippet = source.get("snippet")
        if isinstance(snippet, str) and snippet.strip():
            contexts.append(snippet.strip())
    return contexts


def collect_live_responses(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Refresh `response` and `retrieved_contexts` via /api/chat-assistant (paid APIs)."""
    key = _ragas_api_key()
    if not key:
        raise RuntimeError("RAGAS_API_KEY is required for --live --ragas (Gemini chat)")

    logging.getLogger("server.routes.chat").setLevel(logging.WARNING)
    app_module = _ensure_live_app()
    client = app_module.app.test_client()
    updated: list[dict[str, Any]] = []

    # Route live chat Gemini calls through the eval key (isolated from prod GEMINI_API_KEY).
    with patch.dict(os.environ, {"GEMINI_API_KEY": key, "GOOGLE_API_KEY": key}, clear=False):
        updated = _collect_live_responses_with_client(rows, client)
    return updated


def _collect_live_responses_with_client(
    rows: list[dict[str, Any]], client: Any
) -> list[dict[str, Any]]:
    updated: list[dict[str, Any]] = []

    for row in rows:
        user_doc = row.get("fixture_user_doc") or {"challenges": [], "dailyNotes": {}}
        history = row.get("history") or []
        payload: dict[str, Any] = {"message": row["user_input"]}
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
                response = client.post(
                    "/api/chat-assistant",
                    json=payload,
                    headers={"Authorization": "Bearer eval-token"},
                )

        if response.status_code != 200:
            raise RuntimeError(f"live chat failed for {row['id']}: HTTP {response.status_code}")

        body = response.get_json() or {}
        reply = body.get("reply")
        if not isinstance(reply, str) or not reply.strip():
            raise RuntimeError(f"live chat returned empty reply for {row['id']}")

        contexts = _contexts_from_chat_body(body)
        if not contexts:
            contexts = list(row["retrieved_contexts"])

        updated.append(
            {
                **row,
                "response": reply.strip(),
                "retrieved_contexts": contexts,
                "live_meta": body.get("meta") or {},
            }
        )
    return updated


def _build_ragas_models(judge_model: str):
    from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
    from ragas.embeddings import LangchainEmbeddingsWrapper
    from ragas.llms import LangchainLLMWrapper

    key = _ragas_api_key()
    if not key:
        raise RuntimeError("RAGAS_API_KEY is required for --ragas")

    llm = LangchainLLMWrapper(
        ChatGoogleGenerativeAI(
            model=judge_model,
            temperature=0,
            google_api_key=key,
        )
    )
    embeddings = LangchainEmbeddingsWrapper(
        GoogleGenerativeAIEmbeddings(
            model=DEFAULT_EMBED_MODEL,
            google_api_key=key,
        )
    )
    return llm, embeddings


def _rows_to_ragas_dataset(rows: list[dict[str, Any]]):
    """Build RAGAS EvaluationDataset without HuggingFace Dataset.from_dict (Py 3.14 safe)."""
    from ragas.dataset_schema import EvaluationDataset

    return EvaluationDataset.from_list(
        [
            {
                "user_input": r["user_input"],
                "response": r["response"],
                "retrieved_contexts": r["retrieved_contexts"],
            }
            for r in rows
        ]
    )


def _estimate_gemini_cost_usd(token_usage: Any) -> float | None:
    if token_usage is None:
        return None
    input_tokens = getattr(token_usage, "input_tokens", None)
    output_tokens = getattr(token_usage, "output_tokens", None)
    if input_tokens is None and output_tokens is None:
        if isinstance(token_usage, dict):
            input_tokens = token_usage.get("input_tokens") or token_usage.get("prompt_tokens")
            output_tokens = token_usage.get("output_tokens") or token_usage.get("completion_tokens")
    if not isinstance(input_tokens, (int, float)) and not isinstance(output_tokens, (int, float)):
        return None
    in_t = float(input_tokens or 0)
    out_t = float(output_tokens or 0)
    return (in_t * _GEMINI_INPUT_USD_PER_M + out_t * _GEMINI_OUTPUT_USD_PER_M) / 1_000_000


def _attach_ragas_metrics(llm: Any, embeddings: Any) -> tuple[Any, Any]:
    from ragas.metrics import answer_relevancy, faithfulness
    from ragas.metrics.base import MetricWithEmbeddings, MetricWithLLM

    for metric in (faithfulness, answer_relevancy):
        if isinstance(metric, MetricWithLLM):
            metric.llm = llm
        if isinstance(metric, MetricWithEmbeddings):
            metric.embeddings = embeddings
    return faithfulness, answer_relevancy


def _score_ragas_sample(
    sample: Any,
    *,
    faithfulness_metric: Any,
    answer_relevancy_metric: Any,
) -> tuple[float, float]:
    """Score one row via sync RAGAS metrics (avoids evaluate() async on Python 3.14)."""
    f_score = float(faithfulness_metric.single_turn_score(sample))
    ar_score = float(answer_relevancy_metric.single_turn_score(sample))
    return f_score, ar_score


def _case_result_from_scores(
    row: dict[str, Any],
    *,
    f_score: float | None,
    ar_score: float | None,
    min_faithfulness: float,
    min_answer_relevancy: float,
) -> RagasCaseResult:
    errors: list[str] = []
    if f_score is None:
        errors.append("faithfulness: missing score")
    elif f_score < min_faithfulness:
        errors.append(f"faithfulness: {f_score:.3f} < {min_faithfulness}")
    if ar_score is None:
        errors.append("answer_relevancy: missing score")
    elif ar_score < min_answer_relevancy:
        errors.append(f"answer_relevancy: {ar_score:.3f} < {min_answer_relevancy}")

    return RagasCaseResult(
        id=row["id"],
        golden_id=row["golden_id"],
        faithfulness=f_score,
        answer_relevancy=ar_score,
        status="fail" if errors else "pass",
        errors=errors,
    )


def score_ragas_rows(
    rows: list[dict[str, Any]],
    *,
    judge_model: str = DEFAULT_JUDGE_MODEL,
    min_faithfulness: float = 0.5,
    min_answer_relevancy: float = 0.5,
) -> tuple[list[RagasCaseResult], float | None]:
    from ragas.dataset_schema import SingleTurnSample

    llm, embeddings = _build_ragas_models(judge_model)
    faithfulness_metric, answer_relevancy_metric = _attach_ragas_metrics(llm, embeddings)

    case_results: list[RagasCaseResult] = []
    for row in rows:
        sample = SingleTurnSample(
            user_input=row["user_input"],
            response=row["response"],
            retrieved_contexts=row["retrieved_contexts"],
        )
        f_score, ar_score = _score_ragas_sample(
            sample,
            faithfulness_metric=faithfulness_metric,
            answer_relevancy_metric=answer_relevancy_metric,
        )
        case_results.append(
            _case_result_from_scores(
                row,
                f_score=f_score,
                ar_score=ar_score,
                min_faithfulness=min_faithfulness,
                min_answer_relevancy=min_answer_relevancy,
            )
        )

    return case_results, None


def build_ragas_report(
    *,
    mode: str,
    dataset_path: Path,
    results: list[RagasCaseResult],
    judge_model: str,
    min_faithfulness: float,
    min_answer_relevancy: float,
    estimated_cost_usd: float | None,
) -> RagasReport:
    passed = sum(1 for r in results if r.status == "pass")
    failed = len(results) - passed
    faithfulness_vals = [r.faithfulness for r in results if r.faithfulness is not None]
    relevancy_vals = [r.answer_relevancy for r in results if r.answer_relevancy is not None]
    summary: dict[str, Any] = {
        "total": len(results),
        "passed": passed,
        "failed": failed,
        "meanFaithfulness": round(sum(faithfulness_vals) / len(faithfulness_vals), 4) if faithfulness_vals else None,
        "meanAnswerRelevancy": round(sum(relevancy_vals) / len(relevancy_vals), 4) if relevancy_vals else None,
    }
    rel = dataset_path.relative_to(REPO_ROOT) if dataset_path.is_relative_to(REPO_ROOT) else dataset_path
    return RagasReport(
        generated_at=datetime.now(timezone.utc).isoformat(),
        mode=mode,
        dataset=str(rel),
        judge_model=judge_model,
        min_faithfulness=min_faithfulness,
        min_answer_relevancy=min_answer_relevancy,
        summary=summary,
        results=results,
        estimated_cost_usd=estimated_cost_usd,
    )


def run_ragas_eval(
    *,
    dataset_path: Path | None = None,
    live: bool = False,
    judge_model: str = DEFAULT_JUDGE_MODEL,
    min_faithfulness: float = 0.5,
    min_answer_relevancy: float = 0.5,
) -> RagasReport:
    path = dataset_path or Path(__file__).resolve().parent / "ragas_recorded.jsonl"
    rows = load_ragas_rows(path)
    mode = "ragas"
    if live:
        rows = collect_live_responses(rows)
        mode = "live+ragas"

    results, cost = score_ragas_rows(
        rows,
        judge_model=judge_model,
        min_faithfulness=min_faithfulness,
        min_answer_relevancy=min_answer_relevancy,
    )
    return build_ragas_report(
        mode=mode,
        dataset_path=path,
        results=results,
        judge_model=judge_model,
        min_faithfulness=min_faithfulness,
        min_answer_relevancy=min_answer_relevancy,
        estimated_cost_usd=cost,
    )
