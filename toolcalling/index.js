import Groq from "groq-sdk";
import dotenv from "dotenv";
import { tavily } from '@tavily/core'
// import readline from 'node:readline/promises'
import nodecache from 'node-cache'          // for memory cache 
import { Pinecone as PineconeClient } from "@pinecone-database/pinecone";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";


dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY });

const mycache = new nodecache({
    stdTTL: 60 * 60 * 24           //  time by which mycache automatically delete in sec 
});

const embeddings = new HuggingFaceTransformersEmbeddings({
    model: "Xenova/all-MiniLM-L6-v2",
});

const pinecone = new PineconeClient();
const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX_NAME);

async function retrieve(question, topK = 5) {
    try {
        const queryVector = await embeddings.embedQuery(question);

        const results = await pineconeIndex.namespace('').query({
            vector: queryVector,
            topK,
            includeMetadata: true,
        });

        // If no good matches found, return empty
        const matches = results.matches.filter(m => m.score > 0.3);

        if (matches.length === 0) return null;

        return matches
            .map(match => match.metadata.text)
            .join('\n\n');

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

function buildSystemPrompt(ragContext) {
    return `You are a smart personal assistant called Jodo.AI.

${ragContext ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄 RELEVANT DOCUMENT CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${ragContext}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Use the above context to answer when relevant.
If the context fully answers the question, use it directly.
If the context is partial, combine it with your own knowledge.
` : ''}

## Response Style

### For Normal Questions:
Answer directly and naturally in plain English. Keep it conversational and concise.

### For Code-Related Questions:
**1. Brief Explanation** — What the code does (2–3 lines).
**2. Code Block** — fenced code block with language tag.
**3. Key Points** — Bullet list.
**4. Example Usage** *(if applicable)*
**5. Output** *(if applicable)*

## Tool Usage
If the answer needs real-time or up-to-date information not in the document context,
use the web search tool silently. Do not mention the tool to the user.

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
            model: "llama-3.3-70b-versatile",
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

    const ragContext = await retrieve(usermessage);

    const systemPrompt = buildSystemPrompt(ragContext);

    const cachedMessages = mycache.get(roomId);

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
        model: "llama-3.3-70b-versatile",
        stream: true,   // ← streaming enabled here
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
    mycache.set(roomId, resolvedMessages);

    onDone();

}

// rl.close();

// }

