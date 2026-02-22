"use client";

import { useState, useRef, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { AuthUser as User } from "@supabase/supabase-js";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"aegis-ai" | "history" | "guardians" | "notifications" | "profile">("aegis-ai");
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
  const [onboardingStep, setOnboardingStep] = useState<0 | 1 | 2>(0);
  const [showAddGuardianModal, setShowAddGuardianModal] = useState(false);
  const [showInitiationModal, setShowInitiationModal] = useState(false);
  const [sessionContext, setSessionContext] = useState("");
  const [monitoringMode, setMonitoringMode] = useState<"audio" | "text" | "both">("both");

  const [history, setHistory] = useState<any[]>([]);
  const [guarding, setGuarding] = useState<any[]>([]);
  const [myGuardians, setMyGuardians] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [aiNotifications, setAiNotifications] = useState<{ text: string; risk: number; time: string }[]>([]);
  const [guardianEmail, setGuardianEmail] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [isSubmittingGuardian, setIsSubmittingGuardian] = useState(false);
  const [selectedWard, setSelectedWard] = useState<{ id: string, name: string } | null>(null);
  const [wardThreads, setWardThreads] = useState<any[]>([]);
  const [isLoadingThreads, setIsLoadingThreads] = useState(false);
  const [showWardThreadsModal, setShowWardThreadsModal] = useState(false);

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
      if (profData && !profData.is_enrolled) {
        setShowOnboarding(true);
        setOnboardingStep(0);
      }
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

  const handleRemoveGuardian = async (id: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`http://localhost:8000/api/guardians/${id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${session?.access_token}` }
      });

      if (res.ok) {
        await fetchBaseData();
      }
    } catch (err) {
      console.error("Failed to remove guardian:", err);
    }
  };

  const fetchWardThreads = async (wardId: string, wardName: string) => {
    try {
      setIsLoadingThreads(true);
      setSelectedWard({ id: wardId, name: wardName });
      setShowWardThreadsModal(true);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`http://localhost:8000/api/guarding/threads/${wardId}`, {
        headers: { "Authorization": `Bearer ${session?.access_token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setWardThreads(data || []);
      } else {
        console.error("Failed to fetch ward threads");
        setWardThreads([]);
      }
    } catch (err) {
      console.error("Ward threads fetch error:", err);
    } finally {
      setIsLoadingThreads(false);
    }
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
        body: JSON.stringify({
          account_role: role,
          is_enrolled: role === "guardian" ? true : undefined
        })
      });

      if (res.ok) {
        setProfile(prev => prev ? { ...prev, account_role: role, is_enrolled: role === "guardian" ? true : prev.is_enrolled } : null);
        if (role === "guardian") {
          setActiveTab("guardians");
          setShowOnboarding(false);
        } else {
          setOnboardingStep(1);
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
    setAiNotifications([]);

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

          if (msg.risk !== undefined) {
            setRisk(msg.risk);
          }

          if (msg.action !== undefined) {
            setAction(msg.action);

            // Only push AI notifications when the server explicitly sends a new action field
            if (msg.action !== "Shadow is monitoring..." && msg.action !== "Shadow is idle.") {
              setAiNotifications(prev => {
                // Deduplicate: Don't add if the same message was the last one added
                if (prev.length > 0 && prev[0].text === msg.action) {
                  return prev;
                }
                const now = new Date();
                const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                return [{ text: msg.action, risk: msg.risk || risk, time: timeStr }, ...prev].slice(0, 50);
              });
            }
          }
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
    if (isSubmittingGuardian) return;
    setIsSubmittingGuardian(true);
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
          setActiveTab("aegis-ai");
          setIsMonitoring(false);
          setStatus("idle");
        }, 500);
      }
    } catch (err) {
      console.error("Add guardian failed:", err);
    } finally {
      setIsSubmittingGuardian(false);
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="flex min-h-screen flex-col bg-mesh text-foreground font-sans selection:bg-primary/10 overflow-x-hidden relative">
      {/* Background Halo */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] bg-primary/10 rounded-full blur-[120px] floating-halo" />
        <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] bg-primary/5 rounded-full blur-[100px] animate-pulse" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[50%] h-[50%] bg-primary/5 rounded-full blur-[100px] animate-pulse" />
      </div>

      <nav className="fixed top-4 md:top-8 left-1/2 -translate-x-1/2 z-50 p-2 bg-white/30 backdrop-blur-3xl border border-white/40 rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.04)] flex items-center gap-1.5 transition-all duration-500 hover:bg-white/50 hover:border-white/60 max-w-[95vw] overflow-x-auto no-scrollbar">
        {isLoading ? (
          <div className="flex items-center gap-2 px-6 py-2">
            <div className="w-16 h-4 bg-slate-200/50 rounded-full animate-pulse" />
            <div className="w-16 h-4 bg-slate-200/50 rounded-full animate-pulse" />
            <div className="w-16 h-4 bg-slate-200/50 rounded-full animate-pulse" />
          </div>
        ) : (
          <>
            {profile?.account_role !== "guardian" && (
              <>
                <button
                  onClick={() => setActiveTab("aegis-ai")}
                  className={`px-5 md:px-6 py-3 md:py-2.5 rounded-full text-[10px] font-black uppercase tracking-[0.25em] transition-all duration-300 flex items-center gap-2.5 ${activeTab === "aegis-ai" ? "bg-slate-900 text-white shadow-[0_8px_16px_rgba(0,0,0,0.1)]" : "text-slate-500 hover:text-slate-900 hover:bg-slate-900/5"}`}
                >
                  <svg className="w-4 h-4 md:w-3.5 md:h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                  <span className="hidden md:inline whitespace-nowrap">Aegis AI</span>
                </button>
                <button
                  onClick={() => setActiveTab("history")}
                  className={`px-5 md:px-6 py-3 md:py-2.5 rounded-full text-[10px] font-black uppercase tracking-[0.25em] transition-all duration-300 flex items-center gap-2.5 ${activeTab === "history" ? "bg-slate-900 text-white shadow-[0_8px_16px_rgba(0,0,0,0.1)]" : "text-slate-500 hover:text-slate-900 hover:bg-slate-900/5"}`}
                >
                  <svg className="w-4 h-4 md:w-3.5 md:h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                  <span className="hidden md:inline whitespace-nowrap">History</span>
                </button>
              </>
            )}
            <button
              onClick={() => setActiveTab("guardians")}
              className={`px-5 md:px-6 py-3 md:py-2.5 rounded-full text-[10px] font-black uppercase tracking-[0.25em] transition-all duration-300 flex items-center gap-2.5 ${activeTab === "guardians" ? "bg-slate-900 text-white shadow-[0_8px_16px_rgba(0,0,0,0.1)]" : "text-slate-500 hover:text-slate-900 hover:bg-slate-900/5"}`}
            >
              <svg className="w-4 h-4 md:w-3.5 md:h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
              <span className="hidden md:inline whitespace-nowrap">Guardians</span>
            </button>
            <button
              onClick={() => setActiveTab("notifications")}
              className={`px-5 md:px-6 py-3 md:py-2.5 rounded-full text-[10px] font-black uppercase tracking-[0.25em] transition-all duration-300 flex items-center gap-2.5 relative ${activeTab === "notifications" ? "bg-slate-900 text-white shadow-[0_8px_16px_rgba(0,0,0,0.1)]" : "text-slate-500 hover:text-slate-900 hover:bg-slate-900/5"}`}
            >
              <svg className="w-4 h-4 md:w-3.5 md:h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
              <span className="hidden md:inline whitespace-nowrap">Alerts</span>
              {unreadCount > 0 && <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent-warm text-[8px] font-black text-white shadow-lg ring-2 ring-white">{unreadCount}</span>}
            </button>
            <div className="w-[1px] h-4 bg-slate-200 mx-1" />
            <button
              onClick={() => setActiveTab("profile")}
              className={`px-5 md:px-6 py-3 md:py-2.5 rounded-full text-[10px] font-black uppercase tracking-[0.25em] transition-all duration-300 flex items-center gap-2.5 ${activeTab === "profile" ? "bg-slate-900 text-white shadow-[0_8px_16px_rgba(0,0,0,0.1)]" : "text-slate-500 hover:text-slate-900 hover:bg-slate-900/5"}`}
            >
              <svg className="w-4 h-4 md:w-3.5 md:h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
              <span className="hidden md:inline whitespace-nowrap">Account</span>
            </button>
          </>
        )}
      </nav>

      {isLoading && (
        <main className="flex-1 flex flex-col pt-40 px-4 max-w-4xl mx-auto w-full">
          <div className="w-48 h-10 bg-slate-100 rounded-2xl mb-8 animate-pulse" />
          <div className="space-y-4">
            <div className="h-32 bg-slate-50 rounded-3xl animate-pulse" />
            <div className="h-32 bg-slate-50 rounded-3xl animate-pulse" />
            <div className="h-32 bg-slate-50 rounded-3xl animate-pulse" />
          </div>
        </main>
      )}

      {!isLoading && activeTab === "aegis-ai" && (
        <main className={`flex-1 flex flex-col mx-auto w-full relative z-10 ${isMonitoring ? 'max-w-7xl lg:h-screen lg:max-h-screen lg:overflow-hidden' : 'max-w-5xl pt-40 pb-12'}`}>
          {isMonitoring && <div className="h-24 flex-shrink-0" />} {/* Spacer for fixed nav */}
          {!isMonitoring ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
              <div className="relative mb-16 select-none group">
                <h1 className="text-7xl md:text-8xl lg:text-9xl font-black tracking-tighter leading-none relative text-slate-900">
                  Aegis AI
                </h1>

              </div>

              <p className="text-slate-500 text-lg md:text-xl leading-relaxed max-w-2xl mb-12 font-medium">
                Real-time risk evaluation for high-stakes events.
                <span className="block text-slate-400 text-sm mt-2 font-normal">Advanced AI protection as you speak.</span>
              </p>

              <button
                onClick={() => {
                  setSessionContext("");
                  setMonitoringMode("both");
                  setShowInitiationModal(true);
                }}
                disabled={status === 'connecting'}
                className="group relative px-12 py-6 bg-primary text-white font-black rounded-full transition-all hover:-translate-y-1 active:scale-95 flex items-center gap-4 uppercase tracking-[0.2em] overflow-hidden"
              >
                <span className="relative z-10">INITIATE AEGIS AI</span>
                <svg className="w-5 h-5 text-white transition-transform relative z-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </button>

              {status === "error" && (
                <p className="mt-8 text-red-500 text-[10px] font-black uppercase tracking-widest animate-pulse border border-red-100 bg-red-50/50 px-4 py-2 rounded-full">
                  Connection Failed • Check System Console
                </p>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0 px-4 pb-6 overflow-hidden">
              {/* Risk Header Bar */}
              <div className="flex items-center justify-between mb-4 p-4 bg-white/80 border border-slate-200 rounded-2xl backdrop-blur-sm flex-shrink-0 shadow-sm">
                <div className="flex-1 mr-4">
                  <h3 className={`text-base font-bold line-clamp-1 ${risk > 75 ? 'text-red-500' : 'text-slate-900'}`}>{action}</h3>
                  {sessionContext && <p className="text-xs text-slate-500 mt-0.5 italic line-clamp-1">Context: {sessionContext}</p>}
                </div>
                <div className="text-right flex-shrink-0">
                  <span className={`text-3xl font-black ${risk > 75 ? 'text-red-500' : risk > 40 ? 'text-amber-500' : 'text-primary'}`}>{risk.toFixed(0)}%</span>
                  <div className="w-20 bg-slate-100 h-1 mt-1.5 rounded-full overflow-hidden">
                    <div className={`h-full transition-all duration-1000 ${risk > 75 ? 'bg-red-500' : risk > 40 ? 'bg-amber-500' : 'bg-primary'}`} style={{ width: `${risk}%` }} />
                  </div>
                </div>
              </div>

              {/* Two-Panel Layout */}
              <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0 lg:overflow-hidden">

                {/* LEFT PANEL — Chat Window */}
                <div className="flex-none h-[450px] lg:h-auto lg:flex-1 lg:max-w-sm flex flex-col min-h-0 min-w-0">
                  {/* Transcript Feed */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-1 mb-3">
                    {transcripts.length === 0 && !currentTranscript && (
                      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
                        <div className="w-12 h-12 rounded-full bg-primary/5 border border-primary/20 flex items-center justify-center">
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
                        </div>
                        <p className="text-[12px] text-slate-500 leading-relaxed">Listening... Speak or type to begin</p>
                      </div>
                    )}
                    {transcripts.map((t, i) => (
                      <div key={i} className="flex flex-col items-end gap-1 ml-auto max-w-[90%]">
                        <div className="px-4 py-3 rounded-2xl rounded-tr-none bg-surface border border-border shadow-sm text-slate-900 text-sm leading-relaxed">{t}</div>
                      </div>
                    ))}
                    {currentTranscript && (
                      <div className="flex flex-col items-end gap-1 ml-auto max-w-[90%] animate-pulse">
                        <div className="px-4 py-3 rounded-2xl rounded-tr-none bg-slate-50 border border-border text-slate-500 text-sm italic">{currentTranscript}...</div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Text Input */}
                  <form onSubmit={sendManualChat} className="relative flex-shrink-0">
                    <input
                      type="text"
                      value={manualInput}
                      onChange={(e) => setManualInput(e.target.value)}
                      placeholder="Send silent context to Shadow..."
                      className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/40 transition-all pr-12 shadow-sm"
                    />
                    <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-primary transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                    </button>
                  </form>
                </div>

                {/* RIGHT PANEL — AI Notifications & Suggestions */}
                <div className="flex-none h-[450px] lg:h-auto lg:flex-1 flex flex-col min-h-0 bg-surface border border-border rounded-2xl overflow-hidden min-w-0 shadow-sm">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-slate-50 flex-shrink-0">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">AI Insights</span>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
                    {aiNotifications.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-4">
                        <div className="w-10 h-10 rounded-full bg-primary/5 border border-primary/10 flex items-center justify-center">
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 5v5l4 2" /></svg>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-relaxed">AI insights will appear here as Shadow monitors the session</p>
                      </div>
                    ) : (
                      aiNotifications.map((notif, i) => (
                        <div
                          key={i}
                          className={`p-3 rounded-xl border text-xs leading-relaxed transition-all shadow-sm ${notif.risk > 75
                            ? 'bg-red-50 border-red-200 text-red-700'
                            : notif.risk > 40
                              ? 'bg-amber-50 border-amber-200 text-amber-700'
                              : 'bg-surface border-border text-slate-600'
                            }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className={`text-[9px] font-black uppercase tracking-widest ${notif.risk > 75 ? 'text-red-600' : notif.risk > 40 ? 'text-amber-600' : 'text-primary'
                              }`}>
                              {notif.risk > 75 ? '⚠ HIGH RISK' : notif.risk > 40 ? '⚡ ELEVATED' : '✦ INSIGHT'}
                            </span>
                            <span className="text-[9px] text-slate-400 font-mono">{notif.time}</span>
                          </div>
                          {notif.text}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <footer className="flex-shrink-0 mt-4 pt-4 border-t border-border flex items-center justify-between">
                <button onClick={stopMonitoring} className="px-6 py-3 bg-red-50 border border-red-200 text-red-600 text-sm font-bold rounded-xl hover:bg-red-600 hover:text-white transition-all">Terminate Session</button>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Mode:</span>
                  <span className="text-[10px] font-black uppercase text-primary tracking-widest bg-primary/5 border border-primary/20 px-3 py-1 rounded-full">{monitoringMode}</span>
                </div>
              </footer>
            </div>
          )}
        </main>
      )}

      {showOnboarding && (
        <div className="fixed inset-0 z-[100] bg-slate-900/10 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-surface border border-border rounded-[32px] p-8 shadow-2xl animate-in zoom-in-95 duration-300">
            {onboardingStep === 0 ? (
              <div className="text-center">
                <h2 className="text-2xl font-black mb-2 text-slate-900">Choose Your Role</h2>
                <p className="text-slate-500 text-sm mb-8">How will you be using Aegis AI today?</p>
                <div className="grid grid-cols-1 gap-4">
                  <button
                    onClick={() => handleUpdateRole(false)}
                    className="group p-6 bg-slate-50 border border-border rounded-2xl text-left hover:border-primary/50 transition-all hover:bg-white shadow-sm"
                  >
                    <h3 className="font-bold text-slate-900 mb-1">I need Protection</h3>
                    <p className="text-xs text-slate-500">I want my guardians to monitor me during high-stakes events.</p>
                  </button>
                  <button
                    onClick={() => handleUpdateRole(true)}
                    className="group p-6 bg-slate-50 border border-border rounded-2xl text-left hover:border-primary/50 transition-all hover:bg-white shadow-sm"
                  >
                    <h3 className="font-bold text-slate-900 mb-1">I am a Guardian</h3>
                    <p className="text-xs text-slate-500">I am here only to watch over others and respond to alerts.</p>
                  </button>
                </div>
              </div>
            ) : onboardingStep === 1 ? (
              <div className="text-center">
                <h2 className="text-2xl font-black mb-4 text-slate-900">Voice Enrollment</h2>
                <div className="bg-slate-50 p-6 rounded-2xl border border-border italic text-lg mb-8 text-slate-600 leading-relaxed">
                  &quot;The quick brown fox jumps over the lazy dog. My shadow is my guardian, keeping me safe in the dark.&quot;
                </div>
                <button
                  onClick={handleEnrollVoice}
                  disabled={isRecording}
                  className={`w-full py-4 rounded-full font-bold transition-all shadow-md ${isRecording ? 'bg-accent-warm animate-pulse text-white' : 'bg-primary text-white hover:scale-105 hover:bg-teal-bright'}`}
                >
                  {isRecording ? "RECORDING..." : "START RECORDING"}
                </button>
              </div>
            ) : (
              <div>
                <h2 className="text-2xl font-black mb-6 text-center text-slate-900">Guardian Setup</h2>
                <form onSubmit={handleAddGuardian} className="space-y-4">
                  <input type="email" required placeholder="Guardian Email" value={guardianEmail} onChange={(e) => setGuardianEmail(e.target.value)} className="w-full bg-slate-50 border border-border rounded-xl px-4 py-3 text-sm focus:border-primary outline-none text-slate-900 placeholder:text-slate-400 transition-all" />
                  <input type="tel" placeholder="Guardian Phone" value={guardianPhone} onChange={(e) => setGuardianPhone(e.target.value)} className="w-full bg-slate-50 border border-border rounded-xl px-4 py-3 text-sm focus:border-primary outline-none text-slate-900 placeholder:text-slate-400 transition-all" />
                  <button
                    disabled={isSubmittingGuardian}
                    className="w-full py-4 bg-primary text-white rounded-full font-black hover:bg-teal-bright hover:scale-105 transition-all flex items-center justify-center gap-2 mt-4 shadow-lg shadow-primary/20 disabled:opacity-50"
                  >
                    {isSubmittingGuardian ? (
                      <>
                        <div className="h-4 w-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        PROCESSING...
                      </>
                    ) : (
                      "COMPLETE SETUP"
                    )}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {showInitiationModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/10 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowInitiationModal(false)}>
          <div className="max-w-lg w-full bg-surface border border-border rounded-[32px] p-8 shadow-2xl active:scale-[0.99] transition-all" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black flex items-center gap-3">
                <span className="w-1.5 h-6 bg-primary rounded-full" />
                Session Setup
              </h2>
              <button onClick={() => setShowInitiationModal(false)} className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:text-slate-900 transition-colors border border-border">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-3">SITUATION CONTEXT <span className="text-accent-warm ml-1">*</span></label>
                <textarea
                  placeholder="e.g. Walking home late at night..."
                  value={sessionContext}
                  onChange={(e) => setSessionContext(e.target.value)}
                  className={`w-full bg-slate-50 border rounded-2xl p-5 text-sm focus:border-primary outline-none h-32 resize-none leading-relaxed transition-all placeholder:text-slate-300 ${sessionContext.trim() ? 'border-border' : 'border-accent-warm/30'}`}
                />
                {!sessionContext.trim() && (
                  <p className="mt-2 text-[10px] text-accent-warm/70 font-semibold">Required — describe your situation so Shadow can protect you.</p>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-3">MONITORING MODE</label>
                <div className="grid grid-cols-3 gap-3">
                  {(['audio', 'text', 'both'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setMonitoringMode(mode)}
                      className={`py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${monitoringMode === mode
                        ? 'bg-primary text-white border-primary shadow-sm'
                        : 'bg-slate-50 text-slate-500 border-border hover:border-primary/50'
                        }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-4 space-y-3">
                <button
                  onClick={startMonitoring}
                  disabled={status === 'connecting' || !sessionContext.trim()}
                  className={`w-full py-5 font-black rounded-full transition-all uppercase tracking-[0.15em] shadow-lg ${!sessionContext.trim()
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'
                    : 'bg-primary text-white hover:bg-teal-bright hover:scale-[1.02] active:scale-[0.98] shadow-primary/20'
                    }`}
                >
                  {status === 'connecting' ? 'CONNECTING...' : 'START AEGIS AI'}
                </button>
                <button
                  onClick={() => setShowInitiationModal(false)}
                  className="w-full py-3 text-slate-400 font-bold hover:text-slate-600 transition-all uppercase text-[10px] tracking-widest"
                >
                  CANCEL
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAddGuardianModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/10 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowAddGuardianModal(false)}>
          <div className="max-w-md w-full bg-surface border border-border rounded-[32px] p-8 shadow-2xl animate-in fade-in zoom-in duration-300" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                <span className="w-1.5 h-6 bg-primary rounded-full" />
                Add Guardian
              </h2>
              <button onClick={() => setShowAddGuardianModal(false)} className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:text-slate-900 transition-colors border border-border">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            <p className="text-slate-500 text-sm mb-8 leading-relaxed">They will receive an alert if your risk levels spike during a session.</p>
            <form onSubmit={handleAddGuardian} className="space-y-4">
              <input type="email" required placeholder="Guardian Email" value={guardianEmail} onChange={(e) => setGuardianEmail(e.target.value)} className="w-full bg-slate-50 border border-border rounded-xl px-4 py-3 text-sm focus:border-primary outline-none text-slate-900 placeholder:text-slate-400 transition-all" />
              <input type="tel" placeholder="Guardian Phone (optional)" value={guardianPhone} onChange={(e) => setGuardianPhone(e.target.value)} className="w-full bg-slate-50 border border-border rounded-xl px-4 py-3 text-sm focus:border-primary outline-none text-slate-900 placeholder:text-slate-400 transition-all" />
              <div className="pt-2 space-y-3">
                <button
                  disabled={isSubmittingGuardian}
                  className="w-full py-4 bg-primary text-white rounded-full font-black hover:bg-teal-bright hover:scale-105 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20 disabled:opacity-50"
                >
                  {isSubmittingGuardian ? (
                    <>
                      <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ADDING...
                    </>
                  ) : (
                    "ADD GUARDIAN"
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddGuardianModal(false)}
                  className="w-full py-3 text-slate-400 font-bold hover:text-slate-600 transition-all uppercase text-[10px] tracking-widest"
                >
                  CANCEL
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showWardThreadsModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/10 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowWardThreadsModal(false)}>
          <div className="max-w-xl w-full bg-surface border border-border rounded-[32px] p-8 shadow-2xl animate-in fade-in zoom-in duration-300 flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6 flex-shrink-0">
              <h2 className="text-2xl font-black flex items-center gap-3">
                <span className="w-1.5 h-6 bg-primary rounded-full" />
                {selectedWard?.name}&apos;s Sessions
              </h2>
              <button onClick={() => setShowWardThreadsModal(false)} className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:text-slate-900 transition-colors border border-border">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-1">
              {isLoadingThreads ? (
                <div className="py-20 flex flex-col items-center justify-center gap-4">
                  <div className="h-12 w-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-primary">Scanning Vault...</p>
                </div>
              ) : wardThreads.length === 0 ? (
                <div className="p-12 border-2 border-dashed border-border rounded-[32px] text-center text-slate-400 italic bg-slate-50">
                  No historical traces found for this user.
                </div>
              ) : (
                wardThreads.map((h: any, i: number) => (
                  <div
                    key={i}
                    onClick={() => router.push(`/live-status?threadId=${h.id}`)}
                    className="bg-surface border border-border rounded-[24px] p-5 cursor-pointer transition-all hover:bg-slate-50 hover:border-primary/40 shadow-sm group relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    </div>
                    <div className="flex justify-between items-start mb-3">
                      <code className="text-[9px] text-primary font-black font-mono bg-primary/10 px-2 py-0.5 rounded-md">{h.id.substring(0, 8)}...</code>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{new Date(h.created_at).toLocaleString()}</span>
                    </div>
                    {h.initial_context && (
                      <p className="text-xs text-slate-700 font-medium line-clamp-2 italic mb-1">
                        &quot;{h.initial_context}&quot;
                      </p>
                    )}
                    <span className="text-[8px] font-black uppercase tracking-widest text-primary opacity-60">Click to monitor session dashboard</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}


      {/* History View */}
      {!isLoading && activeTab === "history" && (
        <main className="flex-1 flex flex-col pt-32 px-4 max-w-4xl mx-auto w-full relative z-10">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-2xl font-black flex items-center gap-3">
              <span className="w-1.5 h-6 bg-primary rounded-full" />
              Session Vault
            </h2>
          </div>
          <div className="space-y-4">
            {history.length === 0 ? <div className="p-12 border-2 border-dashed border-border rounded-[32px] text-center text-slate-400 italic bg-surface/30">No historical traces found.</div> :
              history.map((h, i) => (
                <div 
                  key={i} 
                  onClick={() => router.push(`/live-status?threadId=${h.id}`)}
                  className="bg-surface border border-border rounded-[24px] p-6 transition-all hover:bg-slate-50 hover:border-primary/30 shadow-sm group cursor-pointer relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                  </div>
                  <div className="flex justify-between items-start mb-4">
                    <code className="text-[10px] text-primary font-mono bg-primary/10 px-2 py-0.5 rounded-md">{h.id.substring(0, 8)}...</code>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{new Date(h.created_at).toLocaleString()}</span>
                  </div>
                  {h.initial_context && (
                    <div className="mb-4 p-4 bg-slate-50 border border-border rounded-2xl text-xs text-slate-600 italic leading-relaxed">
                      &quot;{h.initial_context}&quot;
                    </div>
                  )}
                  <div className="space-y-3">
                    {h.logs?.slice(0, 2).map((l: any, i: number) => (
                      <div key={i} className="text-sm text-slate-700 line-clamp-1 border-l-2 border-primary/20 pl-4 py-1">
                        <span className="text-[10px] font-black mr-3 text-primary uppercase tracking-wider">{l.speaker_label || 'USER'}:</span>
                        {l.content}
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 pt-3 border-t border-border/50 text-[10px] font-black text-primary uppercase tracking-[0.2em] opacity-60 group-hover:opacity-100 transition-opacity flex items-center gap-2">
                    Open Detailed Transcription 
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  </div>
                </div>
              ))}
          </div>
        </main>
      )}

      {/* Guardians View */}
      {!isLoading && activeTab === "guardians" && (
        <main className="flex-1 flex flex-col pt-32 px-4 max-w-4xl mx-auto w-full pb-20 relative z-10">
          <div className={`grid grid-cols-1 ${profile?.account_role !== "guardian" ? 'lg:grid-cols-2' : ''} gap-12`}>
            {/* My Protectors */}
            {profile?.account_role !== "guardian" && (
              <div>
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-black flex items-center gap-3">
                    <span className="w-1.5 h-6 bg-primary rounded-full" />
                    My Protectors
                  </h2>
                  <button onClick={() => setShowAddGuardianModal(true)} className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center hover:bg-teal-bright hover:scale-105 transition-all shadow-md">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  </button>
                </div>
                <p className="text-slate-500 text-sm mb-8 leading-relaxed">These are the people notified during your high-risk sessions.</p>
                <div className="space-y-3">
                  {myGuardians.length === 0 ? <div className="p-12 border border-dashed border-border rounded-3xl text-center text-slate-500 text-sm bg-surface/30">Nobody is protecting you yet.</div> :
                    myGuardians.map((g, i) => (
                      <div key={i} className="bg-surface border border-border rounded-2xl p-4 flex items-center justify-between group hover:border-primary/30 transition-all shadow-sm">
                        <div className="flex items-center gap-4">
                          <div className="h-12 w-12 rounded-2xl bg-slate-50 border border-border flex items-center justify-center font-black text-primary uppercase">{g.guardian_email?.charAt(0)}</div>
                          <div>
                            <h4 className="text-sm font-bold text-slate-900">{g.guardian_email}</h4>
                            <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${g.status === 'active' ? 'text-primary' : 'text-slate-500'}`}>{g.status}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveGuardian(g.id)}
                          className="p-3 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2m-6 9 2 2 4-4" /></svg>
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Watching Over */}
            <div>
              <h2 className="text-2xl font-black mb-6 flex items-center gap-3">
                <span className="w-1.5 h-6 bg-accent-warm rounded-full" />
                Watching Over
              </h2>
              <p className="text-slate-500 text-sm mb-8 leading-relaxed">Users who have added you as their safety contact.</p>
              <div className="grid grid-cols-1 gap-4">
                {guarding.length === 0 ? <div className="p-12 border-2 border-dashed border-border rounded-[32px] text-center text-slate-500 italic bg-surface/30">You aren&apos;t guarding anyone yet.</div> :
                  guarding.map((rel, i) => {
                    const p = rel.profiles;
                    if (!p) return null;
                    return (
                      <div
                        key={rel.id}
                        onClick={() => {
                          if (rel.status !== 'pending') {
                            fetchWardThreads(p.id, p.full_name || p.email);
                          }
                        }}
                        className={`bg-surface border border-border rounded-[24px] p-6 flex items-center justify-between gap-4 group transition-all hover:border-primary/30 shadow-sm ${rel.status !== 'pending' ? 'cursor-pointer' : ''}`}
                      >
                        <div className="flex items-center gap-5 min-w-0">
                          <div className="h-14 w-14 rounded-2xl bg-slate-50 border border-border flex items-center justify-center font-black text-slate-400 group-hover:text-primary uppercase transition-colors flex-shrink-0">{p.full_name?.charAt(0) || p.email.charAt(0)}</div>
                          <div className="min-w-0">
                            <h4 className="font-bold text-slate-900 text-lg truncate">{p.full_name || "Anonymous User"}</h4>
                            <p className="text-[10px] text-slate-500 font-mono tracking-wider opacity-60 truncate">{p.email}</p>
                            <span className={`text-[10px] font-black uppercase tracking-[0.2em] mt-2 block ${rel.status === 'active' ? 'text-primary' : 'text-accent-warm'}`}>{rel.status}</span>
                          </div>
                        </div>
                        <div className="text-right flex items-center gap-3 flex-shrink-0">
                          {rel.status === 'pending' ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAcceptGuardian(rel.id);
                              }}
                              className="px-5 py-2.5 bg-primary text-white text-[10px] font-black rounded-full hover:bg-teal-bright hover:scale-105 transition-all uppercase tracking-widest shadow-md whitespace-nowrap"
                            >
                              Accept Request
                            </button>
                          ) : (
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                fetchWardThreads(p.id, p.full_name || p.email);
                              }}
                              className="text-[10px] cursor-pointer font-black text-primary hover:text-teal-bright uppercase transition-all tracking-widest border border-primary/20 bg-primary/5 px-4 py-2 rounded-full whitespace-nowrap"
                            >
                              Session History
                            </div>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveGuardian(rel.id);
                            }}
                            className="p-3 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100 flex-shrink-0"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2m-6 9 2 2 4-4" /></svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </main>
      )}

      {/* Notifications View */}
      {!isLoading && activeTab === "notifications" && (
        <main className="flex-1 flex flex-col pt-32 px-4 max-w-2xl mx-auto w-full relative z-10">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-2xl font-black flex items-center gap-3">
              <span className="w-1.5 h-6 bg-accent-warm rounded-full" />
              Alerts & Notifications
            </h2>
          </div>
          <div className="space-y-4">
            {notifications.length === 0 ? (
              <div className="p-12 border-2 border-dashed border-border rounded-[32px] text-center text-slate-500 italic bg-surface/30">
                No active signals found.
              </div>
            ) : (
              notifications.map((n, i) => (
                <div key={i} onClick={() => !n.is_read && markNotificationRead(n.id)} className={`bg-surface border ${n.is_read ? 'border-border' : 'border-primary/40'} rounded-2xl p-6 transition-all hover:bg-slate-50 cursor-pointer relative shadow-sm group`}>
                  {!n.is_read && <div className="absolute top-6 right-6 h-2 w-2 rounded-full bg-primary shadow-primary/50 shadow-md" />}
                  <div className="mb-3 flex items-center gap-3">
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${n.type === 'risk_alert' ? 'bg-red-50 text-red-600' : 'bg-primary/10 text-primary'}`}>{n.type.replace('_', ' ')}</span>
                    <span className="text-[10px] text-slate-500 font-mono opacity-60">{new Date(n.created_at).toLocaleString()}</span>
                  </div>
                  <h4 className={`font-bold text-lg ${n.is_read ? 'text-slate-500' : 'text-slate-900'}`}>{n.title}</h4>
                  <p className="text-sm text-slate-600 mt-2 leading-relaxed">{n.message}</p>
                </div>
              ))
            )}
          </div>
        </main>
      )}

      {/* Profile View */}
      {!isLoading && activeTab === "profile" && (
        <main className="flex-1 flex flex-col pt-32 px-4 max-w-4xl mx-auto w-full relative z-10">
          <h2 className="text-2xl font-black mb-8 flex items-center gap-3">
            <span className="w-1.5 h-6 bg-primary rounded-full" />
            Account Command
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-surface border border-border rounded-[32px] p-8 shadow-sm">
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-6">PROFILE INFORMATION</label>
              <div className="space-y-6">
                <div>
                  <p className="text-[10px] text-slate-400 uppercase font-black mb-1">Full Name</p>
                  <p className="text-slate-900 font-bold text-lg">{profile?.full_name || "Tracer User"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase font-black mb-1">Identity</p>
                  <p className="text-slate-900 font-bold text-lg">{profile?.email || user?.email}</p>
                </div>
              </div>
            </div>

            <div className="bg-surface border border-border rounded-[32px] p-8 shadow-sm">
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-6">PREFERENCES</label>
              <div className="space-y-8">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-slate-900">Guardian mode</h4>
                    <p className="text-xs text-slate-500">Focus solely on helping others.</p>
                  </div>
                  <button
                    onClick={() => handleUpdateRole(profile?.account_role !== "guardian")}
                    className={`w-14 h-8 rounded-full transition-all relative ${profile?.account_role === 'guardian' ? 'bg-primary' : 'bg-slate-50 border border-border'}`}
                  >
                    <div className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all shadow-md ${profile?.account_role === 'guardian' ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>

                <div className="pt-4 border-t border-border">
                  <button onClick={handleSignOut} className="w-full py-4 bg-red-50 border border-red-100 text-red-600 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all shadow-sm">
                    Sign Out
                  </button>
                </div>
              </div>
            </div>
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
