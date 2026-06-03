import 'dotenv/config';
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf"
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Pinecone as PineconeClient } from "@pinecone-database/pinecone";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { v4 as uuidv4 } from "uuid";

const embeddings = new HuggingFaceTransformersEmbeddings({
  model: "Xenova/all-MiniLM-L6-v2",
});

const pinecone = new PineconeClient();                     // by default reading the key from .env

const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX_NAME)

export async function fileload(filepath , namespace = '') {

  console.log("Loading file from:", filepath);

  const data = new PDFLoader(filepath)
  const doc = await data.load()

  console.log("Pages loaded:", doc.length);
  console.log("Content length:", doc[0]?.pageContent?.length);

  if (!doc[0]?.pageContent?.trim()) {
    throw new Error("PDF content is empty — check if the PDF is scanned/image-based.");
  }

  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 500, chunkOverlap: 100 })

  const documents = await splitter.splitDocuments(doc);

  const allRecords = [];

  for (let i = 0; i < documents.length; i += 5) {
    const batchDocs = documents.slice(i, i + 5);
    const texts = batchDocs.map(d => d.pageContent);

    console.log(`Processing batch ${Math.floor(i / 5) + 1} / ${Math.ceil(documents.length / 5)}...`);

    const vectors = await embeddings.embedDocuments(texts);

    vectors.forEach((vector, idx) => {
      allRecords.push({
        id: uuidv4(),
        values: vector,
        metadata: {
          text: batchDocs[idx].pageContent,
          source: String(batchDocs[idx].metadata?.source ?? ""),
          page: Number(batchDocs[idx].metadata?.page ?? 0),
        },
      });
    });
  }

  console.log(`Total records built: ${allRecords.length}`);

  const batchSize = 5;
  for (let i = 0; i < allRecords.length; i += batchSize) {
    const batch = allRecords.slice(i, i + batchSize);

    await pineconeIndex.namespace(namespace).upsert({ records: batch }); 
    console.log(`Upserted ${Math.min(i + batchSize, allRecords.length)} / ${allRecords.length} /n`);
  }

  console.log(`Done! chunks stored in Pinecone.`);

}
