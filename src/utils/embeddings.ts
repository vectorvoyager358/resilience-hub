import {
  GoogleGenerativeAI,
  TaskType,
  type EmbedContentRequest,
} from '@google/generative-ai';

const MODEL = 'gemini-embedding-001';

/** Must match Pinecone index dimension (see server `embed_query_text` / delete dummy vector). */
const OUTPUT_DIMENSIONALITY = 768;

type Embed768Request = EmbedContentRequest & { outputDimensionality: number };

export async function embedTextToVector(text: string): Promise<number[]> {
  const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || '');
  const model = genAI.getGenerativeModel({ model: MODEL });
  const request: Embed768Request = {
    content: { role: 'user', parts: [{ text }] },
    taskType: TaskType.RETRIEVAL_DOCUMENT,
    outputDimensionality: OUTPUT_DIMENSIONALITY,
  };
  const result = await model.embedContent(request);
  return Array.from(result.embedding.values);
}
