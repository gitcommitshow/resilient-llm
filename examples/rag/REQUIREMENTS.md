1. Project Overview

ResilientRAG is a production-ready Retrieval-Augmented Generation (RAG) example built using ResilientLLM. The goal is to demonstrate how a RAG system can be designed with a fault-tolerant LLM orchestration layer to handle API failures, rate limits, and provider instability in real-world environments.

This example will showcase how resilience can be integrated into AI systems without modifying core RAG logic.

---

2. Tech Stack

Backend (Core Application)
- Django (Python)
- PostgreSQL
- pgvector extension (for vector embeddings storage)

LLM Resilience Layer
- Node.js microservice
- ResilientLLM (npm package)

Frontend
- Next.js (React framework)

---

3. Functional Requirements

1. Users must be able to upload PDF documents.
2. The system must extract text from uploaded documents.
3. The text must be chunked into manageable segments.
4. Each chunk must be converted into embeddings.
5. Embeddings must be stored in PostgreSQL using pgvector.
6. Users must be able to query the uploaded documents.
7. The system must retrieve top-k relevant chunks using vector similarity search.
8. Retrieved chunks must be sent to the ResilientLLM microservice for generation.
9. The system must return an LLM-generated response based on retrieved context.

---

4. Non-Functional Requirements

1. The LLM generation layer must:
   - Support automatic retries.
   - Implement exponential backoff.
   - Enforce rate limiting.
   - Support circuit breaker logic.
   - Allow multi-provider fallback.

2. The system must remain stable under:
   - Temporary provider outages.
   - API rate limit errors.
   - Network instability.

3. The architecture must clearly separate:
   - Retrieval logic (Django backend).
   - LLM resilience logic (Node.js microservice).

---

5. Other future features :

- Streaming responses.
- Multi-modal support (image/audio).
- Advanced agent workflows.
- Fine-tuning or training custom models.
- Complex workflow orchestration.


