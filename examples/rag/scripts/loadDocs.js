import fs from "fs";
import path from "path";

// path to the data folder
const DATA_DIR = path.join(process.cwd(), "data");

/**
 * Load all text documents from the data folder
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

// run the script
function main() {
  const docs = loadDocuments();

  console.log("Loaded Documents:");
  console.log(docs);
}

main();
