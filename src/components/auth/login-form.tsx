"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const DEMO = { email: "demo@expresso.dev", password: "demo1234" };

// Supabase auth errors come in English; map the common ones to Portuguese.
function translateAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-mail ou senha inválidos.";
  if (m.includes("rate limit")) return "Muitas tentativas. Tente novamente mais tarde.";
  return "Não foi possível entrar. Tente novamente.";
}

export function LoginForm() {
  const router = useRouter();
  const [loading, setLoading] = useState<null | "google" | "demo">(null);
  const [error, setError] = useState<string | null>(null);

  async function demo() {
    setError(null);
    setLoading("demo");
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword(DEMO);
    if (error) {
      setError(translateAuthError(error.message));
      setLoading(null);
      return;
    }
    router.push("/");
    router.refresh();
  }

  async function google() {
    setError(null);
    setLoading("google");
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(translateAuthError(error.message));
      setLoading(null);
    }
    // on success the browser is redirected to Google by the SDK
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-5">
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        disabled={loading !== null}
        onClick={google}
      >
        {loading === "google" ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />} Continuar com Google
      </Button>
      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={loading !== null}
        onClick={demo}
      >
        {loading === "demo" && <Loader2 className="h-4 w-4 animate-spin" />} Logar para a demo
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}
