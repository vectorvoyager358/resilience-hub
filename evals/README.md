# Chat evaluation dataset

Golden cases for **Production RAG** quality checks on the Resilience Hub chat assistant.

Golden dataset scaffold ([#77](https://github.com/vectorvoyager358/resilience-hub/issues/77)) with **20+ routing and rules cases** ([#78](https://github.com/vectorvoyager358/resilience-hub/issues/78)). The offline runner ([#79](https://github.com/vectorvoyager358/resilience-hub/issues/79)) and CI gate ([#89](https://github.com/vectorvoyager358/resilience-hub/issues/89)) come later.

## Files

| File | Purpose |
|------|---------|
| `chat_golden.jsonl` | One JSON object per line — routing and grounding rules |

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

## How to run (future)

**Not wired yet.** Planned flow ([#79](https://github.com/vectorvoyager358/resilience-hub/issues/79)):

```bash
# Routing-only (no Gemini, no Pinecone) — cheap, CI-safe
python scripts/run_chat_eval.py

# Optional live smoke (costs API credits — local only)
python scripts/run_chat_eval.py --live
```

The runner will:

1. Load `evals/chat_golden.jsonl`
2. Assert `needs_semantic_retrieval(message)` matches `expect_rag`
3. Optionally assert rule tags (`forbid_stats_from_memories`, etc.) with mocked Firestore/Gemini

`tests/backend/test_chat.py` includes `RagRoutingTest` (unit cases) and `GoldenEvalDatasetTest` (loads this file and asserts `expect_rag` matches `needs_semantic_retrieval`). The golden file is the **portable, growable** set for eval tooling and nightly jobs ([#88](https://github.com/vectorvoyager358/resilience-hub/issues/88)).

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
| **Routing only** (planned default) | No | No | Every PR, local dev |
| **Mocked full chat** | No (stubbed) | No (stubbed) | CI pytest extension ([#80](https://github.com/vectorvoyager358/resilience-hub/issues/80)) |
| **Live end-to-end** | Yes | Yes | Manual smoke, optional nightly ([#82](https://github.com/vectorvoyager358/resilience-hub/issues/82)) |

Do **not** run live evals on every save — embedding + chat tokens add up quickly.

## Roadmap

| Step | Issue | Work |
|------|-------|------|
| 9 | [#77](https://github.com/vectorvoyager358/resilience-hub/issues/77) | This scaffold |
| 10 | [#78](https://github.com/vectorvoyager358/resilience-hub/issues/78) | Grow to 20+ cases |
| 11 | [#79](https://github.com/vectorvoyager358/resilience-hub/issues/79) | `scripts/run_chat_eval.py` |
| 12 | [#80](https://github.com/vectorvoyager358/resilience-hub/issues/80) | Extend pytest |

Related docs: [`docs/chat-assistant-flow.md`](../docs/chat-assistant-flow.md), [`docs/portfolio-roadmap.md`](../docs/portfolio-roadmap.md).
