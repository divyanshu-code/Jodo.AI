import { create , search , insert } from '@orama/orama';

let db = null;
let storedChunks = [];

// BUILD BM25 INDEX FROM PINECONE CHUNKS

export async function buildBM25Index(chunks) {
    storedChunks = chunks;

    // Create Orama DB with BM25 schema
    db = await create({
        schema: {
            id:        'string',
            text:      'string',
            source:    'string',
            page:      'number',
        }
    });

    // Insert all chunks
    for (let i = 0; i < chunks.length; i++) {
        await insert(db, {
            id:     String(i),
            text:   chunks[i].text    || '',
            source: chunks[i].source  || '',
            page:   chunks[i].page    || 0,
        });
    }

    console.log(`BM25 index built with ${chunks.length} chunks`);
}

// BM25 KEYWORD SEARCH

export async function bm25Search(query, topK = 20) {
    if (!db) {
        console.warn("BM25 index not built yet!");
        return [];
    }

    const results = await search(db, {
        term: query,
        properties: ['text'],
        limit: topK,
    });

    return results.hits.map(hit => ({
        text:   hit.document.text,
        source: hit.document.source,
        page:   hit.document.page,
        bm25Score: hit.score,
    }));
}

// MERGE VECTOR + BM25 RESULTS
// Reciprocal Rank Fusion algorithm
// Works better than simple score addition

export function mergeResults(vectorResults, bm25Results, topK = 5) {
    const scoreMap = new Map();
    const k = 60; // RRF constant

    // Vector results → RRF score
    vectorResults.forEach((r, rank) => {
        const key = r.text;
        const rrf = 1 / (k + rank + 1);
        if (scoreMap.has(key)) {
            scoreMap.get(key).score += rrf;
        } else {
            scoreMap.set(key, { ...r, score: rrf });
        }
    });

    // BM25 results → RRF score
    bm25Results.forEach((r, rank) => {
        const key = r.text;
        const rrf = 1 / (k + rank + 1);
        if (scoreMap.has(key)) {
            scoreMap.get(key).score += rrf;
        } else {
            scoreMap.set(key, { ...r, score: rrf });
        }
    });

    // Sort by combined RRF score
    return Array.from(scoreMap.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
}