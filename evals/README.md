# Chat evaluation dataset

Golden cases for **Production RAG** quality checks on the Resilience Hub chat assistant.

Golden dataset ([#77](https://github.com/vectorvoyager358/resilience-hub/issues/77), [#78](https://github.com/vectorvoyager358/resilience-hub/issues/78)) with **offline runner** ([#79](https://github.com/vectorvoyager358/resilience-hub/issues/79)). CI metric gates ([#89](https://github.com/vectorvoyager358/resilience-hub/issues/89)) come later.

## Files

| File | Purpose |
|------|---------|
| `chat_golden.jsonl` | One JSON object per line — routing and grounding rules |
| `dataset.py` | Load / validate JSONL rows |
| `runner.py` | Routing + optional mocked chat checks |
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
```

Exit code **0** = all cases passed; **1** = failures; **2** = invalid flags (e.g. `--live` not implemented).

The runner:

1. Loads `evals/chat_golden.jsonl`
2. Asserts `needs_semantic_retrieval(message)` matches `expect_rag`
3. Validates rule tags (`forbid_stats_from_memories` vs `expect_rag`)
4. With `--mock-chat`: POSTs each case to `/api/chat-assistant` with mocked Firestore, Pinecone, and Gemini; checks `meta.ragRequested`, `usedRag`, and `groundingMode` for RAG rows with empty retrieval

Writes a JSON report under `evals/reports/` (timestamped by default).

`tests/backend/test_chat.py` includes `GoldenEvalDatasetTest` (pytest/unittest parity with routing checks). `tests/backend/test_run_chat_eval.py` smoke-tests the CLI script.

### Current coverage (30 rows)

| Tag | Count | Description |
|-----|-------|-------------|
| `rag-*` | 16 | Memory / journal / note recall → `expect_rag: true` |
| `facts-*` | 12 | Counts, durations, breakdowns → `expect_rag: false` + `forbid_stats_from_memories` |
| `general-*` | 2 | Coaching with no RAG or aggregate stats |

One row (`facts-fixture-001`) includes a synthetic `fixture_user_doc` for future end-to-end prompt checks.

## Cost warnings

| Mode | Gemini | Pinecone | When to use |
|------|--------|----------|-------------|
| **Routing only** (`npm run eval:chat`) | No | No | Every PR, local dev |
| **Mock chat** (`npm run eval:chat:mock`) | No (stubbed) | No (stubbed) | Deeper meta checks without API cost |
| **Live end-to-end** | Yes | Yes | Not implemented — manual smoke only ([#82](https://github.com/vectorvoyager358/resilience-hub/issues/82)) |

Do **not** run live evals on every save — embedding + chat tokens add up quickly.

## Roadmap

| Step | Issue | Work |
|------|-------|------|
| 9 | [#77](https://github.com/vectorvoyager358/resilience-hub/issues/77) | `evals/` scaffold |
| 10 | [#78](https://github.com/vectorvoyager358/resilience-hub/issues/78) | 20+ golden cases |
| 11 | [#79](https://github.com/vectorvoyager358/resilience-hub/issues/79) | `scripts/run_chat_eval.py` |
| 12 | [#80](https://github.com/vectorvoyager358/resilience-hub/issues/80) | Extend unittest (`sources[]`, prompt assembly) |

Related docs: [`docs/chat-assistant-flow.md`](../docs/chat-assistant-flow.md), [`docs/portfolio-roadmap.md`](../docs/portfolio-roadmap.md).
