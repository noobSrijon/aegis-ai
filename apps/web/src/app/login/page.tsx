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
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#070F1A] text-[#E5E7EB] font-sans selection:bg-[#14B8A6]/30 overflow-hidden relative">
      {/* Background Halo */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] bg-[#14B8A6]/5 rounded-full blur-[120px]" />
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-[#14B8A6]/3 rounded-full blur-[80px]" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-[#14B8A6]/3 rounded-full blur-[80px]" />
      </div>

      <div className="w-full max-w-md px-8 py-12 bg-[#0F172A]/80 backdrop-blur-2xl border border-[#0F766E]/30 rounded-[32px] shadow-[0_32px_80px_rgba(0,0,0,0.6)] animate-in fade-in zoom-in duration-700 relative z-10">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-[#14B8A6]/10 mb-6 shadow-[0_0_40px_rgba(20,184,166,0.1)] border border-[#14B8A6]/20">
            <svg className="w-10 h-10 text-[#14B8A6]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <path d="M9 3v18" />
              <path d="M15 3v18" />
              <path d="M3 9h18" />
              <path d="M3 15h18" />
            </svg>
          </div>
          <h1 className="text-4xl font-black tracking-[0.1em] mb-3 text-white uppercase flex items-center justify-center gap-2">
            <span className="w-2 h-8 bg-[#14B8A6] rounded-full" />
            BLACK BOX
          </h1>
          <p className="text-[#9CA3AF] text-[10px] font-black uppercase tracking-[0.3em]">
            The Shadow Protocol
          </p>
        </div>

        <div className="space-y-6">
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="group relative w-full flex items-center justify-center gap-4 px-6 py-5 bg-[#14B8A6] text-[#0B1120] font-black rounded-full hover:bg-[#22C9B7] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-widest shadow-lg shadow-[#14B8A6]/20"
          >
            {loading ? (
              <div className="h-5 w-5 border-3 border-[#0B1120]/20 border-t-[#0B1120] rounded-full animate-spin" />
            ) : (
              <>
                <svg className="w-5 h-5 fill-[#0B1120]" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Enter the Box
              </>
            )}
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#0F766E]/20"></div>
            </div>
            <div className="relative flex justify-center text-[8px] uppercase tracking-[0.4em]">
              <span className="bg-[#0F172A] px-4 text-[#0F766E] font-black">Secure Transmission</span>
            </div>
          </div>

          <p className="text-center text-[10px] text-[#9CA3AF]/60 leading-relaxed max-w-[260px] mx-auto font-medium">
            Authorized personnel only. All interactions are monitored via the shadow protocol.
          </p>
        </div>
      </div>
    </div>
  );
}
