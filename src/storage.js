/* ============================================================
   STORAGE

   One shared roster in Supabase. Everyone signed in sees the
   same data, and changes appear on each other's screens within
   a second or two.

   The roster is stored one row per person per day, so two
   people editing different days can never overwrite each other.
   Only the cells that actually changed are written.

   If Supabase is not configured the app falls back to saving in
   this browser only, exactly as it did before.
   ============================================================ */

import { supabase, CONFIGURED } from "./supabase.js";

const KEY = "syncline:roster:v2";
export const STORAGE_MODE = CONFIGURED ? "shared" : "local";

/* what we last saw, so we can work out what changed */
let last = null;
let lastError = null;

/* the reason the last save failed, so the screen can say rather than guess */
export function lastSaveError() {
  return lastError;
}

const cellKey = (empId, date) => empId + "|" + date;
const splitKey = (k) => {
  const i = k.indexOf("|");
  return [Number(k.slice(0, i)), k.slice(i + 1)];
};

/* ---------- local fallback ---------- */

async function loadLocal() {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error("Could not read the saved roster", e);
    return null;
  }
}

async function saveLocal(snapshot) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(snapshot));
    return true;
  } catch (e) {
    console.error("Could not save the roster", e);
    return false;
  }
}

/* ---------- shared ---------- */

const RECORD_KINDS = {
  leaveRecords: "leave",
  travel: "travel",
  requests: "request",
  actions: "action",
  noShows: "noshow",
  log: "log",
};

async function loadShared() {
  const [cells, watchRows, peopleRows, recordRows, settingRows] = await Promise.all([
    /* Ordered on purpose. These are read into objects keyed by person and day,
       so if the table ever holds more than one row for the same key the last
       one read wins. Without an ORDER BY the winner is whatever order Postgres
       happens to return, which can differ between loads — the screen would then
       show one value, then the other, with no edit in between. */
    supabase.from("roster_cells").select("emp_id, the_date, code")
      .order("emp_id").order("the_date"),
    supabase.from("watch_items").select("emp_id, the_date, code, reason, created_at, created_by")
      .order("emp_id").order("the_date"),
    supabase.from("people").select("id, data").order("id"),
    supabase.from("records").select("id, kind, data, created_at").order("id"),
    supabase.from("settings").select("key, value"),
  ]);

  const firstError = [cells, watchRows, peopleRows, recordRows, settingRows]
    .map((r) => r.error).find(Boolean);
  if (firstError) {
    console.error("Could not load the shared roster", firstError);
    throw firstError;
  }

  /* Nothing there at all — let the app seed itself from the spreadsheet. */
  if (!peopleRows.data.length && !cells.data.length) return null;

  const overrides = {};
  cells.data.forEach((r) => (overrides[cellKey(r.emp_id, r.the_date)] = r.code));

  const watch = {};
  watchRows.data.forEach((r) => (watch[cellKey(r.emp_id, r.the_date)] = {
    code: r.code, why: r.reason || "", at: r.created_at, by: r.created_by || "",
  }));

  const lists = {};
  Object.keys(RECORD_KINDS).forEach((k) => (lists[k] = []));
  const kindToField = {};
  Object.keys(RECORD_KINDS).forEach((f) => (kindToField[RECORD_KINDS[f]] = f));
  recordRows.data.forEach((r) => {
    const field = kindToField[r.kind];
    if (field) lists[field].push(r.data);
  });
  if (lists.log) lists.log.sort((a, b) => (a.at < b.at ? 1 : -1));

  const settings = {};
  settingRows.data.forEach((r) => (settings[r.key] = r.value));

  /* The personnel table is administrator-only. If it is empty but the roster
     is not, the first save was made by someone without permission to write it.
     Leave employees undefined so the app keeps the ones it seeded and writes
     them up on the next save, rather than showing an empty People tab. */
  const havePeople = peopleRows.data.length > 0;
  if (!havePeople) console.warn("No personnel in the database yet — using the seeded list.");

  const snapshot = {
    employees: havePeople ? peopleRows.data.map((r) => r.data) : undefined,
    overrides, watch,
    ...lists,
    thresholds: settings.thresholds || undefined,
    dismissed: settings.dismissed || {},
    customPatterns: settings.customPatterns || {},
    notes: settings.notes || {},
    savedAt: null,
    savedBy: null,
  };
  /* Remember what the settings rows actually hold. Without this the comparison
     in saveShared has nothing to compare against, so all four rows look changed
     on the first save after every load and get written every time. The settings
     table is administrator-only, so for a supervisor that write is refused and
     takes the whole save down with it — and because a failed save does not
     refresh this cache, every later save fails the same way. */
  last = { ...snapshot, __settings: {
    notes: settings.notes || {},
    thresholds: settings.thresholds || {},
    dismissed: settings.dismissed || {},
    customPatterns: settings.customPatterns || {},
  } };
  return snapshot;
}

