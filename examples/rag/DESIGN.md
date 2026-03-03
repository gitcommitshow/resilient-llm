1. System Architecture

The system follows a microservice-based architecture to ensure clear separation of concerns.

Frontend (Next.js)
        ↓
Django Backend (RAG Core Logic)
        ↓
PostgreSQL + pgvector (Vector Storage)
        ↓
Node.js Microservice (ResilientLLM)
        ↓
LLM Providers (OpenAI / Anthropic / Ollama)

---

2. Architectural Responsibilities

2.1 Next.js Frontend
- Provide UI for PDF upload.
- Provide UI for document querying.
- Display AI-generated responses.
- Communicate with Django backend via REST APIs.

---

2.2 Django Backend (Core RAG Engine)

Responsible for:

1. PDF upload handling.
2. Text extraction.
3. Chunking documents.
4. Generating embeddings.
5. Storing embeddings in PostgreSQL with pgvector.
6. Query embedding generation.
7. Vector similarity search (top-k retrieval).
8. Constructing context prompt.
9. Calling Node.js microservice for generation.

Django does NOT handle retry logic or provider fallback.

---

2.3 PostgreSQL + pgvector

Used for:

- Storing document embeddings.
- Performing cosine similarity search.
- Efficient top-k nearest neighbor retrieval.

---

2.4 Node.js Microservice (ResilientLLM Layer)

This service acts as a dedicated LLM Gateway.

Responsibilities:

- Accept context + user query.
- Invoke ResilientLLM.
- Handle:
  - Automatic retries.
  - Exponential backoff.
  - Token bucket rate limiting.
  - Circuit breaker.
  - Multi-provider fallback.
- Return stable LLM responses.

This service contains no retrieval logic and no database access.

---

3. RAG Flow

1. User uploads PDF.
2. Django extracts text.
3. Text is chunked into segments.
4. Embeddings are generated.
5. Embeddings stored in PostgreSQL (pgvector).
6. User submits a query.
7. Query embedding is generated.
8. Top-k relevant chunks are retrieved.
9. Context is constructed.
10. Context + query sent to Node.js ResilientLLM service.
11. ResilientLLM ensures reliable generation.
12. Response returned to frontend.

---

4. Resilience Strategy

The system ensures reliability through:

- Adaptive retries (configurable).
- Exponential backoff.
- Respecting retry-after headers.
- Token bucket rate limiting.
- Circuit breaker mechanism.
- Multi-provider fallback (e.g., OpenAI → Anthropic → Ollama).

This ensures high availability even under unstable LLM provider conditions.

---

5. Design Principles

- Separation of concerns.
- Microservice isolation for resilience layer.
- Database-backed vector storage.
- Production-oriented system design.
- Clear boundary between retrieval and generation.

---

6. Future Improvements (Optional)

- Streaming response support.
- Observability and logging dashboard.
- Token usage analytics.
- Health monitoring for LLM providers.
