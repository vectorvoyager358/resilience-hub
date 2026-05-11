import { authedPostJsonOrThrow } from '../api/http';

/** Must match Pinecone index dimension (see server `embed_query_text`). */
const OUTPUT_DIMENSIONALITY = 768;

/**
 * Authenticated server-side embedding. The Gemini API key lives only on the
 * Flask backend; the browser never sees it. Requires a signed-in user.
 */
export async function embedTextToVector(text: string): Promise<number[]> {
  const data = await authedPostJsonOrThrow<{ vector?: unknown }>('/api/embed', { text });
  if (
    !Array.isArray(data.vector) ||
    data.vector.length !== OUTPUT_DIMENSIONALITY ||
    !data.vector.every((n) => typeof n === 'number')
  ) {
    throw new Error('embed: unexpected response shape');
  }
  return data.vector as number[];
}
