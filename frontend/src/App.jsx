import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, Cpu, Sparkles, AlertCircle, Paperclip, FileText, Check, Copy } from 'lucide-react';
import gsap from 'gsap';

const CodeBlock = ({ inline, className, children }) => {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = () => {
    navigator.clipboard.writeText(String(children).replace(/\n$/, ''));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (inline) {
    return (
      <code className="font-mono px-1.5 py-0.5 rounded-md text-[13px]" style={{ backgroundColor: '#1A1A1A', color: '#818CF8', border: '1px solid rgba(255,255,255,0.06)' }}>
        {children}
      </code>
    );
  }

  return (
    <div className="my-6 rounded-xl overflow-hidden shadow-2xl relative group" style={{ backgroundColor: '#0A0A0A', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center justify-between px-4 py-2.5" style={{ backgroundColor: '#111111', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
          <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
          <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
        </div>
        <button 
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs font-medium transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
          style={{ color: copied ? '#4ade80' : '#A1A1AA' }}
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied!' : 'Copy code'}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto">
        <code className="font-mono text-[13px] leading-loose" style={{ color: '#A1A1AA' }}>
          {children}
        </code>
      </pre>
    </div>
  );
};

const App = () => {
  const [message, setmessage] = useState([]);
  const [thinking, setthinking] = useState(false);
  const [error, setError] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState("");
  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  
  const headerRef = useRef(null);
  const emptyStateRef = useRef(null);
  const inputBarRef = useRef(null);
  const sendButtonRef = useRef(null);

  const [roomId] = useState(() =>
    Date.now().toString(36) + Math.random().toString(36).substring(1, 9)
  );

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setSelectedFile(file);
    
    const reader = new FileReader();
    reader.onload = (evt) => {
      setFileContent(evt.target.result);
    };
    reader.readAsText(file);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [message, thinking]);

  // GSAP Animations
  useLayoutEffect(() => {
    // Message entrance animation
    if (chatContainerRef.current && chatContainerRef.current.children.length > 0) {
      const lastElement = chatContainerRef.current.children[chatContainerRef.current.children.length - 1];
      gsap.fromTo(lastElement,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }
      );
    }
  }, [message.length, thinking]);

  // Initial Page Load Animation
  useLayoutEffect(() => {
    const tl = gsap.timeline();
    
    if (headerRef.current) {
      tl.fromTo(headerRef.current, { y: -20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: "power3.out" });
    }
    
    if (emptyStateRef.current) {
      const title = emptyStateRef.current.querySelector('h2');
      const subtitle = emptyStateRef.current.querySelector('p');
      const cards = emptyStateRef.current.querySelectorAll('.suggestion-card');
      
      tl.fromTo([title, subtitle], { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, stagger: 0.1, ease: "power3.out" }, "-=0.3")
        .fromTo(cards, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, stagger: 0.1, ease: "power3.out" }, "-=0.2");
    }
    
    if (inputBarRef.current) {
      tl.fromTo(inputBarRef.current, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "power3.out" }, "-=0.4");
    }
  }, []);

  async function generate(text) {
    setthinking(true);
    setError(null);

    // Add empty AI message placeholder
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
      e.preventDefault();
      handleclick();
    }
  }

  const handleclick = () => {
    const text = inputRef.current.value.trim();
    if (!text && !selectedFile) return;

    let fullMessage = text;
    if (selectedFile && fileContent) {
      fullMessage = `[Attached File: ${selectedFile.name}]\n\n${fileContent}\n\n${text}`;
    }

    setmessage(prev => [...prev, { role: "user", text: fullMessage }]);
    inputRef.current.value = "";
    setSelectedFile(null);
    setFileContent("");
    
    // Reset height for textarea
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    // Spin animation for send button
    if (sendButtonRef.current) {
      gsap.to(sendButtonRef.current, { rotation: "+=360", duration: 0.5, ease: "power2.inOut" });
    }

    generate(fullMessage);
  }

  const handleInput = (e) => {
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`;
  };

  return (
    <div className="min-h-screen text-[#FFFFFF] font-sans relative selection:bg-[#6366F1]/30 selection:text-white" style={{ backgroundColor: '#000000' }}>
      {/* Ambient Background Glow */}
      <div className="fixed inset-0 pointer-events-none -z-10" style={{
        background: 'radial-gradient(ellipse at top, rgba(99,102,241,0.08) 0%, #000000 70%)'
      }} />

      {/* Glassmorphism Header */}
      <header ref={headerRef} className="sticky top-0 z-50 w-full backdrop-blur-xl" style={{ backgroundColor: 'rgba(0,0,0,0.6)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between relative">

          <h1 className="font-display font-bold text-xl tracking-tight text-transparent bg-clip-text absolute left-14 -translate-x-1/2" style={{ backgroundImage: 'linear-gradient(to right, #FFFFFF, #A1A1AA)' }}>
            Jodo.AI
          </h1>

          <div className="flex items-center gap-2 flex-1 justify-end">
            <div className="px-3 py-1.5 rounded-full flex items-center gap-2 text-xs font-medium" style={{ backgroundColor: '#111111', border: '1px solid rgba(255,255,255,0.06)', color: '#A1A1AA' }}>
              <span>openai/gpt-oss-120b</span>
              <div className="w-[1px] h-3 bg-white/20 mx-1"></div>
              <span className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse" style={{ boxShadow: '0 0 12px 2px rgba(34,197,94,0.6)' }}></span>
              <span>RAG</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Chat Area */}
      <main className="max-w-4xl mx-auto px-4 pt-8 pb-40">

        {/* Empty State */}
        {message.length === 0 && (
          <div ref={emptyStateRef} className="relative flex flex-col items-center justify-center w-full mt-5 mb-10 min-h-[50vh]">
            <div className="absolute inset-0 -z-10 animate-pulse" style={{
               backgroundImage: `linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px)`,
               backgroundSize: '30px 30px',
               maskImage: 'radial-gradient(ellipse at center, black 40%, transparent 70%)',
               WebkitMaskImage: 'radial-gradient(ellipse at center, black 40%, transparent 70%)',
               animationDuration: '4s'
            }}></div>
            <style>{`
              @keyframes gradientShift {
                0% { background-position: 0% 50%; }
                50% { background-position: 100% 50%; }
                100% { background-position: 0% 50%; }
              }
            `}</style>
            <h2 className="font-display text-5xl font-bold mb-4 tracking-tight text-transparent bg-clip-text"
              style={{
                backgroundImage: 'linear-gradient(90deg, #6366F1, #818CF8, #FFFFFF, #6366F1)',
                backgroundSize: '200% auto',
                animation: 'gradientShift 4s ease infinite'
              }}>
              Jodo.AI
            </h2>
            <p className="text-lg mb-12" style={{ color: '#A1A1AA' }}>Your intelligent companion</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
              {[
                { icon: <Cpu className="w-5 h-5 text-[#818CF8]" />, title: 'Analyze code', desc: 'Find bugs and optimize performance' },
                { icon: <Sparkles className="w-5 h-5 text-[#818CF8]" />, title: 'Generate content', desc: 'Write emails, essays, and stories' },
                { icon: <FileText className="w-5 h-5 text-[#818CF8]" />, title: 'Summarize documents', desc: 'Extract key points from long PDFs' },
                { icon: <AlertCircle className="w-5 h-5 text-[#818CF8]" />, title: 'Debug errors', desc: 'Paste your logs and fix issues' },
              ].map((card, i) => (
                <div key={i} onClick={() => {
                  inputRef.current.value = card.title;
                  inputRef.current.focus();
                }} className="suggestion-card flex flex-col items-start p-5 rounded-2xl cursor-pointer transition-all hover:-translate-y-2 hover:bg-[#1A1A1A] group"
                  style={{ backgroundColor: '#111111', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
                  <style>{`
                    
                  `}</style>
                  <div className="mb-3 p-2 rounded-lg" style={{ backgroundColor: '#1A1A1A' }}>{card.icon}</div>
                  <h3 className="font-semibold text-sm mb-1" style={{ color: '#FFFFFF' }}>{card.title}</h3>
                  <p className="text-xs text-left" style={{ color: '#A1A1AA' }}>{card.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="mb-6 p-3 max-w-4xl mx-auto overflow-x-auto scrollbar-hidden rounded-xl flex items-start gap-3" style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#F87171' }}>
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="flex-1 text-sm">{error}</div>
            <button onClick={() => setError(null)} className=" transition-colors hover:opacity-75 cursor-pointer">✕</button>
          </div>
        )}

        {/* Messages */}
        <div className="flex flex-col gap-8" ref={chatContainerRef}>
          {message.map((msg, i) => (
            <div
              key={i}
              className={`flex w-full ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "user" ? (
                <div className="max-w-[85%] rounded-lg px-4 py-2 shadow-xl backdrop-blur-md" style={{ backgroundColor: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)' }}>
                  <p className="text-[15px] leading-relaxed whitespace-pre-wrap" style={{ color: '#FFFFFF' }}>{msg.text}</p>
                </div>
              ) : (
                <div className="w-full flex gap-4 max-w-3xl">
                  <div className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center mt-1" style={{ background: 'linear-gradient(135deg, #6366F1, #818CF8)', boxShadow: '0 0 10px rgba(99,102,241,0.3)' }}>
                    <span className="font-display font-bold text-sm text-white">J</span>
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col gap-0">
                    <div className="prose prose-invert prose-p:leading-relaxed prose-pre:p-0 prose-pre:bg-transparent">
                      <ReactMarkdown
                        components={{
                          code: CodeBlock,
                          h1: ({ children }) => <h1 className="font-display text-2xl font-bold mt-8 mb-4 tracking-tight" style={{ color: '#FFFFFF' }}>{children}</h1>,
                          h2: ({ children }) => <h2 className="font-display text-xl font-bold mt-6 mb-3 tracking-tight" style={{ color: '#FFFFFF' }}>{children}</h2>,
                          h3: ({ children }) => <h3 className="font-display text-lg font-semibold mt-5 mb-2" style={{ color: '#FFFFFF' }}>{children}</h3>,
                          p: ({ children }) => <p className="mb-4 text-[15px] leading-relaxed" style={{ color: '#FFFFFF' }}>{children}</p>,
                          ul: ({ children }) => <ul className="list-disc list-outside ml-5 mb-4 space-y-2 text-[15px]" style={{ color: '#A1A1AA' }}>{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal list-outside ml-5 mb-4 space-y-2 text-[15px]" style={{ color: '#A1A1AA' }}>{children}</ol>,
                          li: ({ children }) => <li className="pl-1" style={{ color: '#FFFFFF' }}>{children}</li>,
                          strong: ({ children }) => <strong className="font-semibold" style={{ color: '#FFFFFF' }}>{children}</strong>,
                          em: ({ children }) => <em className="italic" style={{ color: '#A1A1AA' }}>{children}</em>,
                          hr: () => <hr className="my-8" style={{ borderColor: 'rgba(255,255,255,0.06)' }} />,
                          a: ({ children, href }) => <a href={href} className="underline underline-offset-4 transition-colors" style={{ color: '#6366F1', textDecorationColor: 'rgba(99,102,241,0.4)' }}>{children}</a>
                        }}
                      >
                        {msg.text}
                      </ReactMarkdown>
                    </div>
                   
                  </div>
                </div>
              )}
            </div>
          ))}

          {thinking && (
            <div className="flex w-full justify-start">
              <div className="flex gap-4">
                <div className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #6366F1, #818CF8)', boxShadow: '0 0 10px rgba(99,102,241,0.3)' }}>
                  <span className="font-display font-bold text-sm text-white">J</span>
                </div>
                <div className="flex items-center gap-1.5 mt-3">
                  <style>{`
                    @keyframes wave {
                      0%, 60%, 100% { transform: translateY(0); }
                      30% { transform: translateY(-4px); }
                    }
                  `}</style>
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#818CF8', animation: 'wave 1.2s infinite ease-in-out', animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#818CF8', animation: 'wave 1.2s infinite ease-in-out', animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#818CF8', animation: 'wave 1.2s infinite ease-in-out', animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
        </div>
        <div ref={messagesEndRef} />
      </main>

      {/* Floating Prompt Bar */}
      <div ref={inputBarRef} className="fixed bottom-0 inset-x-0 pb-2 lg:pb-8 pt-12 z-40 pointer-events-none" style={{ background: 'linear-gradient(to top, #000000 20%, rgba(0,0,0,0) 100%)' }}>
        <div className="max-w-4xl mx-auto px-4 pointer-events-auto">
          <div className="relative flex flex-col gap-2 backdrop-blur-[40px] rounded-3xl p-2 transition-all duration-300 focus-within:shadow-[0_0_30px_rgba(99,102,241,0.2)] group"
            style={{ backgroundColor: 'rgba(10,10,10,0.65)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)' }}>

            {selectedFile && (
              <div className="flex items-center gap-2 px-3 py-2 mx-2 mt-2 rounded-xl backdrop-blur-md" style={{ backgroundColor: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
                <FileText className="w-4 h-4 text-[#818CF8]" />
                <span className="text-xs text-white truncate max-w-[200px]">{selectedFile.name}</span>
                <button onClick={() => { setSelectedFile(null); setFileContent(""); document.getElementById("file").value = ""; }} className="ml-auto text-[#A1A1AA] hover:text-white cursor-pointer transition-colors">✕</button>
              </div>
            )}

            <div className="flex items-end gap-2 w-full">
              <button
                className="p-3 shrink-0 rounded-full transition-colors mb-0.5 ml-1 hover:scale-110 cursor-pointer"
                style={{ color: '#52525B' }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#FFFFFF'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#52525B'}
                title="Upload File"
              >
                {/* <input type="file" name="file" id="file" className="hidden" onChange={handleFileChange} /> */}
                <Paperclip onClick={(e) => document.getElementById("file").click()} className="w-5 h-5" />
              </button>

              <textarea
                ref={inputRef}
                onChange={handleInput}
                onKeyUp={handleKeyUp}
                placeholder="Ask anything..."
                className="w-full bg-transparent outline-none resize-none py-3.5 max-h-[150px] font-sans text-[15px]"
                style={{ color: '#FFFFFF' }}
                rows={1}
              />
              <style>{`
                textarea::placeholder {
                  color: #52525B;
                }
              `}</style>

              <button
                ref={sendButtonRef}
                onClick={handleclick}
                className="shrink-0 mb-1 mr-1 p-2.5 z-10 cursor-pointer rounded-full transition-all active:scale-95 hover:scale-110 flex items-center justify-center shadow-lg hover:brightness-110"
                style={{ backgroundColor: '#6366F1', color: '#FFFFFF', boxShadow: '0 0 15px rgba(99,102,241,0.3)' }}
              >
                <Send className="w-4 h-4 ml-0.5" />
              </button>
            </div>

            {/* Model Selector Row */}
            <div className="flex items-center justify-between px-3 pb-1">
              <button className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors hover:bg-white/5 cursor-pointer" style={{ color: '#A1A1AA' }}>
                openai/gpt-oss-120b

              </button>
            </div>
          </div>
          <div className="text-center mt-3 lg:text-sm text-[10px] font-medium" style={{ color: '#52525B' }}>
            Jodo.AI can make mistakes. Consider verifying important information.
          </div>
        </div>
      </div>
    </div>
  )
}

export default App;
