import { GoogleGenerativeAI } from '@google/generative-ai';

const MODEL = 'gemini-embedding-001';

export async function embedTextToVector(text: string): Promise<number[]> {
  const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || '');
  const model = genAI.getGenerativeModel({ model: MODEL });
  const result = await model.embedContent(text);
  return Array.from(result.embedding.values);
}
