import express from 'express'
import { generate } from './index.js';
import cors from 'cors'

const app = express()
const port = 3001;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('hello how can i assist you');

})

app.post('/chat', async (req, res) => {

    const { message, roomId } = req.body;

    if (!message || !roomId) {
        return res.status(400).json({ message: 'All fields are required' })
    }

    if (!message) return res.status(400).json({ error: "Message is required" });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {

        await generate(message, roomId,

            (chunk) => {
                res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
            },

            // onDone → signal frontend that stream is complete
            (errorMsg) => {
                if (errorMsg) {
                    res.write(`data: ${JSON.stringify({ chunk: errorMsg })}\n\n`);
                }
                res.write(`data: [DONE]\n\n`);
                res.end();
            }
        );

    } catch (err) {
        console.error(err);
        res.write(`data: ${JSON.stringify({ chunk: "Something went wrong." })}\n\n`);
        res.write(`data: [DONE]\n\n`);
        res.end();
    }

})

app.listen(port, '0.0.0.0', () => {      
    console.log(`Server running on port ${port}`);
})