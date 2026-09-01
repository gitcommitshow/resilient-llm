import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { OllamaEmbeddings } from "@langchain/ollama";
import fs from "fs";
import path from "path";
import { pool } from "./db.js";

const DATA_DIR = path.join(process.cwd(), "data");

function loadDocuments() {
  const files = fs.readdirSync(DATA_DIR);

  const documents = files.map((file) => {
    const filePath = path.join(DATA_DIR, file);
    const content = fs.readFileSync(filePath, "utf-8");

    return {
      id: file,
      text: content
    };
  });

  return documents;
}

async function chunkDocuments(docs) {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 100,
    chunkOverlap: 20
  });

  const chunks = [];

  for (const doc of docs) {
    const split = await splitter.splitText(doc.text);

    split.forEach((chunk, index) => {
      chunks.push({
        document: doc.id,
        text: chunk
      });
    });
  }

  return chunks;
}

async function storeVectors(chunks) {
  const embeddings = new OllamaEmbeddings({
    model: "nomic-embed-text"
  });

  for (const chunk of chunks) {
    const vector = await embeddings.embedQuery(chunk.text);

    const vectorString = `[${vector.join(",")}]`;

    await pool.query(
      `INSERT INTO documents (content, embedding)
      VALUES ($1, $2)`,
      [chunk.text, vectorString]
    );

    console.log("Stored chunk:", chunk.text.substring(0, 50));
  }
}

async function main() {
  const docs = loadDocuments();

  const chunks = await chunkDocuments(docs);

  await storeVectors(chunks);

  console.log("All vectors stored successfully.");
}

main();
