/* ============================================================
   STORAGE ADAPTER

   Right now the roster saves to this browser only. Each person
   who opens the site has their own copy — fine for testing the
   screens, not for running the operation.

   When you're ready to share one roster between Geraldton and
   site, swap the two functions at the bottom for the Supabase
   versions further down. Nothing else in the app changes.
   ============================================================ */

const KEY = "syncline:roster:v2";

/* ---------- CURRENT: this browser only ---------- */

export async function loadRoster() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.error("Could not read the saved roster", e);
    return null;
  }
}

export async function saveRoster(snapshot) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(snapshot));
    return true;
  } catch (e) {
    console.error("Could not save the roster", e);
    return false;
  }
}

export const STORAGE_MODE = "local";

/* ============================================================
   NEXT STEP — shared roster via Supabase
   ------------------------------------------------------------
   1. npm install @supabase/supabase-js
   2. Create a Supabase project. Set the region to
      ap-southeast-2 (Sydney) — the default is not Sydney and
      it cannot be changed afterwards.
   3. Run this SQL in the Supabase SQL editor:

        create table roster_state (
          id text primary key,
          data jsonb not null,
          saved_at timestamptz default now(),
          saved_by text
        );
        alter table roster_state enable row level security;

        create policy "signed in users read"
          on roster_state for select
          to authenticated using (true);

        create policy "signed in users write"
          on roster_state for all
          to authenticated using (true) with check (true);

   4. In Netlify, add environment variables:
        VITE_SUPABASE_URL
        VITE_SUPABASE_ANON_KEY
   5. Replace the two functions above with these:

        import { createClient } from "@supabase/supabase-js";

        const supabase = createClient(
          import.meta.env.VITE_SUPABASE_URL,
          import.meta.env.VITE_SUPABASE_ANON_KEY
        );

        export async function loadRoster() {
          const { data, error } = await supabase
            .from("roster_state").select("data").eq("id", KEY).maybeSingle();
          if (error) { console.error(error); return null; }
          return data ? data.data : null;
        }

        export async function saveRoster(snapshot) {
          const { error } = await supabase.from("roster_state").upsert({
            id: KEY, data: snapshot,
            saved_at: new Date().toISOString(), saved_by: snapshot.savedBy,
          });
          if (error) { console.error(error); return false; }
          return true;
        }

   6. Add Supabase Auth so people sign in with a real account.
      Until that is done the change log records a name someone
      picked from a list, not a verified user.
   ============================================================ */
