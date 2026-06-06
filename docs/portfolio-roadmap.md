# Portfolio roadmap (GitHub issues)

Step-by-step work for **Portfolio Project 1** (production RAG) and **Project 3** (observability) on Resilience Hub. Project 2 (local SLM) lives in a separate repo.

**Index issue:** [#90 — Roadmap](https://github.com/vectorvoyager358/resilience-hub/issues/90)

**Milestones:**

- [Production RAG](https://github.com/vectorvoyager358/resilience-hub/milestone/1)
- [Observability](https://github.com/vectorvoyager358/resilience-hub/milestone/2)

## Production RAG — do in order

| Step | Issue | Title |
|------|-------|--------|
| 1 | [#70](https://github.com/vectorvoyager358/resilience-hub/issues/70) | Return structured `sources[]` in chat API |
| 2 | [#71](https://github.com/vectorvoyager358/resilience-hub/issues/71) | Env-configurable `retrieve_k` / `prompt_k` |
| 3 | [#72](https://github.com/vectorvoyager358/resilience-hub/issues/72) | Versioned prompt files + `promptVersion` |
| 4 | [#73](https://github.com/vectorvoyager358/resilience-hub/issues/73) | Cross-encoder reranking |
| 5 | [#74](https://github.com/vectorvoyager358/resilience-hub/issues/74) | Numbered citations `[1]`, `[2]` |
| 6 | [#75](https://github.com/vectorvoyager358/resilience-hub/issues/75) | Facts-only when RAG empty |
| 7 | [#91](https://github.com/vectorvoyager358/resilience-hub/issues/91) | Document chunking policy → [`docs/rag-indexing.md`](rag-indexing.md) |
| 8 | [#76](https://github.com/vectorvoyager358/resilience-hub/issues/76) | Chunk long notes on upsert → [`docs/rag-indexing.md`](rag-indexing.md) |
| 9 | [#77](https://github.com/vectorvoyager358/resilience-hub/issues/77) | Scaffold `evals/` |
| 10 | [#78](https://github.com/vectorvoyager358/resilience-hub/issues/78) | 20+ golden eval cases |
| 11 | [#79](https://github.com/vectorvoyager358/resilience-hub/issues/79) | Offline eval runner (mocked) |
| 12 | [#80](https://github.com/vectorvoyager358/resilience-hub/issues/80) | Extend pytest |
| — | [#82](https://github.com/vectorvoyager358/resilience-hub/issues/82) | RAGAS nightly (optional) |
| — | [#81](https://github.com/vectorvoyager358/resilience-hub/issues/81) | BM25 hybrid spike (optional) |

## Observability — after Production RAG foundations

| Step | Issue | Title |
|------|-------|--------|
| 1 | [#83](https://github.com/vectorvoyager358/resilience-hub/issues/83) | Langfuse tracing |
| 2 | [#84](https://github.com/vectorvoyager358/resilience-hub/issues/84) | Per-stage latency spans |
| 3 | [#85](https://github.com/vectorvoyager358/resilience-hub/issues/85) | Quality proxy `meta` fields |
| 4 | [#86](https://github.com/vectorvoyager358/resilience-hub/issues/86) | `docs/observability.md` runbook |
| 5 | [#87](https://github.com/vectorvoyager358/resilience-hub/issues/87) | GitHub Actions: pytest on PR |
| 6 | [#88](https://github.com/vectorvoyager358/resilience-hub/issues/88) | Nightly eval workflow |
| 7 | [#89](https://github.com/vectorvoyager358/resilience-hub/issues/89) | CI fail on metric regression |

Labels: `Production RAG`, `Observability`, `rag`, `evals`.
