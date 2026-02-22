"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

function LiveStatusContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const threadId = searchParams.get("threadId");
  const supabase = createClient();
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const [risk, setRisk] = useState(45);
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(!!threadId);
  const [sessionContext, setSessionContext] = useState("");

  // Simulation graph data state
  const [riskData, setRiskData] = useState([
    { time: "10:00", risk: 20 },
    { time: "10:05", risk: 35 },
    { time: "10:10", risk: 30 },
    { time: "10:15", risk: 50 },
    { time: "10:20", risk: 45 },
    { time: "10:25", risk: 65 },
    { time: "10:30", risk: 45 },
  ]);

  // Fetch real data if threadId is provided
  useEffect(() => {
    if (!threadId) return;

    const fetchData = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          console.log("No active session found in live-status");
          return;
        }

        console.log(`Fetching thread details for: ${threadId}`);
        const res = await fetch(`http://localhost:8000/api/threads/${threadId}`, {
          headers: { "Authorization": `Bearer ${session?.access_token}` }
        });

        if (res.ok) {
          const data = await res.json();
          setRisk(data.logs?.length > 0 ? 45 : 0);
          setLogs(data.logs || []);
          setSessionContext(data.initial_context || "");

          const mappedGraphData = data.logs?.map((l: any, idx: number) => ({
            time: new Date(l.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            risk: Math.min(100, Math.max(0, 30 + (idx * 5) % 40 + (Math.random() * 10)))
          })).slice(-15) || [];

          if (mappedGraphData.length > 0) {
            setRiskData(mappedGraphData);
          }
        }
      } catch (err) {
        console.error("Failed to fetch thread data:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [threadId, supabase]);

  // Scroll to bottom of transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6">
        <div className="h-16 w-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        <div className="text-center">
          <h2 className="text-primary font-black uppercase tracking-[0.3em] text-sm animate-pulse">Syncing Protocol</h2>
          <p className="text-slate-400 text-[10px] mt-2 font-mono opacity-50">Establishing Secure Transmission...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground font-sans selection:bg-primary/20 overflow-x-hidden relative">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] bg-primary/5 rounded-full blur-[120px]" />
      </div>

      <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-6 py-3 bg-surface/80 backdrop-blur-xl border border-border rounded-full shadow-lg flex items-center gap-8">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Live Status Content</span>
        </div>
        <div className="h-4 w-[1px] bg-border" />
        <button onClick={() => router.push('/')} className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-primary transition-colors">Back to Vault</button>
      </nav>

      <main className="flex-1 flex flex-col pt-32 pb-12 px-6 max-w-6xl mx-auto w-full relative z-10">
        {sessionContext && (
          <div className="mb-8 p-6 bg-surface border border-border rounded-3xl shadow-sm">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 block mb-2 font-mono">Situation Context</span>
            <p className="text-sm text-slate-700 italic">&quot;{sessionContext}&quot;</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          <div className="lg:col-span-1 bg-surface border border-border rounded-[32px] p-8 shadow-sm">
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-6 font-mono">Evaluation</label>
            <div className="space-y-8">
              <div>
                <h1 className="text-4xl font-black mb-2 flex items-baseline gap-2 text-slate-900">
                  {Number(risk).toFixed(2)}%
                  <span className="text-xs text-slate-400 font-normal uppercase tracking-widest">Risk Level</span>
                </h1>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-1000 shadow-[0_0_12px_rgba(13,148,136,0.3)]"
                    style={{ width: `${risk}%` }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 border border-border rounded-2xl">
                  <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Status</p>
                  <p className={`text-sm font-bold uppercase tracking-widest ${risk > 70 ? 'text-red-600' : 'text-primary'}`}>
                    {risk > 70 ? 'CRITICAL' : 'SECURE'}
                  </p>
                </div>
                <div className="p-4 bg-slate-50 border border-border rounded-2xl">
                  <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Signal</p>
                  <p className="text-sm font-bold text-slate-900">ENCRYPTED</p>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 bg-surface border border-border rounded-[32px] p-8 shadow-sm flex flex-col">
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-6 font-mono">Risk Factor Timeline</label>
            <div className="flex-1 min-h-[300px] relative">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={riskData}>
                  <defs>
                    <linearGradient id="colorRisk" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--teal)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="var(--teal)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" hide />
                  <YAxis domain={[0, 100]} hide />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-white/90 backdrop-blur-md border border-border p-3 rounded-xl shadow-xl">
                            <p className="text-xs font-bold text-slate-900">{Number(payload[0].value).toFixed(2)}% Risk</p>
                            <p className="text-[9px] text-slate-400 uppercase font-bold">{payload[0].payload.time}</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area type="monotone" dataKey="risk" stroke="var(--teal)" strokeWidth={3} fillOpacity={1} fill="url(#colorRisk)" animationDuration={1000} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-[32px] p-8 shadow-sm flex flex-col max-h-[600px]">
          <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-6 font-mono">Session Intelligence Feed</label>
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-2">
            {logs.length === 0 ? (
              <div className="py-20 text-center border border-dashed border-border rounded-2xl opacity-50">
                <p className="text-sm font-mono uppercase tracking-widest text-slate-400 italic">No signals recorded during this session</p>
              </div>
            ) : (
              logs.map((l: any, i: number) => (
                <div key={i} className="flex gap-6 border-l-2 border-primary/20 pl-6 py-3 hover:bg-slate-50 transition-all group">
                  <div className="flex-shrink-0 text-[10px] font-mono text-slate-400 pt-1 opacity-50 group-hover:opacity-100 transition-opacity">
                    {new Date(l.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </div>
                  <div>
                    <span className="text-[9px] font-black uppercase text-primary tracking-[0.2em] block mb-2">{l.speaker_label || 'USER'}</span>
                    <p className="text-sm text-slate-700 leading-relaxed max-w-2xl">{l.content}</p>
                  </div>
                </div>
              ))
            )}
            <div ref={transcriptEndRef} />
          </div>
        </div>
      </main>

      <footer className="py-8 text-center text-[8px] font-black uppercase tracking-[0.4em] text-slate-400 opacity-60">
        Secure Transmission Mode // Vault Analysis Protocol
      </footer>
    </div>
  );
}

export default function LiveStatusPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-12 w-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    }>
      <LiveStatusContent />
    </Suspense>
  );
}
