# REQUIREMENTS

## Project Overview

ResilientRAG is an example implementation demonstrating how ResilientLLM can be integrated into a Retrieval-Augmented Generation (RAG) system

The goal is to showcase how LLM-based applications can remain reliable and stable in production environments despite provider failures, rate limits, or network instability

This example focuses on simplicity while illustrating how resilient LLM orchestration can improve real-world AI applications

---

## Tech Stack

Application Layer
- Next.js (Frontend + API routes)

Vector Database
- PostgreSQL
- pgvector extension for embedding storage

LLM Layer
- ResilientLLM (Node.js package)

---

## Functional Requirements

- Users must be able to upload PDF documents
- The system must extract text from uploaded documents
- Documents must be split into smaller chunks
- Embeddings must be generated for each chunk
- Embeddings must be stored in PostgreSQL using pgvector
- Users must be able to query the uploaded documents
- The system must retrieve the most relevant document chunks using vector similarity search
- Retrieved chunks must be passed to ResilientLLM as context
- The system must generate an answer based on the retrieved context

---

## Non-Functional Requirements

The system must demonstrate ResilientLLM capabilities including

- Automatic retries
- Exponential backoff
- Rate limiting
- Circuit breaker protection
- Multi-provider fallback

The system should remain stable under

- LLM provider failures
- API rate limit errors
- Temporary network instability

The project must include a Dockerfile to simplify environment setup and dependency management

The Docker environment should include

- PostgreSQL
- pgvector extension

This allows contributors to quickly start and test the project without manual installation of dependencies

---

## Future Improvements

Potential extensions include

- Streaming responses
- Multi-modal document support
- Observability and logging dashboards
- Advanced RAG pipelines Advanced RAG pipelines
