"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

export default function LiveStatusPage() {
  const router = useRouter();
  const [risk, setRisk] = useState(45); // Initial sample risk percentage

  // Simulate live risk factor changes
  useEffect(() => {
    const interval = setInterval(() => {
      setRisk(prev => {
        const change = (Math.random() - 0.5) * 5;
        return Math.min(100, Math.max(0, parseFloat((prev + change).toFixed(1))));
      });
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Mock data for the graph
  const [graphData, setGraphData] = useState([
    { time: "10:00", risk: 20 },
    { time: "10:05", risk: 35 },
    { time: "10:10", risk: 30 },
    { time: "10:15", risk: 50 },
    { time: "10:20", risk: 45 },
    { time: "10:25", risk: 65 },
    { time: "10:30", risk: 45 },
  ]);

  // SVG dimensions for the graph
  const width = 600;
  const height = 300;
  const padding = 40;

  const points = graphData.map((d, i) => {
    const x = padding + (i * (width - 2 * padding)) / (graphData.length - 1);
    const y = height - padding - (d.risk * (height - 2 * padding)) / 100;
    return `${x},${y}`;
  }).join(" ");

  return (
    <div className="flex min-h-screen flex-col bg-[#070F1A] text-[#E5E7EB] font-sans selection:bg-[#14B8A6]/30 overflow-x-hidden relative">
      {/* Background Halo */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] bg-[#14B8A6]/5 rounded-full blur-[120px]" />
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-[#14B8A6]/3 rounded-full blur-[80px]" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-[#FF8559]/3 rounded-full blur-[80px]" />
      </div>

      <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-6 py-3 bg-[#0F172A]/80 backdrop-blur-xl border border-[#0F766E]/30 rounded-full shadow-[0_24px_60px_rgba(0,0,0,0.5)] flex items-center justify-between w-[90%] max-w-4xl">
        <div className="flex items-center gap-3">
          <span className="w-1.5 h-6 bg-[#14B8A6] rounded-full" />
          <h1 className="text-sm font-black uppercase tracking-widest text-[#E5E7EB]">Live Status Protocol</h1>
        </div>
        <button
          onClick={() => router.back()}
          className="px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border border-[#0F766E]/50 text-[#9CA3AF] hover:text-[#E5E7EB] hover:border-[#14B8A6]/50"
        >
          Back to Vault
        </button>
      </nav>

      <main className="flex-1 flex flex-col pt-32 pb-12 px-6 max-w-6xl mx-auto w-full relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-full">
          
          {/* Left Column: Line Graph */}
          <div className="lg:col-span-2 bg-[#0F172A]/50 border border-[#0F766E]/20 rounded-[32px] p-8 shadow-2xl backdrop-blur-sm relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#14B8A6]/30 to-transparent" />
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-xl font-black flex items-center gap-3">
                  <span className="w-1.5 h-6 bg-[#14B8A6] rounded-full animate-pulse" />
                  Risk Factor Timeline
                </h2>
                <p className="text-[#9CA3AF] text-[10px] font-black uppercase tracking-widest mt-1">Real-time threat evaluation</p>
              </div>
              <div className="text-right">
                <span className="text-xs font-black uppercase tracking-widest text-[#14B8A6] bg-[#14B8A6]/10 px-3 py-1 rounded-full border border-[#14B8A6]/20">Live Syncing</span>
              </div>
            </div>

            <div className="relative w-full h-[350px] mt-4 flex items-center justify-center">
              <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="overflow-visible">
                {/* Grid Lines */}
                {[0, 25, 50, 75, 100].map((v) => {
                  const y = height - padding - (v * (height - 2 * padding)) / 100;
                  return (
                    <g key={v}>
                      <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#0F766E" strokeWidth="0.5" strokeDasharray="4 4" opacity="0.2" />
                      <text x={padding - 10} y={y + 4} textAnchor="end" fontSize="10" fill="#4B5563" fontWeight="bold">{v}%</text>
                    </g>
                  );
                })}

                {/* Vertical Lines */}
                {graphData.map((d, i) => {
                  const x = padding + (i * (width - 2 * padding)) / (graphData.length - 1);
                  return (
                    <g key={i}>
                      <line x1={x} y1={padding} x2={x} y2={height - padding} stroke="#0F766E" strokeWidth="0.5" strokeDasharray="4 4" opacity="0.1" />
                      <text x={x} y={height - padding + 20} textAnchor="middle" fontSize="10" fill="#4B5563" fontWeight="bold">{d.time}</text>
                    </g>
                  );
                })}

                {/* Line Path */}
                <polyline
                  points={points}
                  fill="none"
                  stroke="#14B8A6"
                  strokeWidth="3"
                  strokeLinejoin="round"
                  className="drop-shadow-[0_0_8px_rgba(20,184,166,0.5)]"
                />

                {/* Area under the line */}
                <path
                  d={`M ${padding},${height - padding} L ${points} L ${width - padding},${height - padding} Z`}
                  fill="url(#gradient)"
                  opacity="0.2"
                />

                <defs>
                  <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#14B8A6" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="#14B8A6" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* Data Points */}
                {graphData.map((d, i) => {
                  const x = padding + (i * (width - 2 * padding)) / (graphData.length - 1);
                  const y = height - padding - (d.risk * (height - 2 * padding)) / 100;
                  return (
                    <circle
                      key={i}
                      cx={x}
                      cy={y}
                      r="4"
                      fill="#070F1A"
                      stroke="#14B8A6"
                      strokeWidth="2"
                      className="transition-all hover:r-6 cursor-pointer"
                    >
                      <title>{`Risk: ${d.risk}% at ${d.time}`}</title>
                    </circle>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* Right Column: Risk Indicators */}
          <div className="bg-[#0F172A]/50 border border-[#0F766E]/20 rounded-[32px] p-8 shadow-2xl backdrop-blur-sm flex flex-col items-center justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 w-full h-1 bg-gradient-to-r from-transparent via-[#FF8559]/30 to-transparent" />
            
            <div className="w-full text-center mb-8">
              <h2 className="text-xl font-black flex items-center justify-center gap-3">
                <span className="w-1.5 h-6 bg-[#FF8559] rounded-full" />
                Risk Severity
              </h2>
              <p className="text-[#9CA3AF] text-[10px] font-black uppercase tracking-widest mt-1">Classification Status</p>
            </div>

            <div className="flex flex-col gap-10 items-center justify-center flex-1">
              {/* High Risk Circle */}
              <div className="group relative">
                <div className={`w-28 h-28 rounded-full border-4 flex items-center justify-center transition-all duration-500 ${risk > 70 ? 'bg-red-500/20 border-red-500 shadow-[0_0_40px_rgba(239,68,68,0.4)]' : 'bg-red-500/5 border-red-500/20'}`}>
                   <span className={`text-[10px] font-black uppercase tracking-widest ${risk > 70 ? 'text-red-500' : 'text-red-500/30'}`}>HIGH</span>
                </div>
                {risk > 70 && <div className="absolute -inset-2 rounded-full border border-red-500/30 animate-ping" />}
              </div>

              {/* Medium Risk Circle */}
              <div className="group relative">
                <div className={`w-24 h-24 rounded-full border-4 flex items-center justify-center transition-all duration-500 ${risk > 40 && risk <= 70 ? 'bg-yellow-500/20 border-yellow-500 shadow-[0_0_40px_rgba(234,179,8,0.4)]' : 'bg-yellow-500/5 border-yellow-500/20'}`}>
                   <span className={`text-[10px] font-black uppercase tracking-widest ${risk > 40 && risk <= 70 ? 'text-yellow-500' : 'text-yellow-500/30'}`}>MEDIUM</span>
                </div>
                {risk > 40 && risk <= 70 && <div className="absolute -inset-2 rounded-full border border-yellow-500/30 animate-ping" />}
              </div>

              {/* Low Risk Circle */}
              <div className="group relative">
                <div className={`w-20 h-20 rounded-full border-4 flex items-center justify-center transition-all duration-500 ${risk <= 40 ? 'bg-green-500/20 border-green-500 shadow-[0_0_40px_rgba(34,197,94,0.4)]' : 'bg-green-500/5 border-green-500/20'}`}>
                   <span className={`text-[10px] font-black uppercase tracking-widest ${risk <= 40 ? 'text-green-500' : 'text-green-500/30'}`}>LOW</span>
                </div>
                {risk <= 40 && <div className="absolute -inset-2 rounded-full border border-green-500/30 animate-ping" />}
              </div>
            </div>

            <div className="w-full mt-10 p-6 bg-[#070F1A] border border-[#0F766E]/20 rounded-2xl text-center">
              <span className="text-4xl font-black text-white">{risk}%</span>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#9CA3AF] mt-2">Cumulative Threat Level</p>
            </div>
          </div>

        </div>
      </main>

      <footer className="py-8 text-center text-[8px] font-black uppercase tracking-[0.4em] text-[#0F766E]/60">
        Secure Transmission Mode // Active Session
      </footer>
    </div>
  );
}
