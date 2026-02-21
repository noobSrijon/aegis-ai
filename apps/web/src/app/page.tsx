"use client";

import { useState, useRef, useEffect } from "react";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"black-box" | "guardian">("black-box");
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [risk, setRisk] = useState<number>(0);
  const [action, setAction] = useState<string>("Shadow is idle.");
  const [transcripts, setTranscripts] = useState<string[]>([]);
  const [currentTranscript, setCurrentTranscript] = useState<string>("");
  const [status, setStatus] = useState<"idle" | "connecting" | "active" | "error">("idle");
  const [location, setLocation] = useState<{ lat: number, lon: number } | null>(null);
  const [manualInput, setManualInput] = useState("");

  const ws = useRef<WebSocket | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const audioWorklet = useRef<ScriptProcessorNode | null>(null);
  const audioStream = useRef<MediaStream | null>(null);
  const locationInterval = useRef<NodeJS.Timeout | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts, currentTranscript]);

  const sendManualChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim() || ws.current?.readyState !== WebSocket.OPEN) return;

    // Optimistic update for UI snappiness
    setTranscripts(prev => [...prev, manualInput.trim()].slice(-20));
    setManualInput("");
  };

  // Background location polling (every 3 seconds)
  useEffect(() => {
    if (isMonitoring && status === "active" && ws.current?.readyState === WebSocket.OPEN) {
      locationInterval.current = setInterval(() => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const loc = { lat: pos.coords.latitude, lon: pos.coords.longitude };
            setLocation(loc);
            if (ws.current?.readyState === WebSocket.OPEN) {
              ws.current.send(JSON.stringify({ type: "location", ...loc }));
            }
          },
          (err) => console.error("Location access denied or failed:", err),
          { enableHighAccuracy: true }
        );
      }, 3000);
    } else {
      if (locationInterval.current) clearInterval(locationInterval.current);
    }

    return () => {
      if (locationInterval.current) clearInterval(locationInterval.current);
    };
  }, [isMonitoring, status]);

  const startMonitoring = async () => {
    setStatus("connecting");
    try {
      // 1. Create a new thread
      const res = await fetch("http://localhost:8000/api/threads", { method: "POST" });
      const data = await res.json();
      const newThreadId = data.id;
      setThreadId(newThreadId);

      // 2. Setup WebSocket
      ws.current = new WebSocket(`ws://localhost:8000/ws/monitor?thread_id=${newThreadId}`);

      ws.current.onopen = () => {
        setStatus("active");
        setIsMonitoring(true);
        startRecording();
      };

      ws.current.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        setRisk(msg.risk);
        setAction(msg.action);

        if (msg.transcript) {
          if (msg.is_final) {
            setTranscripts((prev) => [...prev, msg.transcript].slice(-20));
            setCurrentTranscript("");
          } else {
            setCurrentTranscript(msg.transcript);
          }
        }
      };

      ws.current.onclose = () => stopMonitoring();
      ws.current.onerror = () => setStatus("error");

    } catch (err) {
      console.error("Failed to start monitoring:", err);
      setStatus("error");
    }
  };

  const startRecording = async () => {
    try {
      audioStream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContext.current = new AudioContext({ sampleRate: 16000 });
      const source = audioContext.current.createMediaStreamSource(audioStream.current);

      // Using ScriptProcessorNode to convert microphone Float32 to Int16 PCM
      audioWorklet.current = audioContext.current.createScriptProcessor(4096, 1, 1);

      audioWorklet.current.onaudioprocess = (event) => {
        if (ws.current?.readyState !== WebSocket.OPEN) return;

        const inputData = event.inputBuffer.getChannelData(0);
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        ws.current.send(pcmData.buffer);
      };

      source.connect(audioWorklet.current);
      audioWorklet.current.connect(audioContext.current.destination);
    } catch (err) {
      console.error("Microphone access denied:", err);
      setStatus("error");
    }
  };

  const stopMonitoring = () => {
    setIsMonitoring(false);
    setStatus("idle");
    setCurrentTranscript("");

    audioWorklet.current?.disconnect();
    audioContext.current?.close();
    audioStream.current?.getTracks().forEach(track => track.stop());
    ws.current?.close();
  };

  return (
    <div className="flex min-h-screen flex-col bg-black text-zinc-100 font-sans selection:bg-zinc-800">
      {/* Floating Navbar */}
      <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-2 py-2 bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 rounded-full shadow-2xl flex items-center gap-1">
        <button
          onClick={() => setActiveTab("black-box")}
          className={`px-6 py-2 rounded-full text-sm font-semibold transition-all ${activeTab === "black-box" ? "bg-white text-black shadow-lg" : "text-zinc-400 hover:text-white"}`}
        >
          black-box
        </button>
        <button
          onClick={() => setActiveTab("guardian")}
          className={`px-6 py-2 rounded-full text-sm font-semibold transition-all ${activeTab === "guardian" ? "bg-white text-black shadow-lg" : "text-zinc-400 hover:text-white"}`}
        >
          guardian
        </button>
      </nav>

      {activeTab === "black-box" ? (
        <main className="flex-1 flex flex-col pt-24 pb-12 px-4 max-w-4xl mx-auto w-full">
          {!isMonitoring ? (
            /* Onboarding / Idle State */
            <div className="flex-1 flex flex-col items-center justify-center text-center animate-in fade-in zoom-in duration-700">
              <div className="mb-8 p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800 max-w-lg">
                <h2 className="text-xl font-bold mb-4 bg-gradient-to-r from-white to-zinc-500 bg-clip-text text-transparent">
                  The Safety Shadow
                </h2>
                <p className="text-zinc-400 leading-relaxed text-sm">
                  A conversational guardian for high-stakes events. Keep a live thread open.
                  As you speak, your shadow re-evaluates risk in real-time.
                </p>
                <div className="mt-6 flex flex-col gap-2 text-[10px] text-zinc-500 font-mono text-left bg-black/30 p-3 rounded-lg border border-zinc-800/50 italic">
                  <span>- "The person is late..."</span>
                  <span>- "They asked me to walk to their car..."</span>
                  <span>- "I feel fine but the vibe is off."</span>
                </div>
              </div>

              <button
                onClick={startMonitoring}
                disabled={status === 'connecting'}
                className="group relative px-10 py-5 bg-white text-black font-black rounded-full hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
              >
                {status === 'connecting' ? 'INITIATING...' : 'ENABLE BLACK-BOX'}
                <div className="absolute -inset-1 bg-white/20 rounded-full blur opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>

              <p className="mt-6 text-[10px] uppercase tracking-widest text-zinc-600 font-bold">
                Secure Real-time Audit
              </p>
            </div>
          ) : (
            /* Active Monitoring / Chat Interface */
            <div className="flex-1 flex flex-col animate-in slide-in-from-bottom-5 duration-500">
              {/* Risk & Status Header */}
              <div className="flex items-center justify-between mb-8 p-6 bg-zinc-900/30 border border-zinc-800 rounded-2xl backdrop-blur-sm">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`h-2.5 w-2.5 rounded-full ${status === 'active' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                    <span className="text-xs font-bold uppercase tracking-widest text-zinc-400">Live Risk Assessment</span>
                  </div>
                  <h3 className={`text-xl font-bold ${risk > 75 ? 'text-red-500' : (risk > 40 ? 'text-yellow-500' : 'text-zinc-100')}`}>
                    {action}
                  </h3>
                </div>
                <div className="text-right ml-6">
                  <span className="text-4xl font-black tabular-nums">{risk.toFixed(0)}%</span>
                  <div className="w-24 bg-zinc-800 h-1 mt-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-1000 ${risk > 75 ? 'bg-red-500' : (risk > 40 ? 'bg-yellow-500' : 'bg-green-500')}`}
                      style={{ width: `${risk}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Chat Thread */}
              <div className="flex-1 space-y-6 overflow-y-auto max-h-[500px] mb-4 pr-2 custom-scrollbar">
                {transcripts.map((t, i) => (
                  <div key={i} className="flex flex-col items-end gap-1 ml-auto max-w-[85%] animate-in slide-in-from-right-2 duration-300">
                    <div className="px-4 py-3 rounded-2xl rounded-tr-none bg-white/5 border border-zinc-800/50 text-zinc-200 text-sm leading-relaxed">
                      {t}
                    </div>
                    <span className="text-[9px] text-zinc-600 font-mono mr-1 text-right">USER_LOG</span>
                  </div>
                ))}

                {currentTranscript && (
                  <div className="flex flex-col items-end gap-1 ml-auto max-w-[85%]">
                    <div className="px-4 py-3 rounded-2xl rounded-tr-none bg-zinc-900/50 border border-zinc-800/30 text-zinc-400 text-sm leading-relaxed italic animate-pulse">
                      {currentTranscript}...
                    </div>
                    <span className="text-[9px] text-zinc-700 font-mono mr-1 text-right">TRANSCRIBING</span>
                  </div>
                )}

                {transcripts.length === 0 && !currentTranscript && (
                  <div className="h-full flex items-center justify-center text-zinc-700 italic text-sm py-12">
                    Shadow is listening for your context...
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Manual Context Input */}
              <form onSubmit={sendManualChat} className="mb-6 relative">
                <input
                  type="text"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  placeholder="Send silent context..."
                  className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-white/20 transition-all pr-12"
                />
                <button
                  type="submit"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-zinc-500 hover:text-white transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                </button>
              </form>

              {/* Control Bar */}
              <footer className="sticky bottom-0 bg-black/80 backdrop-blur-md pt-4 border-t border-zinc-900/50 flex items-center justify-between">
                <button
                  onClick={stopMonitoring}
                  className="px-6 py-3 bg-red-950/20 border border-red-500/20 text-red-500 text-sm font-bold rounded-xl hover:bg-red-500 hover:text-white transition-all"
                >
                  Terminate Session
                </button>
                <div className="text-right">
                  <span className="text-[9px] font-mono text-zinc-600 block">ENCRYPTED_THREAD</span>
                  <span className="text-[9px] font-mono text-zinc-400 uppercase tracking-tight truncate max-w-[150px]">
                    {threadId}
                  </span>
                </div>
              </footer>
            </div>
          )}
        </main>
      ) : (
        /* Guardian Tab (Empty for now) */
        <main className="flex-1 flex flex-col items-center justify-center pt-24 text-zinc-600">
          <div className="p-8 border-2 border-dashed border-zinc-900 rounded-3xl text-center">
            <h2 className="text-lg font-bold mb-2">Guardian Vault</h2>
            <p className="text-sm">Historical session logs and analytics will appear here.</p>
          </div>
        </main>
      )}

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #27272a; border-radius: 2px; }
      `}</style>
    </div>
  );
}
