import { CohereClient } from 'cohere-ai';
import dotenv from 'dotenv';
dotenv.config();

const cohere = new CohereClient({ token: process.env.COHERE_API_KEY });

// RERANK CHUNKS BY TRUE RELEVANCE
// Takes hybrid search results and reorders
// them using a Cross-Encoder model

export async function rerank(question, chunks, topN = 5) {
    try {
        if (chunks.length === 0) return chunks;

        console.log(`Reranking ${chunks.length} chunks...`);

        const response = await cohere.rerank({
            model: 'rerank-english-v3.0',
            query: question,
            documents: chunks.map(c => c.text),
            topN,
        });

        const reranked = response.results.map(r => ({
            ...chunks[r.index],
            rerankerScore: r.relevanceScore,
        }));

        console.log("Reranker scores:");
        reranked.forEach((r, i) => {
            console.log(`  ${i + 1}. score: ${r.rerankerScore.toFixed(3)} | ${r.text.slice(0, 60)}...`);
        });

        return reranked;

    } catch (err) {
        console.error("Reranking failed:", err.message);
        
        console.log("Falling back to hybrid search order");
        return chunks.slice(0, topN);
    }
}