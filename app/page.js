"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import POSApp from "./components/POSApp";

export default function Page() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setReady(true);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) return null;

  if (!user) {
    window.location.href = "/login";
    return null;
  }

  return <POSApp />;
}
