# DESIGN DOCUMENT

## 1. System Architecture

The system uses a simplified architecture where Next.js handles both the frontend and backend logic through API routes.

Next.js Application
        ↓
PostgreSQL + pgvector (Vector Storage)
        ↓
ResilientLLM
        ↓
LLM Providers (OpenAI / Anthropic / Ollama)

The goal is to keep the example minimal while demonstrating how ResilientLLM can be integrated into a Retrieval-Augmented Generation (RAG) system.

---

## 2. Architectural Responsibilities

### 2.1 Next.js Application

Next.js serves both as the frontend interface and backend API layer.

Responsibilities include:

- Providing UI for PDF upload
- Providing UI for document querying
- Extracting text from uploaded documents
- Chunking documents into smaller segments
- Generating embeddings for document chunks
- Storing embeddings in PostgreSQL using pgvector
- Generating query embeddings
- Performing vector similarity search (top-k retrieval)
- Constructing context prompts
- Calling ResilientLLM for response generation

Next.js API routes will implement the RAG logic.

---

### 2.2 PostgreSQL + pgvector

Used for:

- Storing document embeddings
- Performing vector similarity search
- Efficient nearest-neighbour retrieval for relevant context

---

### 2.3 ResilientLLM

ResilientLLM acts as the reliability layer for LLM requests.

Responsibilities:

- Handling API failures
- Automatic retries
- Exponential backoff
- Token bucket rate limiting
- Circuit breaker protection
- Multi-provider fallback

This ensures stable LLM responses even when providers experience failures or rate limits.

---

## 3. RAG Flow

1. User uploads a PDF document.
2. Next.js extracts text from the document.
3. The text is chunked into smaller segments.
4. Embeddings are generated for each chunk.
5. Embeddings are stored in PostgreSQL using pgvector.
6. User submits a question.
7. A query embedding is generated.
8. Top-k relevant chunks are retrieved using vector similarity search.
9. Retrieved chunks are used as context.
10. Context + query are sent to ResilientLLM.
11. ResilientLLM calls the LLM provider with resilience mechanisms.
12. Generated response is returned to the user.

---

## 4. Resilience Strategy

ResilientLLM ensures reliability through:

- Adaptive retries
- Exponential backoff
- Token bucket rate limiting
- Circuit breaker protection
- Multi-provider fallback

This improves reliability of the RAG system under unstable LLM provider conditions.

---

## 5. Design Principles

- Minimal architecture for easier maintenance
- Clear integration example for ResilientLLM
- Separation between retrieval logic and LLM resilience
- Production-inspired reliability patterns

---

## 6. Future Improvements

Possible future enhancements include:

- Streaming responses
- Observability dashboards
- Token usage analytics
- Multi-modal support
- Advanced RAG pipelines