async function saveShared(snapshot) {
  const prev = last || { overrides: {}, watch: {}, employees: [] };
  const jobs = [];

  /* --- the roster, cell by cell --- */
  const nowCells = snapshot.overrides || {};
  const wasCells = prev.overrides || {};
  const changed = [], removed = [];
  Object.keys(nowCells).forEach((k) => {
    if (wasCells[k] !== nowCells[k]) {
      const [empId, date] = splitKey(k);
      changed.push({ emp_id: empId, the_date: date, code: nowCells[k],
        updated_by: snapshot.savedBy, updated_at: new Date().toISOString() });
    }
  });
  Object.keys(wasCells).forEach((k) => { if (!(k in nowCells)) removed.push(splitKey(k)); });

  chunked(dedupe(changed, (r) => r.emp_id + "|" + r.the_date, "roster day"))
    .forEach((part) => jobs.push(supabase.from("roster_cells").upsert(part)));
  for (const [empId, date] of removed) {
    jobs.push(supabase.from("roster_cells").delete().eq("emp_id", empId).eq("the_date", date));
  }

  /* --- waitlisted seats --- */
  const nowWatch = snapshot.watch || {};
  const wasWatch = prev.watch || {};
  const watchUp = [], watchGone = [];
  Object.keys(nowWatch).forEach((k) => {
    const a = wasWatch[k], b = nowWatch[k];
    if (!a || a.code !== b.code) {
      const [empId, date] = splitKey(k);
      watchUp.push({ emp_id: empId, the_date: date, code: b.code,
        reason: b.why || "", created_by: b.by || snapshot.savedBy });
    }
  });
  Object.keys(wasWatch).forEach((k) => { if (!(k in nowWatch)) watchGone.push(splitKey(k)); });
  chunked(dedupe(watchUp, (r) => r.emp_id + "|" + r.the_date, "waitlisted seat"))
    .forEach((part) => jobs.push(supabase.from("watch_items").upsert(part)));
  for (const [empId, date] of watchGone) {
    jobs.push(supabase.from("watch_items").delete().eq("emp_id", empId).eq("the_date", date));
  }

  /* --- personnel --- */
  const wasPeople = {};
  (prev.employees || []).forEach((e) => (wasPeople[e.id] = JSON.stringify(e)));
  const peopleUp = (snapshot.employees || [])
    .filter((e) => wasPeople[e.id] !== JSON.stringify(e))
    .map((e) => ({ id: e.id, data: e, updated_by: snapshot.savedBy,
      updated_at: new Date().toISOString() }));
  chunked(dedupe(peopleUp, (r) => r.id, "personnel"))
    .forEach((part) => jobs.push(supabase.from("people").upsert(part)));

  /* Anyone no longer on the list is removed, so a reseed with fewer people
     does not leave the ones who have gone sitting in the database.

     Only when the list of people has actually changed. This used to run on
     every save, including saves that touched nothing but a roster day, which
     meant a tab holding a stale personnel list could delete somebody another
     user had just added. */
  const keepIds = (snapshot.employees || []).map((e) => e.id);
  const prevIds = (prev.employees || []).map((e) => e.id);
  const sameIds = keepIds.length === prevIds.length
    && keepIds.slice().sort().join(",") === prevIds.slice().sort().join(",");
  if (keepIds.length && !sameIds) {
    jobs.push(supabase.from("people").delete()
      .not("id", "in", `(${keepIds.join(",")})`));
  }

  /* --- leave, travel, requests, actions, no shows, change log --- */
  Object.keys(RECORD_KINDS).forEach((field) => {
    const kind = RECORD_KINDS[field];
    const nowList = snapshot[field] || [];
    const wasList = prev[field] || [];
    const wasById = {};
    wasList.forEach((r, i) => (wasById[recId(r, kind, i)] = JSON.stringify(r)));
    const up = [];
    nowList.forEach((r, i) => {
      const id = recId(r, kind, i);
      if (wasById[id] !== JSON.stringify(r))
        up.push({ id, kind, data: r, created_by: r.by || snapshot.savedBy });
      delete wasById[id];
    });
    chunked(dedupe(up, (r) => r.id, kind))
      .forEach((part) => jobs.push(supabase.from("records").upsert(part)));
    chunked(Object.keys(wasById)).forEach((part) =>
      jobs.push(supabase.from("records").delete().in("id", part)));
  });

  /* --- settings --- */
  /* Only what has actually changed. 'meta' used to be written every time — its
     timestamp always differed — and because settings is administrator-only that
     made every save by a supervisor fail. The saved-at time is shown from
     memory instead; it does not need storing. */
  const settingRows = [
    { key: "notes", value: snapshot.notes || {} },
    { key: "thresholds", value: snapshot.thresholds || {} },
    { key: "dismissed", value: snapshot.dismissed || {} },
    { key: "customPatterns", value: snapshot.customPatterns || {} },
  ].filter((r) => JSON.stringify((prev.__settings || {})[r.key]) !== JSON.stringify(r.value))
   .map((r) => ({ ...r, updated_by: snapshot.savedBy, updated_at: new Date().toISOString() }));
  if (settingRows.length) jobs.push(supabase.from("settings").upsert(settingRows));

  const results = await Promise.all(jobs);
  const bad = results.map((r) => r && r.error).find(Boolean);
  if (bad) {
    console.error("Could not save part of the roster", bad);
    lastError = bad.message || String(bad);
    return false;
  }
  lastError = null;

  last = { ...snapshot, __settings: {
    notes: snapshot.notes,
    thresholds: snapshot.thresholds, dismissed: snapshot.dismissed,
    customPatterns: snapshot.customPatterns,
  } };
  return true;
}

