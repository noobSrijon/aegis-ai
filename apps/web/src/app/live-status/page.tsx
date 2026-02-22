"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import dynamic from 'next/dynamic';

const Map = dynamic(() => import('@/components/Map'), { ssr: false });

function LiveStatusContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const threadId = searchParams.get("threadId");
  const supabase = createClient();
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [risk, setRisk] = useState(45);
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(!!threadId);
  const [sessionContext, setSessionContext] = useState("");
  const [lastLocation, setLastLocation] = useState<{ lat: number; lon: number } | null>(null);

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
        if (!session) return;

        const res = await fetch(`http://localhost:8000/api/threads/${threadId}`, {
          headers: { "Authorization": `Bearer ${session?.access_token}` }
        });

        if (res.ok) {
          const data = await res.json();
          const realRiskScores = data.risk_scores || [];

          if (realRiskScores.length > 0) {
            const lastScore = realRiskScores[realRiskScores.length - 1].score;
            setRisk(lastScore);

            const mappedGraphData = realRiskScores.map((s: any) => ({
              time: new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              risk: s.score
            }));
            setRiskData(mappedGraphData);
          } else {
            setRisk(0);
            setRiskData([]);
          }

          setLogs(data.logs || []);
          setSessionContext(data.initial_context || "");

          // Get last known location from logs
          const logsWithLocation = (data.logs || []).filter((l: any) => l.latitude && l.longitude);
          if (logsWithLocation.length > 0) {
            const lastLog = logsWithLocation[logsWithLocation.length - 1];
            setLastLocation({ lat: lastLog.latitude, lon: lastLog.longitude });
          }
        }
      } catch (err) {
        console.error("Failed to fetch thread data:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 4000); // Poll every 4 seconds
    return () => clearInterval(interval);
  }, [threadId, supabase]);

  // Scroll to bottom of transcript only if user is at the bottom
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
      if (isAtBottom) {
        transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    }
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
          <div className="relative flex items-center justify-center">
            <div className="absolute w-4 h-4 rounded-full bg-primary/40 animate-ping" />
            <div className="w-2 h-2 rounded-full bg-primary relative z-10" />
          </div>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">AI Active Monitoring</span>
        </div>
        <div className="h-4 w-[1px] bg-border" />
        <button onClick={() => router.push('/')} className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-primary transition-colors">Back to Vault</button>
      </nav>

      <main className="flex-1 flex flex-col pt-32 pb-12 px-6 max-w-6xl mx-auto w-full relative z-10">
        {sessionContext && (
          <div className="mb-8 p-6 bg-surface border border-border rounded-3xl shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 font-mono">Situation Context</span>
              <div className="h-[1px] flex-1 bg-border" />
            </div>
            <p className="text-sm text-slate-700 italic">&quot;{sessionContext}&quot;</p>
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          <div className="lg:col-span-1 bg-surface border border-border rounded-[32px] p-8 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <div className="w-16 h-16 border-2 border-primary rounded-full animate-[spin_12s_linear_infinite]" />
            </div>

            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-6 font-mono">Evaluation</label>
            <div className="space-y-8">
              <div>
                <h1 className="text-4xl font-black mb-2 flex items-baseline gap-2 text-slate-900">
                  {Number(risk).toFixed(0)}%
                  <span className="text-xs text-slate-400 font-normal uppercase tracking-widest">Risk Factor</span>
                </h1>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-1000 shadow-[0_0_12px_rgba(13,148,136,0.3)] ${risk > 70 ? 'bg-red-500' : 'bg-primary'}`}
                    style={{ width: `${risk}%` }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 border border-border rounded-2xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-[2px] bg-primary/20 animate-pulse" />
                  <p className="text-[10px] font-black text-slate-400 uppercase mb-1">AI Insight</p>
                  <p className={`text-[10px] font-black uppercase tracking-widest ${risk > 70 ? 'text-red-600' : 'text-primary'}`}>
                    {risk > 70 ? 'CRITICAL ALERT' : 'SECURE PATH'}
                  </p>
                </div>
                <div className="p-4 bg-slate-50 border border-border rounded-2xl">
                  <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Status</p>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">ANALYZING</p>
                  </div>
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

        <div className="bg-surface border border-border rounded-[32px] p-8 shadow-sm flex flex-col mb-8 h-[400px]">
          <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-6 font-mono">Last Known Location</label>
          <div className="flex-1 relative">
            <Map location={lastLocation} />
          </div>
        </div>

        <div className="bg-surface border border-border rounded-[32px] p-8 shadow-sm flex flex-col max-h-[600px]">
          <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-6 font-mono">Session Intelligence Feed</label>
          <div 
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-2"
          >
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
      </main >

      <footer className="py-8 text-center text-[8px] font-black uppercase tracking-[0.4em] text-slate-400 opacity-60">
        Secure Transmission Mode // Vault Analysis Protocol
      </footer>
    </div >
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
