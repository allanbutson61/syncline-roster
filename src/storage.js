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
    supabase.from("roster_cells").select("emp_id, the_date, code"),
    supabase.from("watch_items").select("emp_id, the_date, code, reason, created_at, created_by"),
    supabase.from("people").select("id, data").order("id"),
    supabase.from("records").select("id, kind, data, created_at"),
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
    savedAt: settings.meta ? settings.meta.savedAt : null,
    savedBy: settings.meta ? settings.meta.savedBy : null,
  };
  last = snapshot;
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

  if (changed.length) jobs.push(supabase.from("roster_cells").upsert(changed));
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
  if (watchUp.length) jobs.push(supabase.from("watch_items").upsert(watchUp));
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
  if (peopleUp.length) jobs.push(supabase.from("people").upsert(peopleUp));

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
    if (up.length) jobs.push(supabase.from("records").upsert(up));
    const gone = Object.keys(wasById);
    if (gone.length) jobs.push(supabase.from("records").delete().in("id", gone));
  });

  /* --- settings --- */
  const settingRows = [
    { key: "thresholds", value: snapshot.thresholds || {} },
    { key: "dismissed", value: snapshot.dismissed || {} },
    { key: "customPatterns", value: snapshot.customPatterns || {} },
    { key: "meta", value: { savedAt: snapshot.savedAt, savedBy: snapshot.savedBy } },
  ].filter((r) => JSON.stringify((prev.__settings || {})[r.key]) !== JSON.stringify(r.value))
   .map((r) => ({ ...r, updated_by: snapshot.savedBy, updated_at: new Date().toISOString() }));
  if (settingRows.length) jobs.push(supabase.from("settings").upsert(settingRows));

  const results = await Promise.all(jobs);
  const bad = results.map((r) => r && r.error).find(Boolean);
  if (bad) {
    console.error("Could not save part of the roster", bad);
    return false;
  }

  last = { ...snapshot, __settings: {
    thresholds: snapshot.thresholds, dismissed: snapshot.dismissed,
    customPatterns: snapshot.customPatterns,
    meta: { savedAt: snapshot.savedAt, savedBy: snapshot.savedBy },
  } };
  return true;
}

/* records carry their own id in most cases; the change log does not */
function recId(r, kind, i) {
  if (r && r.id) return String(r.id);
  if (kind === "log") return "log:" + (r.at || "") + ":" + (r.empId || 0) + ":" + (r.date || "") + ":" + i;
  return kind + ":" + i;
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
