# Chat evaluation dataset

Golden cases for **Production RAG** quality checks on the Resilience Hub chat assistant.

Golden dataset ([#77](https://github.com/vectorvoyager358/resilience-hub/issues/77), [#78](https://github.com/vectorvoyager358/resilience-hub/issues/78)) with **offline runner** ([#79](https://github.com/vectorvoyager358/resilience-hub/issues/79)). CI metric gates ([#89](https://github.com/vectorvoyager358/resilience-hub/issues/89)) come later.

## Files

| File | Purpose |
|------|---------|
| `chat_golden.jsonl` | One JSON object per line — routing and grounding rules |
| `dataset.py` | Load / validate JSONL rows |
| `runner.py` | Routing + optional mocked chat checks |
| `ragas_recorded.jsonl` | Subset with recorded `contexts` + `answer` for RAGAS ([#82](https://github.com/vectorvoyager358/resilience-hub/issues/82)) |
| `ragas_dataset.py` | Load / validate RAGAS fixture JSONL |
| `ragas_runner.py` | RAGAS faithfulness + answer relevancy scoring |
| `reports/` | JSON reports from `scripts/run_chat_eval.py` (gitignored) |

## Dataset format (JSONL)

Each line is a single JSON object. Required fields:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Stable case id (e.g. `rag-001`, `facts-002`) |
| `message` | string | User message sent to `/api/chat-assistant` |
| `history` | array | Prior turns: `[{"role":"user"\|"assistant","content":"..."}]` (maps to API `conversationHistory`) |
| `expect_rag` | boolean | Whether `needs_semantic_retrieval(message)` should be **true** |
| `notes` | string | Human-readable intent of the case (for reviewers, not checked by runner) |

Optional fields (used by later eval steps):

| Field | Type | Description |
|-------|------|-------------|
| `forbid_stats_from_memories` | boolean | When `expect_rag` is false: counts, durations, and breakdowns must come from **authoritative facts** in the prompt, not from Pinecone memories ([#78](https://github.com/vectorvoyager358/resilience-hub/issues/78)) |
| `expect_grounding_mode` | string | Future: `"facts_only"` when RAG was requested but Pinecone returned no matches ([#75](https://github.com/vectorvoyager358/resilience-hub/issues/75)) |
| `fixture_user_doc` | object | Future: synthetic Firestore `users/{uid}` snapshot for end-to-end prompt checks ([#78](https://github.com/vectorvoyager358/resilience-hub/issues/78)) |

### Example row

```json
{
  "id": "rag-001",
  "message": "What did I write about my setbacks last time?",
  "history": [],
  "expect_rag": true,
  "notes": "Memory-style recall; should route to semantic retrieval."
}
```

## How to run

From repo root (uses `.venv` if present):

```bash
# Routing-only (no Gemini, no Pinecone) — default, CI-safe
python scripts/run_chat_eval.py
# or
npm run eval:chat

# Routing + stubbed /api/chat-assistant meta checks (still no live APIs)
python scripts/run_chat_eval.py --mock-chat
# or
npm run eval:chat:mock

# Custom report path + per-case output
python scripts/run_chat_eval.py --mock-chat --verbose --report evals/reports/latest.json

# RAGAS nightly (paid Gemini judge — install dev deps first)
pip install -r requirements-dev.txt
# Set RAGAS_API_KEY in .env (see .env.example) — separate from production GEMINI_API_KEY
python scripts/run_chat_eval.py --ragas
# or
npm run eval:chat:ragas

# Refresh answers via live chat, then score (more API cost)
python scripts/run_chat_eval.py --live --ragas
# or
npm run eval:chat:ragas:live
```

Exit code **0** = all cases passed; **1** = failures; **2** = invalid flags or missing dev deps.

The runner:

1. Loads `evals/chat_golden.jsonl`
2. Asserts `needs_semantic_retrieval(message)` matches `expect_rag`
3. Validates rule tags (`forbid_stats_from_memories` vs `expect_rag`)
4. With `--mock-chat`: POSTs each case to `/api/chat-assistant` with mocked Firestore, Pinecone, and Gemini; checks `meta.ragRequested`, `usedRag`, and `groundingMode` for RAG rows with empty retrieval
5. With `--ragas`: scores `evals/ragas_recorded.jsonl` with **faithfulness** + **answer relevancy** (RAGAS + Gemini judge)
6. With `--live --ragas`: calls live `/api/chat-assistant` for each RAGAS row before scoring

Writes a JSON report under `evals/reports/` (timestamped by default: `chat_eval_*` or `ragas_eval_*`).

`tests/backend/test_chat.py` includes `GoldenEvalDatasetTest` (pytest/unittest parity with routing checks). `tests/backend/test_run_chat_eval.py` smoke-tests the CLI script. `tests/backend/test_ragas_eval.py` covers RAGAS dataset + mocked scoring.

### Current coverage (30 rows)

| Tag | Count | Description |
|-----|-------|-------------|
| `rag-*` | 16 | Memory / journal / note recall → `expect_rag: true` |
| `facts-*` | 12 | Counts, durations, breakdowns → `expect_rag: false` + `forbid_stats_from_memories` |
| `general-*` | 2 | Coaching with no RAG or aggregate stats |

One row (`facts-fixture-001`) includes a synthetic `fixture_user_doc` for future end-to-end prompt checks.

### RAGAS subset (`ragas_recorded.jsonl`) — 6 rows

Linked to `rag-*` golden ids. Each row has recorded `retrieved_contexts` and `response` for offline scoring (no Pinecone needed for `--ragas` alone).

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | RAGAS case id (e.g. `ragas-001`) |
| `golden_id` | string | Matching row in `chat_golden.jsonl` |
| `user_input` | string | User question |
| `retrieved_contexts` | array | Retrieved memory chunks shown to the model |
| `response` | string | Assistant reply to score |
| `notes` | string | Reviewer notes (not checked) |

Optional: `fixture_user_doc`, `history` — used by `--live --ragas` when refreshing answers.

## Cost warnings

| Mode | Gemini | Pinecone | When to use |
|------|--------|----------|-------------|
| **Routing only** (`npm run eval:chat`) | No | No | Every PR, local dev |
| **Mock chat** (`npm run eval:chat:mock`) | No (stubbed) | No (stubbed) | Deeper meta checks without API cost |
| **RAGAS recorded** (`npm run eval:chat:ragas`) | Yes (judge + embed) | No | Nightly quality benchmark on 6 cases (~$0.10–0.35/run) |
| **RAGAS live** (`npm run eval:chat:ragas:live`) | Yes (chat + judge) | Optional | Refresh answers before scoring; set `RAGAS_API_KEY` (+ `PINECONE_*` for real retrieval) |

**Paid API warning:** `--ragas` and `--live --ragas` call **Gemini** via `RAGAS_API_KEY` (`gemini-2.5-flash-lite` judge by default). Install nightly deps with `pip install -r requirements-dev.txt` — not included in production `requirements.txt`.

Do **not** run RAGAS on every save — judge LLM calls add up. Use nightly or pre-release only ([#82](https://github.com/vectorvoyager358/resilience-hub/issues/82)).

## Roadmap

| Step | Issue | Work |
|------|-------|------|
| 9 | [#77](https://github.com/vectorvoyager358/resilience-hub/issues/77) | `evals/` scaffold |
| 10 | [#78](https://github.com/vectorvoyager358/resilience-hub/issues/78) | 20+ golden cases |
| 11 | [#79](https://github.com/vectorvoyager358/resilience-hub/issues/79) | `scripts/run_chat_eval.py` |
| 12 | [#80](https://github.com/vectorvoyager358/resilience-hub/issues/80) | Extend unittest (`sources[]`, prompt assembly) |
| 13 | [#82](https://github.com/vectorvoyager358/resilience-hub/issues/82) | RAGAS nightly (`--ragas` on `ragas_recorded.jsonl`) |

Related docs: [`docs/chat-assistant-flow.md`](../docs/chat-assistant-flow.md), [`docs/portfolio-roadmap.md`](../docs/portfolio-roadmap.md).
