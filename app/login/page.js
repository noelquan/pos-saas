"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function LoginPage() {
  const [mode, setMode] = useState("password"); // "password" or "magic"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const signInWithPassword = async () => {
    setLoading(true);
    setErr("");
    setMsg("");

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) setErr(error.message);
    else setMsg("Signed in.");
    setLoading(false);
  };

  const sendMagicLink = async () => {
    setLoading(true);
    setErr("");
    setMsg("");

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/pos`,
      },
    });

    if (error) setErr(error.message);
    else setMsg("Magic link sent. Check your email.");
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-xl shadow p-6">
        <h1 className="text-2xl font-bold mb-1">Login</h1>
        <p className="text-sm text-gray-600 mb-6">
          Sign in with a password (recommended) or use a magic link.
        </p>

        <div className="flex gap-2 mb-4">
          <button
            className={`flex-1 py-2 rounded font-semibold ${
              mode === "password"
                ? "bg-indigo-600 text-white"
                : "bg-gray-200 text-gray-800"
            }`}
            onClick={() => setMode("password")}
          >
            Password
          </button>
          <button
            className={`flex-1 py-2 rounded font-semibold ${
              mode === "magic"
                ? "bg-indigo-600 text-white"
                : "bg-gray-200 text-gray-800"
            }`}
            onClick={() => setMode("magic")}
          >
            Magic link
          </button>
        </div>

        <label className="text-sm font-medium">Email</label>
        <input
          type="email"
          className="w-full p-2 border rounded mb-3"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
        />

        {mode === "password" && (
          <>
            <label className="text-sm font-medium">Password</label>
            <input
              type="password"
              className="w-full p-2 border rounded mb-4"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
            />

            <button
              onClick={signInWithPassword}
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-2 rounded font-semibold"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </>
        )}

        {mode === "magic" && (
          <button
            onClick={sendMagicLink}
            disabled={loading}
            className="w-full bg-indigo-600 text-white py-2 rounded font-semibold"
          >
            {loading ? "Sending..." : "Send magic link"}
          </button>
        )}

        {err && <p className="text-red-600 text-sm mt-3">{err}</p>}
        {msg && <p className="text-green-700 text-sm mt-3">{msg}</p>}
      </div>
    </div>
  );
}
