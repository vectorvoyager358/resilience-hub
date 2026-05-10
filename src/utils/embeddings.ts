import { auth } from '../services/firebase';
import { apiUrl } from './apiBase';

/** Must match Pinecone index dimension (see server `embed_query_text`). */
const OUTPUT_DIMENSIONALITY = 768;

/**
 * Authenticated server-side embedding. The Gemini API key lives only on the
 * Flask backend; the browser never sees it. Requires a signed-in user.
 */
export async function embedTextToVector(text: string): Promise<number[]> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('embed: not signed in');
  }
  const idToken = await currentUser.getIdToken();

  const response = await fetch(apiUrl('/api/embed'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`embed failed (${response.status}): ${detail.slice(0, 200)}`);
  }

  const data = (await response.json()) as { vector?: unknown };
  if (
    !Array.isArray(data.vector) ||
    data.vector.length !== OUTPUT_DIMENSIONALITY ||
    !data.vector.every((n) => typeof n === 'number')
  ) {
    throw new Error('embed: unexpected response shape');
  }
  return data.vector as number[];
}
