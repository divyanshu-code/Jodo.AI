import { createClient } from 'redis';
import dotenv from 'dotenv';
dotenv.config();

const client = createClient({ 
    url: process.env.REDIS_URL ,
     socket: {
        reconnectStrategy: retries => Math.min(retries * 50, 500)
    },
    // Force RESP2 protocol for older Redis versions
    RESP: 2,
});

client.on('error', (err) => console.error('Redis error:', err));
client.on('connect', () => console.log('Redis connected'));

await client.connect();

// Stores full chat history per roomId

export async function getConversation(roomId) {
    try {
        const data = await client.get(`conversation:${roomId}`);
        return data ? JSON.parse(data) : null;
    } catch (err) {
        console.error("Redis get conversation error:", err.message);
        return null;
    }
}

export async function setConversation(roomId, messages) {
    try {
        await client.setEx(
            `conversation:${roomId}`,
            60 * 60 * 24,                           // 24 hours TTL
            JSON.stringify(messages)
        );
    } catch (err) {
        console.error("Redis set conversation error:", err.message);
    }
}

// Caches retrieval results for same questions
// Avoids hitting Pinecone + Cohere repeatedly

export async function getCachedRAG(question) {
    try {
        const key = `rag:${question.toLowerCase().trim()}`;
        const data = await client.get(key);
        if (data) {
            console.log("RAG cache hit!");
            return JSON.parse(data);
        }
        return null;
    } catch (err) {
        console.error("Redis get RAG error:", err.message);
        return null;
    }
}

export async function setCachedRAG(question, ragResult) {
    try {
        const key = `rag:${question.toLowerCase().trim()}`;
        await client.setEx(
            key,
            60 * 60,                                         // 1 hour TTL for RAG results
            JSON.stringify(ragResult)
        );
    } catch (err) {
        console.error("Redis set RAG error:", err.message);
    }
}


export async function deleteConversation(roomId) {
    try {
        await client.del(`conversation:${roomId}`);
        console.log(`Conversation ${roomId} cleared`);
    } catch (err) {
        console.error("Redis delete error:", err.message);
    }
}

export async function flushRAGCache() {
    try {
        const keys = await client.keys('rag:*');
        if (keys.length > 0) {
            await client.del(keys);
            console.log(`Cleared ${keys.length} RAG cache entries`);
        }
    } catch (err) {
        console.error("Redis flush error:", err.message);
    }
}