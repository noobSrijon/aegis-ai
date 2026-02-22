"use client";

import { useState, useRef, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { AuthUser as User } from "@supabase/supabase-js";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"black-box" | "history" | "guardians" | "notifications" | "profile">("black-box");
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
  const [isLoading, setIsLoading] = useState(true);

  // Onboarding, History, Guarding & Notifications state
  const [profile, setProfile] = useState<{ is_enrolled: boolean, account_role?: string, email?: string, full_name?: string } | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState<1 | 2>(1);
  const [showAddGuardianModal, setShowAddGuardianModal] = useState(false);
  const [showInitiationModal, setShowInitiationModal] = useState(false);
  const [sessionContext, setSessionContext] = useState("");
  const [monitoringMode, setMonitoringMode] = useState<"audio" | "text" | "both">("both");

  const [history, setHistory] = useState<any[]>([]);
  const [guarding, setGuarding] = useState<any[]>([]);
  const [myGuardians, setMyGuardians] = useState<any[]>([]);
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

  const fetchBaseData = async () => {
    try {
      setIsLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const headers = { "Authorization": `Bearer ${session?.access_token}` };

      const [profRes, histRes, guardRes, myGuardRes, notifRes] = await Promise.all([
        fetch("http://localhost:8000/api/profile", { headers }),
        fetch("http://localhost:8000/api/history", { headers }),
        fetch("http://localhost:8000/api/guarding", { headers }),
        fetch("http://localhost:8000/api/my-guardians", { headers }),
        fetch("http://localhost:8000/api/notifications", { headers })
      ]);

      const [profData, histData, guardData, myGuardData, notifData] = await Promise.all([
        profRes.json(), histRes.json(), guardRes.json(), myGuardRes.json(), notifRes.json()
      ]);

      setProfile(profData);
      if (profData && !profData.is_enrolled) setShowOnboarding(true);
      if (profData?.account_role === "guardian") {
        setActiveTab("guardians");
      }

      setHistory(histData || []);
      setGuarding(guardData || []);
      setMyGuardians(myGuardData || []);
      setNotifications(notifData || []);
    } catch (err) {
      console.error("Base data fetch failed:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setUser(user);
      await fetchBaseData();
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

  const handleAcceptGuardian = async (id: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    await fetch(`http://localhost:8000/api/guardians/accept/${id}`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${session?.access_token}` }
    });
    await fetchBaseData();
  };

  const handleUpdateRole = async (isGuardian: boolean) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const role = isGuardian ? "guardian" : "both";
      const res = await fetch("http://localhost:8000/api/profile/role", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session?.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ account_role: role })
      });

      if (res.ok) {
        setProfile(prev => prev ? { ...prev, account_role: role } : null);
        if (role === "guardian" && (activeTab === "black-box" || activeTab === "history" || activeTab === "notifications")) {
          setActiveTab("guardians");
        }
      }
    } catch (err) {
      console.error("Failed to update role:", err);
    }
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
    // Clear old session state
    setTranscripts([]);
    setCurrentTranscript("");
    setRisk(0);
    setAction("Shadow is idle.");

    setStatus("connecting");
    setShowInitiationModal(false);
    console.log("Starting monitoring session...");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error("No active session found");
        setStatus("error");
        return;
      }

      console.log("Creating session thread...");
      const res = await fetch("http://localhost:8000/api/threads", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session?.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ initial_context: sessionContext || "" })
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("Thread creation failed with status:", res.status, errText);
        setStatus("error");
        return;
      }

      const data = await res.json();
      console.log("Thread created successfully:", data);

      if (!data || !data.id) {
        console.error("No thread ID in response:", data);
        setStatus("error");
        return;
      }

      setThreadId(data.id);

      const wsUrl = `ws://127.0.0.1:8000/ws/${data.id}`;
      console.log("Attempting WebSocket connection to:", wsUrl);

      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        console.log("WebSocket connected successfully!");
        setStatus("active");
        setIsMonitoring(true);
        if (monitoringMode === "audio" || monitoringMode === "both") {
          console.log("Starting audio recording...");
          startRecording();
        }
      };

      ws.current.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          setRisk(msg.risk || 0);
          setAction(msg.action || "Shadow is monitoring...");
          if (msg.transcript) {
            if (msg.is_final) {
              setTranscripts((prev) => [...prev, msg.transcript].slice(-20));
              setCurrentTranscript("");
            } else {
              setCurrentTranscript(msg.transcript);
            }
          }
        } catch (e) {
          console.error("Failed to parse WebSocket message:", event.data, e);
        }
      };

      ws.current.onclose = (event) => {
        console.log("WebSocket closed:", event.code, event.reason);
        stopMonitoring();
      };

      ws.current.onerror = (err) => {
        console.error("WebSocket error observed:", err);
        setStatus("error");
      };

    } catch (err) {
      console.error("Detailed monitoring initiation error:", err);
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
      console.error("Mic access error:", err);
      setStatus("error");
    }
  };

  const stopMonitoring = () => {
    console.log("Stopping monitoring session...");
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
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const formData = new FormData();
        formData.append("file", new Blob(["dummy"], { type: "audio/wav" }), "voice.wav");
        await fetch("http://localhost:8000/api/enroll-voice", {
          method: "POST",
          headers: { "Authorization": `Bearer ${session?.access_token}` },
          body: formData
        });
        setIsRecording(false);
        setOnboardingStep(2);
      } catch (err) {
        console.error("Voice enrollment failed:", err);
        setIsRecording(false);
      }
    }, 2000);
  };

  const handleAddGuardian = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await fetch("http://localhost:8000/api/guardians/add", {
        method: "POST",
        headers: { "Authorization": `Bearer ${session?.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ guardian_email: guardianEmail, guardian_phone: guardianPhone })
      });

      // Refresh data
      await fetchBaseData();

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
    } catch (err) {
      console.error("Add guardian failed:", err);
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="flex min-h-screen flex-col bg-black text-zinc-100 font-sans selection:bg-zinc-800">
      <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-2 py-2 bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 rounded-full shadow-2xl flex items-center gap-1">
        {isLoading ? (
          <div className="flex items-center gap-2 px-4 py-2">
            <div className="w-20 h-6 bg-zinc-800 rounded-full animate-shimmer" />
            <div className="w-20 h-6 bg-zinc-800 rounded-full animate-shimmer" />
            <div className="w-20 h-6 bg-zinc-800 rounded-full animate-shimmer" />
            <div className="w-20 h-6 bg-zinc-800 rounded-full animate-shimmer" />
          </div>
        ) : (
          <>
            {profile?.account_role !== "guardian" && (
              <>
                <button onClick={() => setActiveTab("black-box")} className={`px-6 py-2 rounded-full text-sm font-semibold transition-all ${activeTab === "black-box" ? "bg-white text-black shadow-lg" : "text-zinc-400 hover:text-white"}`}>black-box</button>
                <button onClick={() => setActiveTab("history")} className={`px-6 py-2 rounded-full text-sm font-semibold transition-all ${activeTab === "history" ? "bg-white text-black shadow-lg" : "text-zinc-400 hover:text-white"}`}>history</button>
              </>
            )}
            <button onClick={() => setActiveTab("guardians")} className={`px-6 py-2 rounded-full text-sm font-semibold transition-all ${activeTab === "guardians" ? "bg-white text-black shadow-lg" : "text-zinc-400 hover:text-white"}`}>guardians</button>
            <button onClick={() => setActiveTab("notifications")} className={`px-6 py-2 rounded-full text-sm font-semibold transition-all relative ${activeTab === "notifications" ? "bg-white text-black shadow-lg" : "text-zinc-400 hover:text-white"}`}>
              notifications
              {unreadCount > 0 && <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white">{unreadCount}</span>}
            </button>
            <button onClick={() => setActiveTab("profile")} className={`px-6 py-2 rounded-full text-sm font-semibold transition-all ${activeTab === "profile" ? "bg-white text-black shadow-lg" : "text-zinc-400 hover:text-white"}`}>profile</button>
          </>
        )}
      </nav>

      {isLoading && (
        <main className="flex-1 flex flex-col pt-32 px-4 max-w-4xl mx-auto w-full">
          <div className="w-48 h-10 bg-zinc-900 rounded-2xl mb-8 animate-shimmer" />
          <div className="space-y-4">
            <div className="h-32 bg-zinc-900/50 rounded-3xl animate-shimmer" />
            <div className="h-32 bg-zinc-900/50 rounded-3xl animate-shimmer" />
            <div className="h-32 bg-zinc-900/50 rounded-3xl animate-shimmer" />
          </div>
        </main>
      )}

      {!isLoading && activeTab === "black-box" && (
        <main className="flex-1 flex flex-col pt-24 pb-12 px-4 max-w-4xl mx-auto w-full">
          {!isMonitoring ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="mb-8 p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800 max-w-lg">
                <h2 className="text-xl font-bold mb-4 bg-gradient-to-r from-white to-zinc-500 bg-clip-text text-transparent">The Safety Shadow</h2>
                <p className="text-zinc-400 text-sm">Conversational guardian for high-stakes events. Real-time risk evaluation as you speak.</p>
              </div>
              <button onClick={() => {
                setSessionContext("");
                setMonitoringMode("both");
                setShowInitiationModal(true);
              }} disabled={status === 'connecting'} className="px-10 py-5 bg-white text-black font-black rounded-full hover:scale-105 active:scale-95 transition-all">INITIATE BLACK-BOX</button>
              {status === "error" && (
                <p className="mt-4 text-red-500 text-xs font-bold uppercase tracking-widest animate-pulse">Connection Failed. Please check console for details.</p>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col">
              <div className="flex items-center justify-between mb-8 p-6 bg-zinc-900/30 border border-zinc-800 rounded-2xl backdrop-blur-sm">
                <div>
                  <h3 className={`text-xl font-bold ${risk > 75 ? 'text-red-500' : 'text-zinc-100'}`}>{action}</h3>
                  {sessionContext && <p className="text-xs text-zinc-500 mt-1 italic line-clamp-1">Context: {sessionContext}</p>}
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
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase text-zinc-600 tracking-widest">Monitoring Mode:</span>
                  <span className="text-[10px] font-black uppercase text-white tracking-widest bg-zinc-900 px-3 py-1 rounded-full">{monitoringMode}</span>
                </div>
              </footer>
            </div>
          )}
        </main>
      )}

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

      {/* Initiation Modal */}
      {showInitiationModal && (
        <div className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-zinc-900 border border-zinc-100/10 rounded-[40px] p-10 shadow-3xl animate-in zoom-in-95 duration-300">
            <div className="mb-8">
              <h3 className="text-3xl font-black mb-2 tracking-tight">Initiate Session</h3>
              <p className="text-zinc-500 text-sm leading-relaxed">Tell us what's happening so your guardians have the full context if things escalate.</p>
            </div>

            <div className="space-y-8">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600 mb-4">SITUATION CONTEXT</label>
                <textarea
                  value={sessionContext}
                  onChange={(e) => setSessionContext(e.target.value)}
                  placeholder="e.g. Walking to my car in a dark parking lot..."
                  className="w-full bg-black border border-zinc-800 rounded-3xl p-5 text-sm text-zinc-100 placeholder:text-zinc-700 focus:outline-none focus:border-zinc-500 transition-all min-h-[120px] resize-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600 mb-4">MONITORING MODE</label>
                <div className="grid grid-cols-3 gap-3">
                  {(['audio', 'text', 'both'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setMonitoringMode(mode)}
                      className={`py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${monitoringMode === mode
                        ? 'bg-white text-black border-white shadow-[0_0_20px_rgba(255,255,255,0.1)]'
                        : 'bg-black text-zinc-500 border-zinc-800 hover:border-zinc-700'
                        }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-6 flex flex-col gap-4">
                <button
                  onClick={startMonitoring}
                  className="w-full py-5 bg-white text-black font-black rounded-full hover:scale-[1.02] active:scale-[0.98] transition-all uppercase tracking-[0.15em] shadow-xl"
                >
                  START BLACK-BOX
                </button>
                <button
                  onClick={() => setShowInitiationModal(false)}
                  className="w-full py-3 text-zinc-600 font-bold hover:text-zinc-400 transition-all uppercase text-[10px] tracking-widest"
                >
                  GO BACK
                </button>
              </div>
            </div>
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

      {/* Session Initiation Modal */}
      {showInitiationModal && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowInitiationModal(false)}>
          <div className="max-w-lg w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black">Session Setup</h2>
              <button onClick={() => setShowInitiationModal(false)} className="text-zinc-500 hover:text-white">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Situation Context</label>
                <textarea
                  placeholder="e.g. Walking home late at night, Meeting someone from the internet, Heading into a tense meeting..."
                  value={sessionContext}
                  onChange={(e) => setSessionContext(e.target.value)}
                  className="w-full bg-black border border-zinc-800 rounded-2xl p-4 text-sm focus:border-white/20 outline-none h-32 resize-none leading-relaxed"
                />
                <p className="text-[10px] text-zinc-600 mt-2 italic">This helps your shadow better evaluate incoming risks.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Monitoring Mode</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['audio', 'text', 'both'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMonitoringMode(m)}
                      className={`py-3 rounded-xl border text-[10px] font-black uppercase transition-all ${monitoringMode === m ? 'bg-white text-black border-white' : 'bg-black text-zinc-500 border-zinc-800 hover:border-zinc-700'}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={startMonitoring}
                disabled={status === 'connecting'}
                className="w-full py-5 bg-white text-black font-black rounded-full hover:scale-105 active:scale-95 transition-all mt-4"
              >
                {status === 'connecting' ? 'CONNECTING...' : 'INITIATE BLACK-BOX'}
              </button>
            </div>
          </div>
        </div>
      )}


      {!isLoading && activeTab === "history" && (
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
                  {h.initial_context && (
                    <div className="mb-4 p-3 bg-black/50 border border-zinc-800 rounded-xl text-xs text-zinc-500 italic">
                      &quot;{h.initial_context}&quot;
                    </div>
                  )}
                  <div className="space-y-2">
                    {h.logs?.slice(0, 3).map((l: any, i: number) => (<div key={i} className="text-sm text-zinc-400 line-clamp-1 border-l border-zinc-700 pl-3"><span className="text-[10px] font-mono mr-2 text-zinc-600">{l.speaker_label || 'USER'}:</span>{l.content}</div>))}
                  </div>
                </div>
              ))}
          </div>
        </main>
      )}

      {!isLoading && activeTab === "guardians" && (
        <main className="flex-1 flex flex-col pt-24 px-4 max-w-4xl mx-auto w-full pb-20">
          <div className={`grid grid-cols-1 ${profile?.account_role !== "guardian" ? 'lg:grid-cols-2' : ''} gap-12`}>
            {/* Left Column: My Protectors */}
            {profile?.account_role !== "guardian" && (
              <div>
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-black">My Protectors</h2>
                  <button onClick={() => setShowAddGuardianModal(true)} className="px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-full text-xs font-bold hover:bg-zinc-800 transition-all flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    ADD
                  </button>
                </div>
                <p className="text-zinc-500 text-sm mb-6">These are the people notified during your high-risk sessions.</p>
                <div className="space-y-3">
                  {myGuardians.length === 0 ? <div className="p-8 border border-dashed border-zinc-900 rounded-2xl text-center text-zinc-600 text-sm">Nobody is protecting you yet.</div> :
                    myGuardians.map((g, i) => (
                      <div key={i} className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-zinc-500 uppercase">{g.guardian_email?.charAt(0)}</div>
                          <div>
                            <h4 className="text-sm font-bold text-zinc-200">{g.guardian_email}</h4>
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${g.status === 'active' ? 'text-green-500' : 'text-zinc-500'}`}>{g.status}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Right Column: People I Guard */}
            <div>
              <h2 className="text-2xl font-black mb-6">Watching Over</h2>
              <p className="text-zinc-500 text-sm mb-6">Users who have added you as their safety contact.</p>
              <div className="grid grid-cols-1 gap-4">
                {guarding.length === 0 ? <div className="p-12 border-2 border-dashed border-zinc-900 rounded-3xl text-center text-zinc-600 italic">You aren&apos;t guarding anyone yet.</div> :
                  guarding.map((rel, i) => {
                    const p = rel.profiles;
                    if (!p) return null;
                    return (
                      <div key={rel.id} className="bg-zinc-100/[0.03] border border-zinc-800/50 rounded-3xl p-6 flex items-center justify-between group transition-all hover:bg-zinc-900">
                        <div className="flex items-center gap-4">
                          <div className="h-12 w-12 rounded-full bg-zinc-800 flex items-center justify-center font-black text-zinc-500 group-hover:text-white uppercase">{p.full_name?.charAt(0) || p.email.charAt(0)}</div>
                          <div>
                            <h4 className="font-bold text-zinc-100">{p.full_name || "Anonymous User"}</h4>
                            <p className="text-xs text-zinc-500 font-mono mb-1">{p.email}</p>
                            <span className={`text-[10px] font-bold uppercase ${rel.status === 'active' ? 'text-green-500' : 'text-yellow-500'}`}>{rel.status}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          {rel.status === 'pending' ? (
                            <button onClick={() => handleAcceptGuardian(rel.id)} className="px-4 py-2 bg-white text-black text-[10px] font-black rounded-full hover:scale-105 transition-all uppercase">Accept Request</button>
                          ) : (
                            <button className="text-[10px] font-black text-white hover:underline uppercase transition-all">Live Status</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </main>
      )}

      {!isLoading && activeTab === "notifications" && (
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

      {!isLoading && activeTab === "profile" && (
        <main className="flex-1 flex flex-col pt-24 px-4 max-w-2xl mx-auto w-full">
          <h2 className="text-2xl font-black mb-8">Profile & Settings</h2>
          <div className="space-y-6">
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
              <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-4">Account Information</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600 mb-1">Email Address</label>
                  <p className="text-zinc-100 font-medium">{profile?.email || user?.email}</p>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600 mb-1">Full Name</label>
                  <p className="text-zinc-100 font-medium">{profile?.full_name || "Not provided"}</p>
                </div>
              </div>
            </div>

            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
              <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-4">Preferences</h3>
              <div className="flex items-center justify-between p-4 bg-black/30 border border-zinc-800 rounded-xl">
                <div>
                  <h4 className="font-bold text-zinc-100">Guardian Mode</h4>
                  <p className="text-xs text-zinc-500">Only show guardian features</p>
                </div>
                <button
                  onClick={() => handleUpdateRole(profile?.account_role !== "guardian")}
                  className={`w-12 h-6 rounded-full transition-all relative ${profile?.account_role === "guardian" ? 'bg-white' : 'bg-zinc-800'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full transition-all ${profile?.account_role === "guardian" ? 'right-1 bg-black' : 'left-1 bg-zinc-600'}`} />
                </button>
              </div>
            </div>

            <button
              onClick={handleSignOut}
              className="w-full py-4 bg-red-950/20 border border-red-500/20 text-red-500 font-bold rounded-2xl hover:bg-red-500 hover:text-white transition-all uppercase text-sm tracking-widest"
            >
              Sign Out
            </button>
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
