import Groq from "groq-sdk";
import dotenv from "dotenv";
import { tavily } from '@tavily/core'
// import readline from 'node:readline/promises'
// import nodecache from 'node-cache'          // for memory cache 
import { Pinecone as PineconeClient } from "@pinecone-database/pinecone";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { bm25Search, buildBM25Index, mergeResults } from "./hybridsearch.js";
import { loadAllChunks } from "./loadallcunks.js";
import { rerank } from "./reranker.js";
import { getConversation, setConversation, getCachedRAG, setCachedRAG } from "./redis.js";

dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY });

// const mycache = new nodecache({
//     stdTTL: 60 * 60 * 24           //  time by which mycache automatically delete in sec 
// });

const embeddings = new HuggingFaceTransformersEmbeddings({
    model: "Xenova/all-MiniLM-L6-v2",
});

const pinecone = new PineconeClient();
const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX_NAME);

const namespaces = [
    'essentr-policy',
    // 'leave-policy',
    // 'salary-guide',
];

// Loads all chunks from Pinecone once
// and builds the in-memory BM25 index for keyword search

async function initializeBM25() {
    try {
        const chunks = await loadAllChunks(namespaces);
        if (chunks.length > 0) {
            await buildBM25Index(chunks);
        } else {
            console.warn("No chunks found — BM25 index is empty");
        }
    } catch (err) {
        console.error("BM25 initialization failed:", err.message);
    }
}

await initializeBM25();

// HYBRID RETRIEVE (Vector + BM25)

async function retrieve(question, topK = 5) {
    try {

        const cached = await getCachedRAG(question);
        if (cached) return cached;

        const queryVector = await embeddings.embedQuery(question);

        const allResults = await Promise.all(        // promise.all() used for the parallel execution of the multiple namespaces and it waits for all the promises to resolve and then gives the result .
            namespaces.map(ns =>
                pineconeIndex.namespace(ns).query({
                    vector: queryVector,
                    topK: 20,
                    includeMetadata: true,
                })
            )
        );

        // If no good matches found, return empty
        const merged = allResults
            .flatMap((result, i) =>
                result.matches.map(match => ({
                    text: match.metadata.text,
                    score: match.score,
                    source: namespaces[i],
                    page: match.metadata.page,
                }))
            )
            .filter(r => r.score > 0.3)
            .sort((a, b) => b.score - a.score)

        const bm25Results = await bm25Search(question, 20);

        const hybridResults = mergeResults(merged, bm25Results, topK);

        if (hybridResults.length === 0) return null;

        // Rerank top 20 → get best 5

        const rerankedResults = await rerank(question, hybridResults, topK);

        const topScore = rerankedResults[0]?.rerankerScore ?? 0;

        if (topScore < 0.1) {
            console.log("Low confidence — no relevant context found");
            return null;
        }

        console.log(`Top reranker score: ${topScore.toFixed(3)}`);
        console.log("Sources used:", [...new Set(hybridResults.map(r => r.source))]);

        const ragResult = {
            context: rerankedResults.map(r => r.text).join('\n\n'),
            sources: rerankedResults,
        };

        await setCachedRAG(question, ragResult);
        console.log("RAG result cached");

        return ragResult;

    } catch (err) {
        console.error("RAG retrieval failed:", err.message);
        return null;
    }
}

const tool = async ({ query }) => {

    console.log("Tool calling function ....");

    const response = await tvly.search(query);

    const finalresult = response.results.map((e) =>
        e.content
    ).join('\n')

    return finalresult;

}

