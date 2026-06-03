import React, { useState } from 'react'
import axios from "axios";
import { useRef } from 'react';
import ReactMarkdown from 'react-markdown'

const App = () => {

  const [message, setmessage] = useState([]);

  const [thinking, setthinking] = useState(false);

  const [error, setError] = useState(null);

  const inputRef = useRef(null);

  const [roomId] = useState(() =>
    Date.now().toString(36) + Math.random().toString(36).substring(1, 9)
  );

  async function generate(text) {
    setthinking(true);
    setError(null);

    // Add empty AI message placeholder — we'll fill it as chunks arrive
    setmessage(prev => [...prev, { role: "ai", text: "" }]);

    try {
      const response = await fetch('https://jodo-ai.onrender.com/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, roomId }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Decode the chunk and parse SSE lines
        const raw = decoder.decode(value);
        const lines = raw.split('\n').filter(l => l.startsWith('data:'));

        for (const line of lines) {
          const data = line.replace('data: ', '').trim();

          if (data === '[DONE]') {
            setthinking(false);
            break;
          }

          try {
            const parsed = JSON.parse(data);

            if (parsed.isError) {
              setError(parsed.chunk);
              setthinking(false);
              break;
            }

            // Append each chunk to the last AI message
            setmessage(prev => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last.role === "ai") {
                updated[updated.length - 1] = {
                  ...last,
                  text: last.text + parsed.chunk
                };
              }
              return updated;
            });

          } catch { }
        }
      }

    } catch (err) {
      setthinking(false);
      setError(`Network Error: ${err.message}`);
      console.error(err);
    }
  }

  const handleKeyUp = (e) => {

    if (e.key === 'Enter' && !e.shiftKey) {
      handleclick();
    }
  }

  const handleclick = (e) => {
    const text = inputRef.current.value.trim();

    if (!text) return;

    setmessage(prev => [...prev, { role: "user", text }]);
    inputRef.current.value = "";
    generate(text);
  }

  return (

    <div className='container mx-auto max-w-3xl pb-35'>

      {error && (
        <div className='mx-2 my-3 p-3 bg-red-900/30 border flex justify-between border-red-600 rounded-lg text-red-400 text-sm'>
          {error}
          <button
            onClick={() => setError(null)}
            className='ml-2 cursor-pointer text-red-300 hover:text-red-200  text-xs'
          >
            X
          </button>
        </div>
      )}

      <div className='my-10'>
        {message.map((msg, i) => (
          <div key={i} className={`my-3 mx-2 px-3 py-2 rounded-lg text-sm max-w-fit
        ${msg.role === "user"
              ? "bg-neutral-800 ml-auto mr-3 lg:mr-0"
              : "text-white"
            }`}>

            {msg.role === "user" ? (
              // User messages → plain text is fine
              <p>{msg.text}</p>
            ) : (
              // AI messages → render markdown properly
              <ReactMarkdown
                components={{
                  // Code blocks
                  code({ inline, className, children }) {
                    return inline ? (
                      <code className="bg-neutral-700 px-1 py-0.5 rounded text-green-400 text-xs">
                        {children}
                      </code>
                    ) : (
                      <pre className="bg-neutral-900 border border-neutral-700 rounded-lg p-4 overflow-x-auto my-3">
                        <code className="text-white text-xs leading-relaxed">
                          {children}
                        </code>
                      </pre>
                    )
                  },
                  // Headings
                  h1: ({ children }) => <h1 className="text-lg font-bold mt-4 mb-2 text-white">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-base font-bold mt-3 mb-2 text-white">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1 text-neutral-200">{children}</h3>,
                  // Paragraphs
                  p: ({ children }) => <p className="mb-2 leading-relaxed text-neutral-100">{children}</p>,
                  // Lists
                  ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1 text-neutral-200">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1 text-neutral-200">{children}</ol>,
                  li: ({ children }) => <li className="text-sm">{children}</li>,
                  // Bold & Italic
                  strong: ({ children }) => <strong className="font-bold text-white">{children}</strong>,
                  em: ({ children }) => <em className="italic text-neutral-300">{children}</em>,
                  // Horizontal rule
                  hr: () => <hr className="border-neutral-600 my-3" />,
                }}
              >
                {msg.text}
              </ReactMarkdown>
            )}

          </div>
        ))}

        {thinking && (
          <div className="bg-white/10 text-sm rounded-full my-3 mx-2 px-4 py-2 animate-pulse">
            thinking.....
          </div>
        )}
      </div>

      {/* bottom textarea */}
      <div className='fixed mx-3 lg:mx-0 inset-x-0 bottom-0 flex items-center justify-center bg-black'>
        <div className='max-w-3xl w-full bg-neutral-800 rounded-2xl mb-3'>
          <textarea
            ref={inputRef}
            className='w-full p-3 text-sm resize-none outline-none'
            onKeyUp={handleKeyUp}
            rows={2}
          />
          <div className='flex items-center justify-between mx-2 my-2'>
            <button className='bg-neutral-700 px-3 py-1 rounded-xl text-white font-semibold text-sm cursor-pointer'>tool</button>
            <button onClick={handleclick} className='bg-white px-3 py-1 rounded-xl text-black font-semibold text-sm hover:bg-gray-200 cursor-pointer'>Ask me</button>
          </div>
        </div>
      </div>

    </div>
  )
}

export default App