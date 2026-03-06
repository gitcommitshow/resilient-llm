-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Documents table to store text chunks and embeddings
CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    embedding VECTOR(1536)
);

-- Index for fast vector similarity search
CREATE INDEX IF NOT EXISTS documents_embedding_idx
ON documents
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
