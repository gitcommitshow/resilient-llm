# RAG Example (ResilientLLM)

This example demonstrates a **Retrieval Augmented Generation (RAG)** system built using **resilient-llm**.

The goal is to show how a RAG pipeline can retrieve relevant context from a vector database and generate answers using an LLM while leveraging **ResilientLLM for reliable LLM interactions**.

---

# Architecture

High level pipeline

```
User Query
   ↓
Next.js API
   ↓
Generate Query Embedding
   ↓
Vector Search (pgvector)
   ↓
Retrieve Relevant Context
   ↓
Send Context + Query to ResilientLLM
   ↓
LLM Provider
   ↓
Return Generated Response
```

---

# Project Structure

```
examples/rag
│
├── data
│
├── db
│   └── init.sql
│
├── docker
│   └── docker-compose.yml
│
├── scripts
│   ├── loadDocs.js
│   ├── chunkDocs.js
│   ├── storeVectors.js
│   └── db.js
│
├── web
│   ├── app
│   ├── lib
│   ├── public
│   ├── package.json
│   └── next.config.mjs
│
├── DESIGN.md
├── REQUIREMENTS.md
└── README.md
```

---

# Folder Overview

## db

Contains the **database schema and pgvector setup**.

`init.sql` initializes

- pgvector extension
- documents table
- vector index for similarity search

---

## docker

Contains Docker configuration used to run the database locally.

`docker-compose.yml` runs

- PostgreSQL
- pgvector extension

This simplifies local development and ensures consistent database setup.

---

## scripts

Implements the **document ingestion pipeline**.

### loadDocs.js

Loads documents from the `data` directory.

### chunkDocs.js

Splits documents into smaller chunks using LangChain's `RecursiveCharacterTextSplitter`.

### storeVectors.js

Generates embeddings and stores them in PostgreSQL using pgvector.

Pipeline

```
Documents
   ↓
Chunking
   ↓
Embedding Generation
   ↓
Vector Storage
```

---

## web

Contains the **Next.js application**.

Responsibilities

- User interface for querying the RAG system
- API routes for interacting with the RAG pipeline
- Integration with ResilientLLM

### app

Contains Next.js pages and API routes.

Example endpoint

```
/api/rag/query
```

### lib

Contains RAG related logic

- embedding generation
- vector similarity search
- context construction
- LLM interaction

---

# Setup

## 1 Start Database

Navigate to the docker directory

```
cd examples/rag/docker
```

Start the database

```
docker-compose up -d
```

This launches PostgreSQL with pgvector enabled.

---

## 2 Install Web Dependencies

```
cd examples/rag/web
npm install
```

---

## 3 Configure Environment Variables

Create the file

```
examples/rag/web/.env.local
```

Example configuration

```
DATABASE_URL=postgresql://rag_user:rag_password@localhost:5433/rag_db
OPENAI_API_KEY=your_api_key
```

---

## 4 Run the Document Ingestion Pipeline

From the `scripts` directory

```
node loadDocs.js
node chunkDocs.js
node storeVectors.js
```

This pipeline

- loads documents
- chunks text into smaller segments
- generates embeddings
- stores vectors in PostgreSQL

---

## 5 Start the Web Application

```
cd examples/rag/web
npm run dev
```

Open

```
http://localhost:3000
```

---

# RAG Workflow

The system follows a standard RAG pipeline

1. User submits a query
2. Query is converted to an embedding
3. Vector similarity search retrieves relevant document chunks
4. Retrieved context is added to the prompt
5. ResilientLLM sends the prompt to an LLM provider
6. Generated response is returned to the user

---

# Technologies Used

- Next.js
- PostgreSQL
- pgvector
- Docker
- LangChain
- resilient-llm

---

# Future Improvements

Potential improvements include

- document upload interface
- streaming responses
- multi provider fallback strategies
- observability and tracing
