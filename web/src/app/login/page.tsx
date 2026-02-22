"use client";

import { createClient } from "@/utils/supabase/client";
import { useState } from "react";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const handleGoogleLogin = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      console.error("Login error:", error.message);
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#070F1A] text-[#E5E7EB] font-sans selection:bg-[#14B8A6]/30 overflow-hidden relative">
      {/* Background Elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1200px] h-[1200px] bg-[#14B8A6]/5 rounded-full blur-[150px] animate-pulse-slow" />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#0F766E]/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-[#14B8A6]/5 rounded-full blur-[100px]" />
      </div>

      <div className="flex flex-col lg:flex-row w-full relative z-10">
        {/* Left Side: Branding & Message */}
        <div className="hidden lg:flex lg:w-1/2 flex-col justify-center px-16 xl:px-24 bg-[#070F1A]/50 backdrop-blur-sm border-r border-white/5 relative overflow-hidden">
          <div className="absolute inset-0 opacity-20">
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_20%_30%,#14B8A6_0%,transparent_50%)]" />
          </div>
          
          <div className="relative animate-in slide-in-from-left duration-1000">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#14B8A6]/10 mb-8 border border-[#14B8A6]/20 shadow-[0_0_30px_rgba(20,184,166,0.15)]">
              <svg className="w-8 h-8 text-[#14B8A6]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            
            <h1 className="text-6xl xl:text-7xl font-black tracking-tight mb-6 text-white leading-tight">
              AEGIS <span className="text-[#14B8A6]">AI</span>
            </h1>
            
            <p className="text-xl text-[#9CA3AF] max-w-lg leading-relaxed mb-8">
              The next generation of safety monitoring. Secure, intelligent, and always vigilant. Experience the Aegis Protocol.
            </p>
            
            <div className="flex flex-col gap-4 mt-12">
              <div className="flex items-center gap-4 group">
                <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center group-hover:border-[#14B8A6]/50 transition-colors">
                  <svg className="w-5 h-5 text-[#14B8A6]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                </div>
                <div>
                  <h4 className="font-bold text-white text-sm">Military-Grade Security</h4>
                  <p className="text-xs text-[#6B7280]">End-to-end encryption for all sessions</p>
                </div>
              </div>
              <div className="flex items-center gap-4 group">
                <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center group-hover:border-[#14B8A6]/50 transition-colors">
                  <svg className="w-5 h-5 text-[#14B8A6]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </div>
                <div>
                  <h4 className="font-bold text-white text-sm">Real-time Analysis</h4>
                  <p className="text-xs text-[#6B7280]">Instant threat detection and alerts</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Sign-In Form */}
        <div className="flex-1 flex flex-col items-center justify-center px-8 sm:px-12 py-16 relative">
          <div className="w-full max-w-[420px] animate-in fade-in zoom-in duration-700">
            <div className="lg:hidden text-center mb-10">
               <h1 className="text-4xl font-black tracking-tight mb-2 text-white">
                AEGIS <span className="text-[#14B8A6]">AI</span>
              </h1>
            </div>

            <div className="bg-[#0F172A]/40 backdrop-blur-2xl border border-white/5 rounded-[40px] p-10 xl:p-12 shadow-[0_32px_80px_rgba(0,0,0,0.6)] relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#14B8A6]/50 to-transparent" />
              
              <div className="text-center mb-10">
                <h2 className="text-2xl font-bold text-white mb-2">Welcome Back</h2>
                <p className="text-[#9CA3AF] text-sm">Authentication is required to proceed</p>
              </div>

              <div className="space-y-8">
                <button
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  className="group relative w-full flex items-center justify-center gap-4 px-6 py-4 bg-white text-[#0B1120] font-black rounded-2xl hover:bg-gray-100 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-widest shadow-xl shadow-black/20"
                >
                  {loading ? (
                    <div className="h-5 w-5 border-3 border-[#0B1120]/20 border-t-[#0B1120] rounded-full animate-spin" />
                  ) : (
                    <>
                      <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                      </svg>
                      Sign in with Google
                    </>
                  )}
                </button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/5"></div>
                  </div>
                  <div className="relative flex justify-center text-[8px] uppercase tracking-[0.4em]">
                    <span className="bg-[#121b2d] px-4 text-[#4B5563] font-black">Secure Transmission</span>
                  </div>
                </div>

                <p className="text-center text-[10px] text-[#4B5563] leading-relaxed max-w-[280px] mx-auto font-medium">
                  Authorized personnel only. All interactions are monitored via the Aegis protocol.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <style jsx global>{`
        @keyframes pulse-slow {
          0%, 100% { opacity: 0.3; transform: translate(-50%, -50%) scale(1); }
          50% { opacity: 0.5; transform: translate(-50%, -50%) scale(1.1); }
        }
        .animate-pulse-slow {
          animation: pulse-slow 8s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
