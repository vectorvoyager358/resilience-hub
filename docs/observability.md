# Observability

## Chat assistant (`/api/chat-assistant`)

### Response `meta`

Every successful chat response includes a `meta` object (also mirrored into Langfuse when tracing is on):


| Field              | Meaning                                           |
| ------------------ | ------------------------------------------------- |
| `promptVersion`    | Loaded system prompt template id (e.g. `chat_v1`) |
| `ragRequested`     | Intent router asked for semantic retrieval        |
| `usedRag`          | Numbered memory block was included in the prompt  |
| `groundingMode`    | `rag` or `facts_only`                             |
| `emptyRetrieval`   | `ragRequested` and Pinecone returned **0** hits   |
| `sourceCount`      | Citations returned in `sources[]`                 |
| `retrieveCount`    | Pinecone hits before rerank / prompt slice        |
| `rerankEnabled`    | Cohere rerank re-ordered hits this request        |
| `rerankConfigured` | `COHERE_API_KEY` + `RERANK_ENABLED` present       |
| `citationsEnabled` | Model was instructed to use `[n]` markers         |

### Quality proxy metrics (#85)

Use response `meta` and the structured log line `chat_assistant_quality` (INFO) to monitor grounding health without full RAGAS on every request.

| Metric | Definition | Source |
|--------|------------|--------|
| **Empty retrieval rate** | Share of RAG-routed requests with no Pinecone hits | `emptyRetrieval=true` when `ragRequested=true` |
| **RAG grounding rate** | Share of RAG-routed requests that used indexed memories | `usedRag=true` |
| **Facts-only fallback rate** | RAG requested but prompt used facts-only grounding | `groundingMode=facts_only` and `ragRequested=true` |
| **Citation rate** | Responses that returned `sources[]` | `sourceCount > 0` |

**Example log line** (Cloud Logging / local):

```text
chat_assistant_quality uid=… rag_requested=True empty_retrieval=True grounding_mode=facts_only source_count=0 retrieve_count=0 …
```

**Log-based aggregation (GCP):** filter `textPayload:chat_assistant_quality` or parse JSON if you add a log sink; compute `empty_retrieval=true` / `rag_requested=true` over a window for empty-retrieval rate.

**Langfuse:** `emptyRetrieval` and related fields are copied to trace metadata when tracing is enabled.


### Server logs

Controlled via `.env` (see `.env.example`):

- `LOG_LEVEL` — e.g. `DEBUG` for full prompt text in logs
- `CHAT_LOG_PROMPT_PREVIEW_CHARS` — log first N chars of assembled prompt at INFO
- `CHAT_LOG_FULL_PROMPT=1` — log entire prompt at INFO (**PII risk**)

### Langfuse tracing

When `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` are set (and `LANGFUSE_DISABLED` is not truthy), each chat request after auth + rate limit creates **one trace**:

- **User**: Firebase UID (not email)
- **Input**: SHA-256 digest + char length of user message (no raw text)
- **Pipeline metadata**: `ragRequested`, `usedRag`, `promptVersion`, `groundingMode`, counts, model id
- **Generation span**: `gemini-chat` with model name, prompt char count, reply char count + reply digest

Full prompts and message text are **never** sent to Langfuse.

Set `LANGFUSE_HOST` for self-hosted Langfuse; defaults to Langfuse Cloud.

Implementation: `server/langfuse_tracing.py`, wired in `server/routes/chat.py`.

### Per-stage latency spans (#84)

When Langfuse tracing is enabled, each chat trace includes child **span** observations with wall-clock duration in `output.durationMs`:

| Span | When |
|------|------|
| `firestore-load` | Firestore `users/{uid}` read |
| `context-build` | `build_assistant_facts` + `prompt_context_json` |
| `embed-query` | Gemini query embedding (RAG only) |
| `pinecone-query` | Pinecone vector search (RAG only) |
| `cohere-rerank` | Cohere rerank over matches (RAG only) |
| `prompt-assemble` | Versioned system prompt render |
| `gemini-chat` | Gemini generation (generation observation) |

**Langfuse UI:** open a trace → timeline shows each span’s latency; compare stages across requests.

**Percentiles (p50 / p95):** Langfuse **Metrics** and observation analytics aggregate latency by observation `name` when enough volume exists — no custom p95 code in-app. For ad-hoc debugging, set `CHAT_LOG_STAGE_TIMINGS=1` to emit `chat_assistant stage=… duration_ms=…` in Cloud Run / local logs (works even when Langfuse is off).