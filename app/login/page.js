"use client";
import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  async function signIn(e) {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) return alert(error.message);
    setSent(true);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={signIn} className="w-full max-w-sm space-y-3">
        <h1 className="text-2xl font-bold">Sign in</h1>

        <input
          className="w-full border rounded px-3 py-2"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <button className="w-full bg-black text-white rounded px-3 py-2">
          Send magic link
        </button>

        {sent && (
          <p className="text-sm">
            Check your email for the login link.
          </p>
        )}
      </form>
    </div>
  );
}