function buildSystemPrompt(ragResult) {

    // No context found
    if (!ragResult) {
        return `You are a smart personal assistant called Jodo.AI.
Answer the question using your own knowledge.
If you don't know, say "I don't have enough information on that."

## Response Style
### For Normal Questions:
Answer directly and naturally in plain English.

### For Code-Related Questions:
**1. Brief Explanation** — What the code does (2–3 lines).
**2. Code Block** — fenced code block with language tag.
**3. Key Points** — Bullet list.
**4. Example Usage** *(if applicable)*
**5. Output** *(if applicable)*

## Tool Usage
Use the web search tool silently for real-time or unknown info.
Current date and time: ${new Date().toLocaleString()}`;
    }

    // Build numbered citation list
    const citationList = ragResult.sources.map((s, i) =>
        `[${i + 1}] "${s.text.slice(0, 150)}..."
         Source: ${s.source} | Page: ${s.page}`
    ).join('\n\n');

    return `You are a smart personal assistant called Jodo.AI.
You have access to a company document knowledge base.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 DOCUMENT CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${ragResult.context}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📚 AVAILABLE CITATIONS:
${citationList}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSTRUCTIONS:
- Answer ONLY using the document context above
- After your answer, always add a "Sources" section
- Cite sources using [1], [2] etc. inline in your answer
- If context does not fully answer the question, say so honestly
- Never make up information not present in the context

## Response Style
### For Normal Questions:
Answer directly in plain English with inline citations like:
"Employees are entitled to 20 days leave [1] with prior approval [2]."

Then end with:
Sources:
[1] essentr-policy, Page 3
[2] essentr-policy, Page 5

### For Code-Related Questions:
**1. Brief Explanation**
**2. Code Block**
**3. Key Points**
**4. Example Usage**
**5. Output**

## Tool Usage
Use the web search tool silently for real-time or unknown info.
Current date and time: ${new Date().toLocaleString()}`;
}

const toolDefinitions = [
    {
        type: "function",
        function: {
            name: "tool",
            description: "Search the internet for real-time or unknown information",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string", description: "The search query" }
                },
                required: ["query"]
            }
        }
    }
];

async function resolveToolCalls(allmessage) {
    const maximumcall = 10;
    let count = 0;

    while (true) {
        if (count > maximumcall) return null;
        count++;

        const completion = await groq.chat.completions.create({
            temperature: 1,
            messages: allmessage,
            model: "llama-3.1-8b-instant",
            tool_choice: "auto",
            tools: toolDefinitions,
        });

        const toolcalls = completion.choices[0].message.tool_calls;

        // No tool calls → LLM is ready to answer, return messages
        if (!toolcalls) return allmessage;

        // Push assistant tool call message
        allmessage.push(completion.choices[0].message);

        // Execute each tool call
        for (const tc of toolcalls) {
            const args = JSON.parse(tc.function.arguments);
            const result = await tool(args);
            allmessage.push({
                tool_call_id: tc.id,
                role: 'tool',
                name: tc.function.name,
                content: result
            });
        }
    }
}

export async function generate(usermessage, roomId, onChunk, onDone) {

    // const rl = readline.createInterface({ input: process.stdin, output: process.stdout })  --> it is used for connecting to the local terminal as input and output . For connecting to the frontend we dont need this . Just we have to import this function. 

    const ragResult = await retrieve(usermessage);

    const systemPrompt = buildSystemPrompt(ragResult);

    // const cachedMessages = mycache.get(roomId);            // for node-cache

    const cachedMessages = await getConversation(roomId);     // for redis

    // while (true) {           // for terminal input output  use 

    // const question = await rl.question("you: ");         :- terminal use

    // if (question === 'bye') {
    //     break;
    // }

    let allmessage = cachedMessages
        ? [...cachedMessages]
        : [{ role: 'system', content: systemPrompt }];

    allmessage[0] = { role: 'system', content: systemPrompt };
    allmessage.push({ role: "user", content: usermessage });

    // Resolve tool calls first (non-streaming)   
    // implemented the SSE ( Server sent events ) i.e is used for streaming the text one by one word so that user does not wait for whole response . it gets the response one by one.  

    const resolvedMessages = await resolveToolCalls(allmessage);

    if (!resolvedMessages) return onDone("Request expired. Please try again.");

    // Stream the final response
    const stream = await groq.chat.completions.create({
        temperature: 1,
        messages: resolvedMessages,
        model: "llama-3.1-8b-instant",
        stream: true,   //  streaming enabled here
    });

    let fullResponse = "";

    for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content || "";
        if (text) {
            fullResponse += text;
            onChunk(text);  // send each chunk to frontend
        }
    }

    //  Save full response to cache
    resolvedMessages.push({ role: "assistant", content: fullResponse });
    // mycache.set(roomId, resolvedMessages);                             // for node-cache
    await setConversation(roomId, resolvedMessages);

    onDone();
}

// rl.close();

// }

