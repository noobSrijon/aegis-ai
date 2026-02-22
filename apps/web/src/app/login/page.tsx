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
    <div className="flex min-h-screen bg-background text-foreground font-sans selection:bg-primary/20 overflow-hidden relative">
      {/* Background Effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] bg-primary/5 rounded-full blur-[120px]" />
      </div>

      {/* Left Side: Branding & Info */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center px-20 relative z-10 border-r border-border bg-surface-alt/30 backdrop-blur-sm">
        <div className="max-w-xl animate-in fade-in slide-in-from-left duration-1000">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-8 border border-primary/20 shadow-sm">
            <svg className="w-8 h-8 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          
          <h1 className="text-6xl font-black tracking-tighter mb-6 text-slate-900 uppercase leading-none">
            AEGIS AI
          </h1>
          <p className="text-primary text-sm font-black uppercase tracking-[0.4em] mb-12">
            The Safety Shadow
          </p>

          <div className="space-y-8">
            <div className="flex gap-4">
              <div className="w-1 h-12 bg-gradient-to-b from-primary to-transparent rounded-full" />
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">Intelligent Monitoring</h3>
                <p className="text-slate-600 text-sm leading-relaxed">Real-time risk evaluation for high-stakes environments using advanced neural networks.</p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="w-1 h-12 bg-gradient-to-b from-primary/60 to-transparent rounded-full" />
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">Guardian Network</h3>
                <p className="text-slate-600 text-sm leading-relaxed">Instantly connect with your circle of trust when potential threats are detected.</p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="w-1 h-12 bg-gradient-to-b from-primary/30 to-transparent rounded-full" />
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">Secure Transmission</h3>
                <p className="text-slate-600 text-sm leading-relaxed">End-to-end encrypted protocol ensuring your data remains private and protected.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side: Sign-in */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 relative z-10 bg-background/50 backdrop-blur-sm">
        <div className="w-full max-w-md animate-in fade-in zoom-in duration-700">
          <div className="lg:hidden text-center mb-10">
            <h1 className="text-4xl font-black tracking-tighter text-slate-900 uppercase">AEGIS AI</h1>
            <p className="text-primary text-[10px] font-black uppercase tracking-[0.3em] mt-2">The Safety Shadow</p>
          </div>

          <div className="bg-surface backdrop-blur-2xl border border-border p-10 rounded-[40px] shadow-2xl">
            <div className="mb-10">
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Welcome Back</h2>
              <p className="text-slate-600 text-sm">Sign in to your secure portal.</p>
            </div>

            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              className="group relative w-full flex items-center justify-center gap-4 px-6 py-5 bg-primary text-white font-black rounded-2xl hover:bg-teal-bright hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-widest shadow-lg shadow-primary/20"
            >
              {loading ? (
                <div className="h-5 w-5 border-3 border-white/20 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <svg className="w-5 h-5 fill-white" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Sign in with Google
                </>
              )}
            </button>

            <div className="mt-8 pt-8 border-t border-border text-center">
              <p className="text-[10px] text-slate-500 leading-relaxed max-w-[260px] mx-auto font-medium uppercase tracking-widest">
                Authorized personnel only. All interactions are monitored via the Aegis protocol.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
