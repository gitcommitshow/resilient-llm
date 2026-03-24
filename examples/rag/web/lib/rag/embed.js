import { OllamaEmbeddings } from "@langchain/ollama";

/**
 * Initialize embedding model
 * Must match the same model used during ingestion
 */
const embeddings = new OllamaEmbeddings({
  model: "nomic-embed-text",
});

/**
 * Generate embedding vector for input text
 * @param {string} text
 * @returns {Promise<number[]>}
 */
export async function createEmbedding(text) {
  const vector = await embeddings.embedQuery(text);
  return vector;
}