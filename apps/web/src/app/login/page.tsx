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
    <div className="flex min-h-screen flex-col items-center justify-center bg-black text-zinc-100 font-sans selection:bg-zinc-800">
      <div className="w-full max-w-md px-8 py-12 bg-zinc-900/40 backdrop-blur-2xl border border-zinc-800/50 rounded-[2.5rem] shadow-2xl animate-in fade-in zoom-in duration-700">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white mb-6 shadow-[0_0_30px_rgba(255,255,255,0.1)]">
            <div className="w-8 h-8 bg-black rounded-lg transform rotate-45" />
          </div>
          <h1 className="text-3xl font-black tracking-tighter mb-3 bg-gradient-to-b from-white to-zinc-500 bg-clip-text text-transparent">
            BLACK BOX
          </h1>
          <p className="text-zinc-500 text-[10px] font-medium uppercase tracking-[0.2em]">
            Your safety inside the box
          </p>
        </div>

        <div className="space-y-6">
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="group relative w-full flex items-center justify-center gap-3 px-6 py-4 bg-white text-black font-bold rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="h-5 w-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Continue with Google
              </>
            )}
            <div className="absolute -inset-1 bg-white/10 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-800/50"></div>
            </div>
            <div className="relative flex justify-center text-[10px] uppercase tracking-widest">
              <span className="bg-zinc-900/40 px-3 text-zinc-600 font-bold">Encrypted Session</span>
            </div>
          </div>
          
          <p className="text-center text-[10px] text-zinc-600 leading-relaxed max-w-[240px] mx-auto">
            By continuing, you agree to the shadow protocol and real-time monitoring terms.
          </p>
        </div>
      </div>
    </div>
  );
}
