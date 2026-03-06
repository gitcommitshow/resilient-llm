# RAG Example (Resilient LLM)

This example demonstrates a **Retrieval Augmented Generation (RAG)** system built using the **resilient-llm framework**.

It combines:

- Next.js (frontend + backend API)
- PostgreSQL + pgvector (vector database)
- Docker (database infrastructure)
- LangChain (RAG orchestration)

The goal of this example is to show how to build a **resilient RAG pipeline** that retrieves relevant context before querying an LLM.

---

# Architecture

High level pipeline:

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
Send Context + Query to LLM
   ↓
Return Generated Response
```

---

# Project Structure

```
examples/rag
│
├── db/
│   └── init.sql
│
├── docker/
│   └── docker-compose.yml
│
├── scripts/
│   ├── loadDocs.js
│   ├── chunkDocs.js
│   └── storeVectors.js
│
├── web/
│   ├── app/
│   ├── lib/
│   ├── public/
│   ├── package.json
│   └── next.config.mjs
│
├── DESIGN.md
└── REQUIREMENTS.md
```

---

# Folder Explanation

## db/

Contains the **database schema and pgvector setup**.

`init.sql` initializes:

- pgvector extension
- documents table
- vector index for similarity search

---

## docker/

Contains the **Docker setup** for running infrastructure locally.

`docker-compose.yml` runs:

- PostgreSQL
- pgvector

---

## scripts/

Handles the **document ingestion pipeline**.

`loadDocs.js`

Loads documents into the system.

`chunkDocs.js`

Splits documents into smaller chunks suitable for embeddings.

`storeVectors.js`

Generates embeddings and stores them in PostgreSQL using pgvector.

Pipeline:

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

## web/

The **Next.js application**.

Responsibilities:

- UI for interacting with the RAG system
- API routes for querying the RAG pipeline
- LLM interaction logic

Important folders:

### app/

Contains Next.js pages and API routes.

Example endpoint:

```
/api/rag/query
```

### lib/

Contains the **RAG pipeline implementation**, including:

- embedding generation
- vector retrieval
- LLM interaction

---

# Setup

## 1 Start Database

Navigate to the docker folder:

```
cd examples/rag/docker
```

Start the database:

```
docker-compose up -d
```

This starts PostgreSQL with pgvector enabled.

---

## 2 Install Web App Dependencies

```
cd examples/rag/web
npm install
```

---

## 3 Configure Environment Variables

Create:

```
examples/rag/web/.env.local
```

Example:

```
DATABASE_URL=postgresql://rag_user:rag_password@localhost:5433/rag_db
OPENAI_API_KEY=your_api_key_here
```

---

## 4 Run Ingestion Pipeline

From the `scripts` folder run:

```
node loadDocs.js
node chunkDocs.js
node storeVectors.js
```

This will:

1. Load documents
2. Chunk them
3. Generate embeddings
4. Store vectors in PostgreSQL

---

## 5 Run the Web Application

```
cd examples/rag/web
npm run dev
```

Open in your browser:

```
http://localhost:3000
```

---

# RAG Workflow

The system follows a standard **Retrieval Augmented Generation pipeline**:

1. User submits a query
2. Query is converted to an embedding
3. Vector similarity search retrieves relevant chunks
4. Retrieved context is added to the prompt
5. LLM generates the final answer

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

Potential improvements include:

- Document upload interface
- Streaming LLM responses
- Multi-model fallback routing
- Observability and tracing
