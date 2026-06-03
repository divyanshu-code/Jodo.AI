import { Pinecone as PineconeClient } from "@pinecone-database/pinecone";
import dotenv from 'dotenv';
dotenv.config();

const pinecone = new PineconeClient();
const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX_NAME);

export async function loadAllChunks(namespaces) {
    console.log("Loading chunks from Pinecone for BM25 index...");

    const allChunks = [];

    for (const ns of namespaces) {
        try {
            // List all vector IDs in this namespace
            const listResult = await pineconeIndex.namespace(ns).listPaginated();

            // Extract IDs correctly ──
            const ids = (listResult.vectors ?? []).map(v => v.id).filter(Boolean);

            if (ids.length === 0) {
                console.log(`Namespace "${ns}" is empty, skipping...`);
                continue;
            }

            console.log(`Fetching ${ids.length} chunks from namespace "${ns}"...`);

            // Fetch in batches of 100
            for (let i = 0; i < ids.length; i += 100) {
                const batchIds = ids.slice(i, i + 100);

                console.log(`Fetching batch of ${batchIds.length} IDs...`);

                const fetchResult = await pineconeIndex.namespace(ns).fetch({ ids: batchIds });

                const records = fetchResult.records ??  {};

                Object.values(records).forEach(record => {
                    if (record.metadata?.text) {
                        allChunks.push({
                            text: record.metadata.text,
                            source: ns,
                            page: record.metadata.page ?? 0,
                        });
                    }
                });
            }

        } catch (err) {
            console.error(`Failed to load namespace "${ns}":`, err.message);
            console.error("Full error:", err);
        }
    }

    console.log(`Total chunks loaded: ${allChunks.length}`);
    return allChunks;
}