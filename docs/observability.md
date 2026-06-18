# Observability

## Chat assistant (`/api/chat-assistant`)

### Response `meta`

Every successful chat response includes a `meta` object (also mirrored into Langfuse when tracing is on):


| Field              | Meaning                                           |
| ------------------ | ------------------------------------------------- |
| `promptVersion`    | Loaded system prompt template id (e.g. `chat_v1`) |
| `ragRequested`     | Intent router asked for semantic retrieval        |
| `usedRag`          | Numbered memory block was included in the prompt  |
| `groundingMode`    | `facts_only`, `rag`, or `empty_rag`               |
| `sourceCount`      | Citations returned in `sources[]`                 |
| `retrieveCount`    | Pinecone hits before rerank / prompt slice        |
| `rerankEnabled`    | Cohere rerank re-ordered hits this request        |
| `rerankConfigured` | `COHERE_API_KEY` + `RERANK_ENABLED` present       |
| `citationsEnabled` | Model was instructed to use `[n]` markers         |


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