/* ============================================================
   SUPABASE CLIENT

   The two values below come from Netlify environment variables,
   so no keys live in the code:

     VITE_SUPABASE_URL       https://<project-ref>.supabase.co
     VITE_SUPABASE_ANON_KEY  the anon / publishable key

   The anon key is meant to be public. What protects the data is
   the row level security set up in supabase-setup.sql — nobody
   can read or write anything without signing in.
   ============================================================ */

import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const CONFIGURED = !!(url && key);

export const supabase = CONFIGURED
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

export async function signIn(email, password) {
  if (!supabase) return { error: "The database is not configured yet." };
  const { error } = await supabase.auth.signInWithPassword({
    email: (email || "").trim(), password,
  });
  if (!error) return { error: null };
  if (/invalid login/i.test(error.message))
    return { error: "That email and password don't match. Check both, or ask for a reset." };
  if (/email not confirmed/i.test(error.message))
    return { error: "That account still needs confirming. Ask Allan to confirm it in Supabase." };
  return { error: error.message };
}

export async function signOut() {
  if (supabase) await supabase.auth.signOut();
}

export async function currentProfile() {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles").select("full_name, role, email").eq("id", user.id).maybeSingle();
  return {
    id: user.id,
    email: user.email,
    name: (data && data.full_name) || user.email,
    role: (data && data.role) || "supervisor",
  };
}

export function onAuthChange(cb) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange(() => { cb(); });
  return () => data.subscription.unsubscribe();
}

export async function requestReset(email) {
  if (!supabase) return { error: "The database is not configured yet." };
  const { error } = await supabase.auth.resetPasswordForEmail((email || "").trim(),
    { redirectTo: window.location.origin });
  return { error: error ? error.message : null };
}
