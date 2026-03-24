import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");

/**
 * Load documents from the data folder
 */
function loadDocuments() {
  const files = fs.readdirSync(DATA_DIR);

  const documents = files.map((file) => {
    const filePath = path.join(DATA_DIR, file);
    const content = fs.readFileSync(filePath, "utf-8");

    return {
      id: file,
      text: content,
    };
  });

  return documents;
}

/**
 * Chunk documents using LangChain splitter
 */
async function chunkDocuments(docs) {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 100,
    chunkOverlap: 20,
  });

  const chunks = [];

  for (const doc of docs) {
    const split = await splitter.splitText(doc.text);

    split.forEach((chunk, index) => {
      chunks.push({
        document: doc.id,
        chunk_id: `${doc.id}_${index}`,
        text: chunk,
      });
    });
  }

  return chunks;
}

async function main() {
  const docs = loadDocuments();

  const chunks = await chunkDocuments(docs);

  console.log("Generated Chunks:");
  console.log(chunks);
}

main();
