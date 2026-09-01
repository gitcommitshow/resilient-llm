# DESIGN DOCUMENT

## System Architecture

The system uses a simplified architecture where Next.js handles both the frontend and backend logic through API routes

Next.js Application
        ↓
PostgreSQL + pgvector (Vector Storage)
        ↓
ResilientLLM
        ↓
LLM Providers (OpenAI / Anthropic / Ollama)

The goal is to keep the example minimal while demonstrating how ResilientLLM can be integrated into a Retrieval-Augmented Generation (RAG) system

---

## Architectural Responsibilities

### Next.js Application

Next.js serves both as the frontend interface and backend API layer

Responsibilities include

- Providing UI for PDF upload
- Providing UI for document querying
- Extracting text from uploaded documents
- Chunking documents into smaller segments
- Generating embeddings for document chunks
- Storing embeddings in PostgreSQL using pgvector
- Generating query embeddings
- Performing vector similarity search for top-k retrieval
- Constructing context prompts
- Calling ResilientLLM for response generation

Next.js API routes implement the RAG logic

---

### PostgreSQL + pgvector

Used for

- Storing document embeddings
- Performing vector similarity search
- Efficient nearest neighbour retrieval for relevant context

---

### ResilientLLM

ResilientLLM acts as the reliability layer for LLM requests

Responsibilities include

- Handling API failures
- Automatic retries
- Exponential backoff
- Token bucket rate limiting
- Circuit breaker protection
- Multi-provider fallback

This ensures stable LLM responses even when providers experience failures or rate limits

---

## RAG Flow

- User uploads a PDF document
- Next.js extracts text from the document
- The text is chunked into smaller segments
- Embeddings are generated for each chunk
- Embeddings are stored in PostgreSQL using pgvector
- User submits a question
- A query embedding is generated
- Top-k relevant chunks are retrieved using vector similarity search
- Retrieved chunks are used as context
- Context and query are sent to ResilientLLM
- ResilientLLM calls the LLM provider with resilience mechanisms
- Generated response is returned to the user

---

## Resilience Strategy

ResilientLLM ensures reliability through

- Adaptive retries
- Exponential backoff
- Token bucket rate limiting
- Circuit breaker protection
- Multi-provider fallback

This improves reliability of the RAG system under unstable LLM provider conditions

---

## Design Principles

- Minimal architecture for easier maintenance
- Clear integration example for ResilientLLM
- Separation between retrieval logic and LLM resilience
- Production inspired reliability patterns

---

## Future Improvements

Possible future enhancements include

- Streaming responses
- Observability dashboards
- Token usage analytics
- Multi-modal support
- Advanced RAG pipelines
