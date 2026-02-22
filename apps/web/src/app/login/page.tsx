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
    <div className="flex min-h-screen bg-mesh text-foreground font-sans selection:bg-primary/20 overflow-hidden relative">
      {/* Background Effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] bg-primary/10 rounded-full blur-[120px] floating-halo" />
        <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] bg-primary/5 rounded-full blur-[100px] animate-pulse" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[50%] h-[50%] bg-primary/5 rounded-full blur-[100px] animate-pulse" />
      </div>

      {/* Left Side: Branding & Info */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center px-20 relative z-10 border-r border-white/20 bg-white/10 backdrop-blur-sm">
        <div className="max-w-xl animate-in fade-in slide-in-from-left duration-1000">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-[28px] bg-white/40 backdrop-blur-xl mb-12 border border-white/50 shadow-xl">
            <svg className="w-10 h-10 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          
          <div className="relative mb-8 md:mb-16 group">
            <h1 className="text-7xl md:text-8xl font-black tracking-tighter mb-4 leading-none relative">
              <span className="absolute inset-0 steel-border opacity-70 blur-[1px] group-hover:opacity-100 transition-opacity duration-500" aria-hidden="true">
                AEGIS AI
              </span>
              <span className="relative text-slate-900 group-hover:text-black transition-colors duration-500">
                AEGIS AI
              </span>
            </h1>
            <div className="flex items-center gap-4">
              <div className="h-[1px] w-12 bg-slate-900/20" />
              <p className="text-slate-900 text-[10px] font-black uppercase tracking-[0.5em]">
                The Safety Shadow
              </p>
            </div>
          </div>

          <div className="space-y-10">
            <div className="group flex gap-6 items-start transition-all hover:translate-x-2">
              <div className="w-1.5 h-14 bg-gradient-to-b from-primary to-transparent rounded-full shadow-[0_0_15px_rgba(13,148,136,0.3)]" />
              <div>
                <h3 className="text-xl font-black text-slate-900 mb-2 uppercase tracking-wide">Intelligent Monitoring</h3>
                <p className="text-slate-500 text-sm leading-relaxed font-medium">Real-time risk evaluation for high-stakes environments using advanced neural networks.</p>
              </div>
            </div>

            <div className="group flex gap-6 items-start transition-all hover:translate-x-2">
              <div className="w-1.5 h-14 bg-gradient-to-b from-primary/60 to-transparent rounded-full" />
              <div>
                <h3 className="text-xl font-black text-slate-900 mb-2 uppercase tracking-wide">Guardian Network</h3>
                <p className="text-slate-500 text-sm leading-relaxed font-medium">Instantly connect with your circle of trust when potential threats are detected.</p>
              </div>
            </div>

            <div className="group flex gap-6 items-start transition-all hover:translate-x-2">
              <div className="w-1.5 h-14 bg-gradient-to-b from-primary/30 to-transparent rounded-full" />
              <div>
                <h3 className="text-xl font-black text-slate-900 mb-2 uppercase tracking-wide">Secure Transmission</h3>
                <p className="text-slate-500 text-sm leading-relaxed font-medium">End-to-end encrypted protocol ensuring your data remains private and protected.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side: Sign-in */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 relative z-10 bg-white/10 backdrop-blur-md">
        <div className="w-full max-w-md animate-in fade-in zoom-in duration-700">
          <div className="lg:hidden text-center mb-10">
            <h1 className="text-6xl font-black tracking-tighter steel-shine uppercase leading-none">AEGIS AI</h1>
            <p className="text-primary text-[10px] font-black uppercase tracking-[0.4em] mt-4">The Safety Shadow</p>
          </div>

          <div className="bg-white/80 backdrop-blur-2xl border border-white/50 p-12 rounded-[48px] shadow-[0_32px_80px_rgba(0,0,0,0.08)]">
            <div className="mb-10 text-center">
              <h2 className="text-3xl font-black text-slate-900 mb-2 uppercase tracking-tight">Welcome Back</h2>
              <p className="text-slate-500 text-sm font-medium">Sign in to your secure portal.</p>
            </div>

            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              className="group relative w-full flex items-center justify-center gap-4 px-8 py-6 bg-primary text-white font-black rounded-[24px] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-[0.2em] shadow-[0_15px_40px_rgba(13,148,136,0.3)] overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
              {loading ? (
                <div className="h-5 w-5 border-3 border-white/20 border-t-white rounded-full animate-spin" />
              ) : (
                <div className="relative z-10 flex items-center gap-4">
                  <svg className="w-6 h-6 fill-white" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  <span>Sign in with Google</span>
                </div>
              )}
            </button>

            <div className="mt-10 pt-10 border-t border-slate-100 text-center">
              <p className="text-[9px] text-slate-400 leading-relaxed max-w-[280px] mx-auto font-black uppercase tracking-[0.3em]">
                Authorized personnel only. All interactions are monitored via the Aegis protocol.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