/* Every record carries its own id. The change log used to fall back on its
   position in the list — and because the newest entry goes on the front, that
   made every id shift on every save, so the whole log was deleted and rewritten
   each time. Once it was a few hundred entries long the request was too big to
   send and the save failed. Ids no longer depend on position. */
function recId(r, kind, i) {
  if (r && r.id) return String(r.id);
  if (kind === "log")
    return "log:" + (r.at || "") + ":" + (r.empId || 0) + ":" + (r.date || "")
      + ":" + (r.kind || "") + ":" + (r.to || "");
  return kind + ":" + i;
}

/* Postgres will not accept an upsert that carries the same key twice in one
   statement — it fails with "ON CONFLICT DO UPDATE command cannot affect row a
   second time". One duplicate anywhere therefore threw away the entire save,
   and the person lost every change they had made since loading the page.

   Ids are minted uniquely now, but a batch is still collapsed to one row per
   key before it is sent, so a duplicate can never again cost someone their
   work. The last one wins, since that is the most recent state. Anything
   dropped is logged with its key, so a new source of duplicates can be traced
   rather than silently absorbed. */
function dedupe(rows, keyOf, what) {
  const byKey = new Map();
  const seen = [];
  rows.forEach((r) => {
    const k = String(keyOf(r));
    if (byKey.has(k)) seen.push(k);
    byKey.set(k, r);
  });
  if (seen.length)
    console.warn(`Merged ${seen.length} duplicate ${what} row(s) before saving:`, seen);
  return Array.from(byKey.values());
}

/* Supabase takes these over a URL, so a few hundred ids at once is too many. */
const CHUNK = 80;
function chunked(list) {
  const out = [];
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK));
  return out;
}

/* ---------- what the app calls ---------- */

export async function loadRoster() {
  if (!CONFIGURED) return loadLocal();
  try {
    return await loadShared();
  } catch (e) {
    return null;
  }
}

export async function saveRoster(snapshot) {
  if (!CONFIGURED) return saveLocal(snapshot);
  try {
    return await saveShared(snapshot);
  } catch (e) {
    console.error(e);
    lastError = e && e.message ? e.message : String(e);
    return false;
  }
}

/* Someone else changed something — tell the app so it can reload.
   Returns a function that stops listening. */
export function onRemoteChange(cb) {
  if (!CONFIGURED) return () => {};
  const channel = supabase.channel("roster-changes");
  ["roster_cells", "watch_items", "people", "records", "settings"].forEach((table) => {
    channel.on("postgres_changes", { event: "*", schema: "public", table }, () => cb());
  });
  channel.subscribe();
  return () => supabase.removeChannel(channel);
}

/* Called after the app seeds itself from the spreadsheet, so the
   first save writes everything rather than nothing. */
export function forgetCache() {
  last = null;
}
