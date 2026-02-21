"use client";

import { useState, useRef, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { AuthUser as User } from "@supabase/supabase-js";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"black-box" | "history" | "guardians" | "notifications">("black-box");
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [risk, setRisk] = useState<number>(0);
  const [action, setAction] = useState<string>("Shadow is idle.");
  const [transcripts, setTranscripts] = useState<string[]>([]);
  const [currentTranscript, setCurrentTranscript] = useState<string>("");
  const [status, setStatus] = useState<"idle" | "connecting" | "active" | "error">("idle");
  const [location, setLocation] = useState<{ lat: number, lon: number } | null>(null);
  const [manualInput, setManualInput] = useState("");
  const [user, setUser] = useState<User | null>(null);

  // Onboarding, History, Guarding & Notifications state
  const [profile, setProfile] = useState<{ is_enrolled: boolean } | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState<1 | 2>(1);
  const [showAddGuardianModal, setShowAddGuardianModal] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [guarding, setGuarding] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [guardianEmail, setGuardianEmail] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");

  const supabase = createClient();
  const router = useRouter();

  const ws = useRef<WebSocket | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const audioWorklet = useRef<ScriptProcessorNode | null>(null);
  const audioStream = useRef<MediaStream | null>(null);
  const locationInterval = useRef<NodeJS.Timeout | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setUser(user);

      const { data: { session } } = await supabase.auth.getSession();
      const headers = { "Authorization": `Bearer ${session?.access_token}` };

      // Parallel fetch
      const [profRes, histRes, guardRes, notifRes] = await Promise.all([
        fetch("http://localhost:8000/api/profile", { headers }),
        fetch("http://localhost:8000/api/history", { headers }),
        fetch("http://localhost:8000/api/guarding", { headers }),
        fetch("http://localhost:8000/api/notifications", { headers })
      ]);

      const [profData, histData, guardData, notifData] = await Promise.all([
        profRes.json(), histRes.json(), guardRes.json(), notifRes.json()
      ]);

      setProfile(profData);
      if (!profData.is_enrolled) setShowOnboarding(true);

      setHistory(histData);
      setGuarding(guardData);
      setNotifications(notifData);
    };
    init();
  }, [router, supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const markNotificationRead = async (id: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    await fetch(`http://localhost:8000/api/notifications/read/${id}`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${session?.access_token}` }
    });
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts, currentTranscript]);

  const sendManualChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim() || ws.current?.readyState !== WebSocket.OPEN) return;
    ws.current.send(JSON.stringify({ type: "chat", text: manualInput.trim() }));
    setTranscripts(prev => [...prev, manualInput.trim()].slice(-20));
    setManualInput("");
  };

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
          (err) => console.error("Location access failed:", err),
          { enableHighAccuracy: true }
        );
      }, 3000);
    } else if (locationInterval.current) {
      clearInterval(locationInterval.current);
    }
    return () => { if (locationInterval.current) clearInterval(locationInterval.current); };
  }, [isMonitoring, status]);

  const startMonitoring = async () => {
    setStatus("connecting");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("http://localhost:8000/api/threads", {
        method: "POST",
        headers: { "Authorization": `Bearer ${session?.access_token}` }
      });
      const data = await res.json();
      setThreadId(data.id);

      ws.current = new WebSocket(`ws://localhost:8000/ws/monitor?thread_id=${data.id}`);
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
      console.error("Monitoring start failed:", err);
      setStatus("error");
    }
  };

  const startRecording = async () => {
    try {
      audioStream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContext.current = new AudioContext({ sampleRate: 16000 });
      const source = audioContext.current.createMediaStreamSource(audioStream.current);
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
      console.error("Mic error:", err);
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

  const handleEnrollVoice = async () => {
    setIsRecording(true);
    setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const formData = new FormData();
      formData.append("file", new Blob(["dummy"], { type: "audio/wav" }), "voice.wav");
      await fetch("http://localhost:8000/api/enroll-voice", {
        method: "POST",
        headers: { "Authorization": `Bearer ${session?.access_token}` },
        body: formData
      });
      setIsRecording(false);
      setOnboardingStep(2);
    }, 2000);
  };

  const handleAddGuardian = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: { session } } = await supabase.auth.getSession();
    await fetch("http://localhost:8000/api/guardians/add", {
      method: "POST",
      headers: { "Authorization": `Bearer ${session?.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ guardian_email: guardianEmail, guardian_phone: guardianPhone })
    });

    // Clear form and close modal
    setGuardianEmail("");
    setGuardianPhone("");
    setShowAddGuardianModal(false);

    // If it was onboarding, finish it
    if (showOnboarding) {
      setProfile(prev => prev ? { ...prev, is_enrolled: true } : null);
      setTimeout(() => {
        setShowOnboarding(false);
        setActiveTab("black-box");
        setIsMonitoring(false);
        setStatus("idle");
      }, 500);
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="flex min-h-screen flex-col bg-black text-zinc-100 font-sans selection:bg-zinc-800">
      <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-2 py-2 bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 rounded-full shadow-2xl flex items-center gap-1">
        <button onClick={() => setActiveTab("black-box")} className={`px-6 py-2 rounded-full text-sm font-semibold transition-all ${activeTab === "black-box" ? "bg-white text-black shadow-lg" : "text-zinc-400 hover:text-white"}`}>black-box</button>
        <button onClick={() => setActiveTab("history")} className={`px-6 py-2 rounded-full text-sm font-semibold transition-all ${activeTab === "history" ? "bg-white text-black shadow-lg" : "text-zinc-400 hover:text-white"}`}>history</button>
        <button onClick={() => setActiveTab("guardians")} className={`px-6 py-2 rounded-full text-sm font-semibold transition-all ${activeTab === "guardians" ? "bg-white text-black shadow-lg" : "text-zinc-400 hover:text-white"}`}>guardians</button>
        <button onClick={() => setActiveTab("notifications")} className={`px-6 py-2 rounded-full text-sm font-semibold transition-all relative ${activeTab === "notifications" ? "bg-white text-black shadow-lg" : "text-zinc-400 hover:text-white"}`}>
          notifications
          {unreadCount > 0 && <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white">{unreadCount}</span>}
        </button>
        <div className="w-[1px] h-4 bg-zinc-800 mx-2" />
        <button onClick={handleSignOut} className="pr-4 py-2 text-xs font-bold text-zinc-500 hover:text-red-400 transition-colors uppercase tracking-widest">Sign Out</button>
      </nav>

      {/* Onboarding Overlay */}
      {showOnboarding && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-2xl animate-in zoom-in-95 duration-300">
            {onboardingStep === 1 ? (
              <div className="text-center">
                <h2 className="text-2xl font-black mb-2">Voice Enrollment</h2>
                <div className="bg-black/50 p-6 rounded-2xl border border-zinc-800 italic text-lg mb-8 text-zinc-300">&quot;The quick brown fox jumps over the lazy dog. My shadow is my guardian, keeping me safe in the dark.&quot;</div>
                <button onClick={handleEnrollVoice} disabled={isRecording} className={`w-full py-4 rounded-full font-bold transition-all ${isRecording ? 'bg-red-500 animate-pulse text-white' : 'bg-white text-black hover:scale-105'}`}>{isRecording ? "RECORDING..." : "START RECORDING"}</button>
              </div>
            ) : (
              <div>
                <h2 className="text-2xl font-black mb-2 text-center">Guardian Setup</h2>
                <form onSubmit={handleAddGuardian} className="space-y-4">
                  <input type="email" required placeholder="Guardian Email" value={guardianEmail} onChange={(e) => setGuardianEmail(e.target.value)} className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:border-white/20 outline-none" />
                  <input type="tel" placeholder="Guardian Phone" value={guardianPhone} onChange={(e) => setGuardianPhone(e.target.value)} className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:border-white/20 outline-none" />
                  <button className="w-full py-4 bg-white text-black rounded-full font-bold hover:scale-105 transition-all">COMPLETE SETUP</button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Manual Add Guardian Modal */}
      {showAddGuardianModal && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowAddGuardianModal(false)}>
          <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black">Add Guardian</h2>
              <button onClick={() => setShowAddGuardianModal(false)} className="text-zinc-500 hover:text-white">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            <p className="text-zinc-400 text-sm mb-6">They will receive an alert if your risk levels spike during a session.</p>
            <form onSubmit={handleAddGuardian} className="space-y-4">
              <input type="email" required placeholder="Guardian Email" value={guardianEmail} onChange={(e) => setGuardianEmail(e.target.value)} className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:border-white/20 outline-none" />
              <input type="tel" placeholder="Guardian Phone" value={guardianPhone} onChange={(e) => setGuardianPhone(e.target.value)} className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:border-white/20 outline-none" />
              <button className="w-full py-4 bg-white text-black rounded-full font-bold hover:scale-105 transition-all">ADD GUARDIAN</button>
            </form>
          </div>
        </div>
      )}

      {activeTab === "black-box" && (
        <main className="flex-1 flex flex-col pt-24 pb-12 px-4 max-w-4xl mx-auto w-full">
          {!isMonitoring ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="mb-8 p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800 max-w-lg">
                <h2 className="text-xl font-bold mb-4 bg-gradient-to-r from-white to-zinc-500 bg-clip-text text-transparent">The Safety Shadow</h2>
                <p className="text-zinc-400 text-sm">Conversational guardian for high-stakes events. Real-time risk evaluation as you speak.</p>
              </div>
              <button onClick={startMonitoring} disabled={status === 'connecting'} className="px-10 py-5 bg-white text-black font-black rounded-full hover:scale-105 active:scale-95 transition-all">INITIATE BLACK-BOX</button>

            </div>
          ) : (
            <div className="flex-1 flex flex-col">
              <div className="flex items-center justify-between mb-8 p-6 bg-zinc-900/30 border border-zinc-800 rounded-2xl backdrop-blur-sm">
                <div>
                  <h3 className={`text-xl font-bold ${risk > 75 ? 'text-red-500' : 'text-zinc-100'}`}>{action}</h3>
                </div>
                <div className="text-right ml-6">
                  <span className="text-4xl font-black">{risk.toFixed(0)}%</span>
                  <div className="w-24 bg-zinc-800 h-1 mt-2 rounded-full overflow-hidden">
                    <div className={`h-full transition-all duration-1000 ${risk > 75 ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${risk}%` }} />
                  </div>
                </div>
              </div>
              <div className="flex-1 space-y-4 overflow-y-auto mb-4 pr-2 custom-scrollbar">
                {transcripts.map((t, i) => (<div key={i} className="flex flex-col items-end gap-1 ml-auto max-w-[85%]"><div className="px-4 py-3 rounded-2xl rounded-tr-none bg-white/5 border border-zinc-800/50 text-zinc-200 text-sm leading-relaxed">{t}</div></div>))}
                {currentTranscript && <div className="flex flex-col items-end gap-1 ml-auto max-w-[85%] animate-pulse"><div className="px-4 py-3 rounded-2xl rounded-tr-none bg-zinc-900/50 border border-zinc-800/30 text-zinc-400 text-sm italic">{currentTranscript}...</div></div>}
                <div ref={chatEndRef} />
              </div>
              <form onSubmit={sendManualChat} className="mb-6 relative">
                <input type="text" value={manualInput} onChange={(e) => setManualInput(e.target.value)} placeholder="Send silent context..." className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-white/20 transition-all pr-12" />
                <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-zinc-500 hover:text-white"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg></button>
              </form>
              <footer className="sticky bottom-0 bg-black/80 backdrop-blur-md pt-4 border-t border-zinc-900/50 flex items-center justify-between">
                <button onClick={stopMonitoring} className="px-6 py-3 bg-red-950/20 border border-red-500/20 text-red-500 text-sm font-bold rounded-xl hover:bg-red-500 hover:text-white transition-all">Terminate Session</button>
              </footer>
            </div>
          )}
        </main>
      )}

      {activeTab === "history" && (
        <main className="flex-1 flex flex-col pt-24 px-4 max-w-4xl mx-auto w-full">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-2xl font-black">Session Vault</h2>
          </div>
          <div className="space-y-4">
            {history.length === 0 ? <div className="p-8 border-2 border-dashed border-zinc-900 rounded-3xl text-center text-zinc-600 italic">No historical traces found.</div> :
              history.map((h, i) => (
                <div key={i} className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 transition-all hover:bg-zinc-900">
                  <div className="flex justify-between items-start mb-4">
                    <code className="text-xs text-zinc-300">{h.id}</code>
                    <span className="text-[10px] font-bold text-zinc-600">{new Date(h.created_at).toLocaleString()}</span>
                  </div>
                  <div className="space-y-2">
                    {h.logs?.slice(0, 3).map((l: any, i: number) => (<div key={i} className="text-sm text-zinc-400 line-clamp-1 border-l border-zinc-700 pl-3"><span className="text-[10px] font-mono mr-2 text-zinc-600">{l.speaker_label || 'USER'}:</span>{l.content}</div>))}
                  </div>
                </div>
              ))}
          </div>
        </main>
      )}

      {activeTab === "guardians" && (
        <main className="flex-1 flex flex-col pt-24 px-4 max-w-4xl mx-auto w-full">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-2xl font-black">Protected Connections</h2>
            <button onClick={() => setShowAddGuardianModal(true)} className="px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-full text-xs font-bold hover:bg-zinc-800 transition-all flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              ADD GUARDIAN
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {guarding.length === 0 ? <div className="col-span-full p-12 border-2 border-dashed border-zinc-900 rounded-3xl text-center text-zinc-600 italic">You aren&apos;t guarding anyone yet.</div> :
              guarding.map((p, i) => (
                <div key={i} className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 flex items-center justify-between group transition-all hover:bg-zinc-900">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-zinc-800 flex items-center justify-center font-black text-zinc-500 group-hover:text-white">{p.full_name?.charAt(0) || p.email.charAt(0).toUpperCase()}</div>
                    <div><h4 className="font-bold text-zinc-100">{p.full_name || "Anonymous User"}</h4><p className="text-xs text-zinc-500 font-mono">{p.email}</p></div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-green-500 uppercase tracking-widest mb-1 block">Active</span>
                    <button className="text-[10px] font-black text-white hover:underline uppercase">View Live Status</button>
                  </div>
                </div>
              ))}
          </div>
        </main>
      )}

      {activeTab === "notifications" && (
        <main className="flex-1 flex flex-col pt-24 px-4 max-w-2xl mx-auto w-full">
          <h2 className="text-2xl font-black mb-8">Alerts & Notifications</h2>
          <div className="space-y-4">
            {notifications.length === 0 ? <div className="p-12 border-2 border-dashed border-zinc-900 rounded-3xl text-center text-zinc-600 italic">No notifications yet.</div> :
              notifications.map((n, i) => (
                <div key={i} onClick={() => !n.is_read && markNotificationRead(n.id)} className={`bg-zinc-900/50 border ${n.is_read ? 'border-zinc-800' : 'border-zinc-100/20'} rounded-2xl p-6 transition-all hover:bg-zinc-900 cursor-pointer relative`}>
                  {!n.is_read && <div className="absolute top-6 right-6 h-2 w-2 rounded-full bg-blue-500" />}
                  <div className="mb-2 flex items-center gap-2">
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${n.type === 'risk_alert' ? 'bg-red-500/10 text-red-500' : 'bg-zinc-800 text-zinc-400'}`}>{n.type.replace('_', ' ')}</span>
                    <span className="text-[10px] text-zinc-600 font-mono">{new Date(n.created_at).toLocaleString()}</span>
                  </div>
                  <h4 className={`font-bold ${n.is_read ? 'text-zinc-400' : 'text-zinc-100'}`}>{n.title}</h4>
                  <p className="text-sm text-zinc-500 mt-2 leading-relaxed">{n.message}</p>
                </div>
              ))}
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
