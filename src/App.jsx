import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { loadRoster, saveRoster, STORAGE_MODE } from "./storage.js";

/* ============================================================
   SYNCLINE ROSTER CONTROL v2
   Seeded from Roster_20240409.xlsx — Primary, Master Personnel
   Register, Legend, Manning Histogram, Mobilisation Tracking.

   v2 adds: leave management, FMG travel email import, shared
   state across users, change log, mobe/demob dates, and
   per-day day-shift / night-shift switching.
   ============================================================ */

/* ---------- STATUS CODES (Legend tab) ---------- */

const CODES = {
  "1":     { label: "Day shift",             group: "Site",   onsite: true  },
  "NS":    { label: "Night shift",           group: "Site",   onsite: true  },
  "GTN":   { label: "Geraldton office",      group: "Site",   onsite: false },
  "WFH":   { label: "Working from home",     group: "Site",   onsite: false },
  "C-FIA": { label: "Fly in AM (confirmed)", group: "Travel", onsite: true  },
  "C-FIP": { label: "Fly in PM (confirmed)", group: "Travel", onsite: false },
  "C-FOA": { label: "Fly out AM (confirmed)",group: "Travel", onsite: false },
  "C-FOP": { label: "Fly out PM (confirmed)",group: "Travel", onsite: true  },
  "C-DIA": { label: "Drive in AM (confirmed)",group:"Travel",  onsite: true  },
  "C-DOP": { label: "Drive out PM (confirmed)",group:"Travel", onsite: true  },
  "FIA":   { label: "Fly in AM",             group: "Travel", onsite: true,  unconfirmed: true },
  "FIP":   { label: "Fly in PM",             group: "Travel", onsite: false, unconfirmed: true },
  "FOA":   { label: "Fly out AM",            group: "Travel", onsite: false, unconfirmed: true },
  "FOP":   { label: "Fly out PM",            group: "Travel", onsite: true,  unconfirmed: true },
  "DIA":   { label: "Drive in AM",           group: "Travel", onsite: true,  unconfirmed: true },
  "DOP":   { label: "Drive out PM",          group: "Travel", onsite: true,  unconfirmed: true },
  "TBC":   { label: "Booked — awaiting confirmation", group: "Travel", onsite: false, risk: true },
  "WL":    { label: "Waitlisted",            group: "Travel", onsite: false, risk: true },
  "RR":    { label: "R & R",                 group: "Leave",  onsite: false },
  "RDO":   { label: "Rostered day off",      group: "Leave",  onsite: false },
  "AL":    { label: "Annual leave",          group: "Leave",  onsite: false, leave: true },
  "SL":    { label: "Sick leave",            group: "Leave",  onsite: false, leave: true, risk: true },
  "WC":    { label: "Workers comp",          group: "Leave",  onsite: false, leave: true },
  "LWOP":  { label: "Leave without pay",     group: "Leave",  onsite: false, leave: true },
  "CL":    { label: "Compassionate leave",   group: "Leave",  onsite: false, leave: true },
  "LSL":   { label: "Long service leave",    group: "Leave",  onsite: false, leave: true },
  "PH":    { label: "Public holiday",        group: "Leave",  onsite: false },
  "TR":    { label: "Training course",       group: "Other",  onsite: false },
  "CRS":   { label: "Course",                group: "Other",  onsite: false },
  "PEM":   { label: "Pre-employment medical",group: "Other",  onsite: false },
  "F2F":   { label: "Face to face induction",group: "Other",  onsite: false },
  "SD":    { label: "Stand down",            group: "Other",  onsite: false },
  "TOIL":  { label: "Time off in lieu",      group: "Other",  onsite: false },
  "Nshow": { label: "No show",               group: "Other",  onsite: false, risk: true },
};

const LEAVE_CODES = Object.keys(CODES).filter((c) => CODES[c].leave);

const PALETTE = {
  "1": ["#4C63E6", "#F2F5FF"], "NS": ["#26307A", "#B9C4FF"],
  "GTN": ["#3B4A57", "#C8D4DE"], "WFH": ["#3B4A57", "#C8D4DE"],
  travel: ["#0E90BE", "#E6FAFF"], travelU: ["#0B4657", "#5FD3F5"],
  risk: ["#B3241B", "#FFE2DF"], "RR": ["#151E28", "#5C6E7E"],
  "RDO": ["#151E28", "#5C6E7E"], "AL": ["#1E7A55", "#DFF7EC"],
  "SL": ["#8A4A1F", "#FFE7D2"], "WC": ["#8A4A1F", "#FFE7D2"],
  "CL": ["#8A4A1F", "#FFE7D2"], "LSL": ["#1E7A55", "#DFF7EC"],
  "LWOP": ["#4A3672", "#DDD0F5"], "PH": ["#8E4C77", "#FBDCF0"],
  other: ["#4E4718", "#E9DFA6"],
};

function codeStyle(code) {
  if (!code) return ["transparent", "#3A4652"];
  const m = CODES[code];
  if (!m) return ["#2A343F", "#9FB0BF"];
  if (PALETTE[code]) return PALETTE[code];
  if (m.risk) return PALETTE.risk;
  if (m.group === "Travel") return m.unconfirmed ? PALETTE.travelU : PALETTE.travel;
  return PALETTE.other;
}
const isOnSite = (c) => !!(c && CODES[c] && CODES[c].onsite);

/* ---------- PATTERNS ---------- */

const PATTERNS = {
  "2:2":       { on: 14, off: 14, travel: true, label: "14 on / 14 off" },
  "2:1":       { on: 14, off: 7,  travel: true, label: "14 on / 7 off" },
  "8:6":       { on: 8,  off: 6,  travel: true, label: "8 on / 6 off" },
  "4:3":       { on: 4,  off: 3,  travel: true, label: "4 on / 3 off" },
  "7D/7N/14R": { seq: [["1", 7], ["NS", 7], ["RR", 14]], travel: true, label: "7 day / 7 night / 14 off" },
  "5:2":       { office: true, label: "Mon–Fri office" },
  "Ad hoc":    { adhoc: true, label: "No pattern — manual only" },
};

/* ---------- SEED WORKFORCE ----------
   name, alias, category, position, POH, company, crew, pattern,
   default shift (0 day / 1 night), swing start, mobe date        */

const SW_A = "2026-06-24";
const SW_B = "2026-07-08";

const RAW = [
  ["BUTSON, Allan","","General Manager","General Manager","Geraldton","Wealth Merchants","Staff","5:2",0,"2026-07-01","2023-09-21"],
  ["SOUTAR, Jacqueline","Jaki","Administrator","Administrator","Geraldton","Syncline","Staff","5:2",0,"2026-07-01","2024-08-26"],
  ["CLACK, Wesley","Wes","Project Manager","Project Manager","Perth","Syncline","Staff","4:3",0,"2026-07-01","2026-01-06"],
  ["JOZWICKI, Gregory","Greg","Supervisor","Supervisor","Perth","Syncline","Staff B","8:6",0,"2026-06-29","2025-12-17"],
  ["FIELD, Scott","Scottie","Supervisor","Supervisor","Perth","Syncline","Staff","8:6",0,"2026-07-08","2026-01-21"],
  ["MATIU, Donna","","HSE Advisor","HSE Advisor","Perth","Syncline","Staff","8:6",0,"2026-07-02","2024-07-24"],
  ["TUXWORTH, James","","Operator","All Rounder Intermediate","Perth","Syncline","A","2:2",0,SW_A,"2026-02-18"],
  ["WILLIAMS, Jarrod","Jay Jay","Operator","Grader operations","Busselton","Syncline","A","2:2",0,SW_B,"2026-02-24"],
  ["JACKSON, David","Jacko","Operator","Grader Operations","Busselton","Syncline","A","2:2",0,SW_A,"2024-06-05"],
  ["BUTSON, Jett","","Operator","Grader operations","Perth","Syncline","A","2:2",0,SW_B,"2024-01-10"],
  ["VO, Tran","","Operator","Junior - HR WC / Roller / Loader / Grader","Perth","Syncline","A","2:2",0,SW_A,"2024-07-18"],
  ["ZOSEL, Edward","Eddie","Operator","Operator / Grader / Leading Hand","Perth","Syncline","A","2:2",1,SW_B,"2024-10-02"],
  ["ROBERTS, Simone","","Operator","All Rounder / Watercart / Loader / Roller","Perth","Syncline","A","2:2",1,SW_A,"2026-06-10"],
  ["PASSMORE, Gavin","","Operator","Junior - HR WC / Roller / Grader","Perth","Syncline","A","2:2",1,SW_B,"2026-02-04"],
  ["JOZWICKI, Renee","","Operator","WC / Moxy / Roller","Perth","Syncline","A","2:2",0,SW_A,"2026-03-04"],
  ["RADONICH, Colin","","Operator","All Rounder - Experienced","Perth","Syncline","A","2:2",1,SW_B,"2026-07-14"],
  ["LACROIX, Carla","","Operator","HR WC / Roller / Loader / Grader","Perth","Syncline","B","2:2",1,SW_A,"2024-07-24"],
  ["PARRY, Jordan","","Operator","HR WC / Roller / Grader","Busselton","Syncline","B","2:2",1,SW_B,"2025-11-12"],
  ["COBBY, Layne","","Operator","Junior - HR WC / Roller","Perth","Syncline","B","2:2",0,SW_A,"2025-04-30"],
  ["WOODLEY, Justin","","Operator","All Rounder / Grader","Perth","Syncline","B","2:2",0,SW_B,"2025-11-12"],
  ["RIVE, Michael","Chucky","Operator","All Rounder / Watercart / Loader / Roller","Perth","Syncline","B","2:2",0,SW_A,"2026-02-04"],
  ["SHEHADE, Victor","Vic","Operator","Operator - Leading Hand / Grader","Perth","Syncline","A+B","2:1",1,"2026-07-01","2024-11-25"],
  ["VERVERIS, Alexandrou","Alex","Operator","WC / Loader / Grader","Perth","Syncline","A+B","2:1",1,"2026-07-08","2026-03-03"],
  ["HARKIN, Dara","","Operator","Allrounder","Perth","Syncline","A+B","2:1",1,"2026-07-15","2026-07-15"],
  ["CAIRD, Sarah","","Operator","WC / Roller / Exc / Posi / Tipper","Perth","Syncline","C","2:2",1,SW_B,"2026-03-04"],
  ["FOGARTY, Troy","","Operator","Excavator / Posi / Loader / Grader / WC","Perth","Syncline","C","2:2",0,SW_A,"2026-03-10"],
  ["SLOAN, David","Davo","Operator","All Rounder / Grader Experience","Perth","Syncline","C","2:2",1,SW_B,"2026-03-10"],
];

/* Seeded leave + travel exceptions (person index 1-based, from, to, code) */
const SEED_LEAVE = [
  [9,  "2026-07-22", "2026-08-04", "AL",    "Booked before swing"],
  [10, "2026-07-13", "2026-07-21", "LWOP",  ""],
  [18, "2026-07-08", "2026-07-14", "LWOP",  ""],
  [16, "2026-07-16", "2026-07-18", "SL",    "Called in from site"],
  [26, "2026-07-26", "2026-08-04", "AL",    ""],
  [19, "2026-07-22", "2026-07-31", "AL",    ""],
  [21, "2026-07-27", "2026-08-04", "AL",    ""],
  [7,  "2026-07-28", "2026-07-30", "SL",    ""],
];
const SEED_OTHER = [
  [13, "2026-07-22", "2026-07-22", "TBC"],
  [5,  "2026-08-05", "2026-08-05", "Nshow"],
];

const USERS = ["Jaki Soutar", "Kiteesha", "Kylie Turner", "Wes Clack", "Greg Jozwicki", "Donna Matiu", "Allan Butson"];

const HORIZON_START = "2026-07-01";
const HORIZON_DAYS = 180;

/* ---------- DATES ---------- */

const MS = 86400000;
const toISO = (d) => d.toISOString().slice(0, 10);
const parse = (s) => new Date(s + "T00:00:00Z");
const addDays = (iso, n) => toISO(new Date(parse(iso).getTime() + n * MS));
const diffDays = (a, b) => Math.round((parse(a) - parse(b)) / MS);
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const dow = (iso) => parse(iso).getUTCDay();
const fmtShort = (iso) => `${parse(iso).getUTCDate()} ${MON[parse(iso).getUTCMonth()]}`;
const fmtLong = (iso) => `${DOW[dow(iso)]} ${parse(iso).getUTCDate()} ${MON[parse(iso).getUTCMonth()]} ${parse(iso).getUTCFullYear()}`;
const nowStamp = () => new Date().toISOString();
const fmtStamp = (s) => { const d = new Date(s);
  return `${String(d.getDate()).padStart(2,"0")} ${MON[d.getMonth()]} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; };
const DATES = Array.from({ length: HORIZON_DAYS }, (_, i) => addDays(HORIZON_START, i));
const rangeDays = (from, to) => { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; };

/* ---------- PATTERN ENGINE ---------- */

function patternCode(emp, iso) {
  if (emp.mobeDate && iso < emp.mobeDate) return null;
  if (emp.demobDate && iso > emp.demobDate) return null;
  const p = PATTERNS[emp.pattern];
  if (!p || p.adhoc) return null;
  if (p.office) return dow(iso) === 0 || dow(iso) === 6 ? "RR" : "GTN";

  const anchor = emp.anchor || HORIZON_START;
  const n = diffDays(iso, anchor);
  const base = emp.defaultShift === "NS" ? "NS" : "1";

  if (p.seq) {
    const cycle = p.seq.reduce((s, x) => s + x[1], 0);
    let i = ((n % cycle) + cycle) % cycle;
    for (const [code, len] of p.seq) {
      if (i < len) {
        if (!p.travel || code === "RR") return code;
        if (i === 0) return "FIA";
        if (i === len - 1) return "FOP";
        return code;
      }
      i -= len;
    }
    return "RR";
  }
  const cycle = p.on + p.off;
  const i = ((n % cycle) + cycle) % cycle;
  if (i >= p.on) return "RR";
  if (!p.travel) return base;
  if (i === 0) return "FIA";
  if (i === p.on - 1) return "FOP";
  return base;
}

/* ---------- METRICS ---------- */

const METRICS = [
  { id: "ops",    name: "Operators on site",      min: 8, test: (e) => e.category === "Operator" },
  { id: "sup",    name: "Supervisors on site",    min: 1, test: (e) => e.category === "Supervisor" },
  { id: "s26",    name: "Section 26 supervision", min: 1, test: (e) => e.s26 },
  { id: "lead",   name: "Leading hands",          min: 1, test: (e) => e.leadingHand },
  { id: "ns",     name: "Night shift crew",       min: 2, test: () => true, onlyCode: (c) => c === "NS" },
  { id: "grader", name: "Grader operators",       min: 2, test: (e) => e.grader },
  { id: "hse",    name: "HSE on site",            min: 0, test: (e) => e.category === "HSE Advisor" },
  { id: "pm",     name: "Project manager on site",min: 0, test: (e) => e.category === "Project Manager" },
];

/* ---------- STYLE TOKENS ---------- */

const C = {
  bg: "#0B1016", panel: "#121A22", panel2: "#0F1720", line: "#1F2C38",
  line2: "#2C3E4C", ink: "#E8F0F6", dim: "#8098AC", dimmer: "#586E80",
  ok: "#2BC48A", warn: "#F2A93B", bad: "#FF4D42", accent: "#00C2FF",
};
const mono = "'IBM Plex Mono', ui-monospace, Menlo, monospace";
const sans = "'IBM Plex Sans', system-ui, sans-serif";
const disp = "'Barlow Condensed', 'IBM Plex Sans', sans-serif";

function Btn({ children, onClick, active, danger, small, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: active ? C.accent : "transparent",
      color: disabled ? C.dimmer : active ? "#04131A" : danger ? C.bad : C.ink,
      border: `1px solid ${active ? C.accent : danger ? "#5A211C" : C.line2}`,
      padding: small ? "4px 9px" : "7px 14px", borderRadius: 2,
      cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
      fontFamily: disp, fontSize: small ? 12 : 13, letterSpacing: ".08em",
      textTransform: "uppercase", fontWeight: 600, whiteSpace: "nowrap",
    }}>{children}</button>
  );
}

function Tile({ label, value, sub, state, onClick }) {
  const col = state === "bad" ? C.bad : state === "warn" ? C.warn : state === "ok" ? C.ok : C.ink;
  return (
    <button onClick={onClick} style={{
      background: C.panel, border: `1px solid ${state === "bad" ? "#4A1A16" : C.line}`,
      borderTop: `2px solid ${col}`, padding: "10px 12px 12px", textAlign: "left",
      cursor: onClick ? "pointer" : "default", minWidth: 0, borderRadius: 2, fontFamily: sans }}>
      <div style={{ fontFamily: disp, fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase",
        color: C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
      <div style={{ fontFamily: mono, fontSize: 30, fontWeight: 600, color: col, lineHeight: 1.1, marginTop: 4 }}>{value}</div>
      <div style={{ fontFamily: mono, fontSize: 10.5, color: C.dimmer, marginTop: 2 }}>{sub}</div>
    </button>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 11 }}>
      <div style={{ fontFamily: disp, fontSize: 11, letterSpacing: ".12em", color: C.dim,
        textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

function Panel({ title, note, children, pad = 16 }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}` }}>
      {title && (
        <div style={{ padding: "11px 16px", borderBottom: `1px solid ${C.line}` }}>
          <span style={{ fontFamily: disp, fontSize: 15, letterSpacing: ".12em", textTransform: "uppercase" }}>{title}</span>
          {note && <span style={{ fontFamily: mono, fontSize: 10.5, color: C.dimmer, marginLeft: 10 }}>{note}</span>}
        </div>
      )}
      <div style={{ padding: pad }}>{children}</div>
    </div>
  );
}

/* ============================================================
   APP
   ============================================================ */

export default function App() {
  const buildEmployees = () =>
    RAW.map((r, i) => {
      const pos = r[3].toLowerCase();
      return {
        id: i + 1, name: r[0], alias: r[1], category: r[2], position: r[3],
        poh: r[4], company: r[5], crew: r[6], pattern: r[7],
        defaultShift: r[8] ? "NS" : "DS",
        anchor: r[9], mobeDate: r[10], demobDate: "",
        grader: pos.includes("grader"), leadingHand: pos.includes("leading hand"),
        s26: r[2] === "Supervisor" || r[2] === "Project Manager",
      };
    });

  const [employees, setEmployees] = useState(buildEmployees);
  const [overrides, setOverrides] = useState(() => {
    const o = {};
    SEED_LEAVE.forEach(([id, f, t, c]) => rangeDays(f, t).forEach((d) => (o[id + "|" + d] = c)));
    SEED_OTHER.forEach(([id, f, t, c]) => rangeDays(f, t).forEach((d) => (o[id + "|" + d] = c)));
    return o;
  });
  const [leaveRecords, setLeaveRecords] = useState(() =>
    SEED_LEAVE.map(([id, f, t, c, note], i) => ({
      id: "L" + (i + 1), empId: id, from: f, to: t, code: c, note: note || "",
      by: "Jaki Soutar", at: "2026-07-10T09:00:00Z",
    }))
  );
  const [travel, setTravel] = useState([]);
  const [log, setLog] = useState([]);
  const [thresholds, setThresholds] = useState(Object.fromEntries(METRICS.map((m) => [m.id, m.min])));

  const [user, setUser] = useState("");
  const [view, setView] = useState("dash");
  const [focusDate, setFocusDate] = useState("2026-07-29");
  const [gridStart, setGridStart] = useState("2026-07-27");
  const [brush, setBrush] = useState("__select");
  const [painting, setPainting] = useState(false);
  const [menu, setMenu] = useState(null);
  const [crewFilter, setCrewFilter] = useState("All");
  const [sync, setSync] = useState({ state: "idle", at: null, by: null });

  const hydrated = useRef(false);
  const saveTimer = useRef(null);

  /* ---- shared storage ---- */
  const snapshot = () => ({
    employees, overrides, leaveRecords, travel, log, thresholds,
    savedAt: nowStamp(), savedBy: user || "unknown",
  });

  const loadShared = useCallback(async () => {
    setSync((s) => ({ ...s, state: "loading" }));
    try {
      const d = await loadRoster();
      if (d) {
        if (d.employees) setEmployees(d.employees);
        if (d.overrides) setOverrides(d.overrides);
        if (d.leaveRecords) setLeaveRecords(d.leaveRecords);
        if (d.travel) setTravel(d.travel);
        if (d.log) setLog(d.log);
        if (d.thresholds) setThresholds(d.thresholds);
        setSync({ state: "ok", at: d.savedAt, by: d.savedBy });
      } else {
        setSync({ state: "empty", at: null, by: null });
      }
    } catch (e) {
      setSync({ state: "empty", at: null, by: null });
    }
    hydrated.current = true;
  }, []);

  useEffect(() => { loadShared(); }, [loadShared]);

  useEffect(() => {
    if (!hydrated.current) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSync((s) => ({ ...s, state: "saving" }));
      try {
        const snap = snapshot();
        const ok = await saveRoster(snap);
        if (!ok) throw new Error("save failed");
        setSync({ state: "ok", at: snap.savedAt, by: snap.savedBy });
      } catch (e) {
        setSync((s) => ({ ...s, state: "error" }));
      }
    }, 900);
    return () => clearTimeout(saveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees, overrides, leaveRecords, travel, thresholds]);

  /* ---- change log ---- */
  const record = useCallback((entry) => {
    setLog((l) => [{ ...entry, at: nowStamp(), by: user || "unsigned" }, ...l].slice(0, 800));
  }, [user]);

  /* ---- resolved code ---- */
  const codeFor = useCallback((emp, iso) => {
    const k = emp.id + "|" + iso;
    if (k in overrides) return overrides[k];
    return patternCode(emp, iso);
  }, [overrides]);

  const codeForRef = useRef(codeFor);
  useEffect(() => { codeForRef.current = codeFor; }, [codeFor]);

  const setCell = useCallback((empId, iso, code, why) => {
    const emp = employees.find((e) => e.id === empId);
    if (!emp) return;
    const before = codeForRef.current(emp, iso);
    const after = code === "__clear" ? patternCode(emp, iso) : code;
    if (before === after) return;
    setOverrides((o) => {
      const n = { ...o };
      if (code === "__clear") delete n[empId + "|" + iso];
      else n[empId + "|" + iso] = code;
      return n;
    });
    record({ kind: "cell", empId, name: emp.name, date: iso,
      from: before || "—", to: after || "—", why: why || "manual edit" });
  }, [employees, record]);

  /* ---- daily counts ---- */
  const daily = useMemo(() =>
    DATES.map((iso) => {
      const counts = {}; METRICS.forEach((m) => (counts[m.id] = 0));
      let total = 0;
      employees.forEach((e) => {
        const c = codeFor(e, iso);
        if (!isOnSite(c)) return;
        total++;
        METRICS.forEach((m) => {
          if (!m.test(e)) return;
          if (m.onlyCode && !m.onlyCode(c)) return;
          counts[m.id]++;
        });
      });
      return { iso, counts, total };
    }), [employees, codeFor]);

  const dayIndex = useMemo(() => { const m = {}; daily.forEach((d, i) => (m[d.iso] = i)); return m; }, [daily]);
  const today = daily[dayIndex[focusDate]] || daily[0];

  const alerts = useMemo(() => {
    const out = [];
    daily.forEach((d) => {
      METRICS.forEach((m) => {
        const min = thresholds[m.id];
        if (min && d.counts[m.id] < min)
          out.push({ iso: d.iso, metric: m.id, name: m.name, have: d.counts[m.id], need: min,
            sev: d.counts[m.id] === 0 ? "critical" : "warning" });
      });
      employees.forEach((e) => {
        const c = codeFor(e, d.iso);
        if (c && CODES[c] && CODES[c].risk)
          out.push({ iso: d.iso, metric: "flag", name: `${e.name} — ${CODES[c].label}`,
            have: null, need: null, sev: c === "Nshow" ? "critical" : "warning" });
      });
    });
    return out;
  }, [daily, thresholds, employees, codeFor]);

  const upcoming = useMemo(() => alerts.filter((a) => a.iso >= focusDate).slice(0, 250), [alerts, focusDate]);
  const criticalCount = upcoming.filter((a) => a.sev === "critical").length;

  useEffect(() => {
    const up = () => setPainting(false);
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  const jumpTo = (iso) => { setFocusDate(iso); setGridStart(addDays(iso, -3)); setView("grid"); };

  /* ---- leave ---- */
  const addLeave = (rec) => {
    const emp = employees.find((e) => e.id === rec.empId);
    const days = rangeDays(rec.from, rec.to);
    setOverrides((o) => { const n = { ...o }; days.forEach((d) => (n[rec.empId + "|" + d] = rec.code)); return n; });
    const id = "L" + Date.now();
    setLeaveRecords((r) => [...r, { ...rec, id, by: user || "unsigned", at: nowStamp() }]);
    record({ kind: "leave", empId: rec.empId, name: emp ? emp.name : "?", date: `${rec.from} → ${rec.to}`,
      from: "roster", to: `${rec.code} (${days.length}d)`, why: rec.note || "leave entered" });
  };

  const removeLeave = (id) => {
    const rec = leaveRecords.find((r) => r.id === id);
    if (!rec) return;
    const emp = employees.find((e) => e.id === rec.empId);
    setOverrides((o) => {
      const n = { ...o };
      rangeDays(rec.from, rec.to).forEach((d) => { if (n[rec.empId + "|" + d] === rec.code) delete n[rec.empId + "|" + d]; });
      return n;
    });
    setLeaveRecords((r) => r.filter((x) => x.id !== id));
    record({ kind: "leave", empId: rec.empId, name: emp ? emp.name : "?", date: `${rec.from} → ${rec.to}`,
      from: rec.code, to: "back to pattern", why: "leave cancelled" });
  };

  /* ---- people edits ---- */
  const updateEmployee = (id, patch) => {
    const emp = employees.find((e) => e.id === id);
    setEmployees((es) => es.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    Object.keys(patch).forEach((k) => {
      record({ kind: "person", empId: id, name: emp ? emp.name : "?", date: "—",
        from: `${k}: ${emp ? emp[k] : "?"}`, to: `${k}: ${patch[k]}`, why: "employee record" });
    });
  };

  const crews = ["All", ...Array.from(new Set(employees.map((e) => e.crew)))];
  const visibleEmployees = employees.filter((e) => crewFilter === "All" || e.crew === crewFilter);

  return (
    <div style={{ background: C.bg, color: C.ink, fontFamily: sans, minHeight: "100vh" }}
      onClick={() => setMenu(null)}>
      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { height: 9px; width: 9px; }
        ::-webkit-scrollbar-track { background: ${C.panel2}; }
        ::-webkit-scrollbar-thumb { background: ${C.line2}; }
        .cell:hover { outline: 1px solid ${C.accent}; outline-offset: -1px; }
        select, input, textarea { background: ${C.panel2}; color: ${C.ink}; border: 1px solid ${C.line2};
          padding: 6px 8px; font-family: ${mono}; font-size: 12px; border-radius: 2px; }
        textarea { font-size: 11.5px; line-height: 1.5; }
        table { border-collapse: collapse; width: 100%; }
        @media (prefers-reduced-motion: no-preference) { .pulse { animation: p 2s ease-in-out infinite; } }
        @keyframes p { 0%,100% { opacity: 1 } 50% { opacity: .45 } }
      `}</style>

      {/* HEADER */}
      <div style={{ borderBottom: `1px solid ${C.line}`, background: C.panel2, padding: "12px 18px",
        display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: disp, fontSize: 22, fontWeight: 700, letterSpacing: ".04em", lineHeight: 1 }}>
            SYNCLINE <span style={{ color: C.accent }}>ROSTER CONTROL</span>
          </div>
          <div style={{ fontFamily: mono, fontSize: 10, color: C.dimmer, letterSpacing: ".1em", marginTop: 3 }}>
            ELIWANA / KARTAJIRRI VILLAGE · FMG
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, marginLeft: "auto", flexWrap: "wrap" }}>
          {[["dash","Dashboard"],["grid","Roster"],["leave","Leave"],["travel","Travel"],["people","People"],["audit","Change log"]]
            .map(([k, l]) => <Btn key={k} active={view === k} onClick={() => setView(k)}>{l}</Btn>)}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, borderLeft: `1px solid ${C.line}`, paddingLeft: 14 }}>
          <div style={{ fontFamily: disp, fontSize: 11, color: C.dim, letterSpacing: ".12em" }}>ALERTS</div>
          <div className={criticalCount ? "pulse" : ""} style={{ fontFamily: mono, fontSize: 20, fontWeight: 600,
            color: criticalCount ? C.bad : upcoming.length ? C.warn : C.ok }}>{upcoming.length}</div>
        </div>
      </div>

      {/* IDENTITY + SYNC BAR */}
      <div style={{ padding: "8px 18px", borderBottom: `1px solid ${C.line}`, display: "flex",
        alignItems: "center", gap: 12, flexWrap: "wrap",
        background: user ? "transparent" : "#2A1A10" }}>
        <span style={{ fontFamily: disp, fontSize: 12, letterSpacing: ".12em", color: C.dim }}>WORKING AS</span>
        <select value={user} onChange={(e) => setUser(e.target.value)}>
          <option value="">— select your name —</option>
          {USERS.map((u) => <option key={u}>{u}</option>)}
        </select>
        {!user && <span style={{ fontFamily: mono, fontSize: 11, color: C.warn }}>
          Pick your name so changes are attributed in the change log.</span>}
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: mono, fontSize: 10.5, color: sync.state === "error" ? C.bad : C.dimmer }}>
          {sync.state === "saving" ? "saving…"
            : sync.state === "loading" ? "loading shared roster…"
            : sync.state === "error" ? "save failed — changes are local only"
            : sync.at ? `${STORAGE_MODE === "local" ? "saved to this browser" : "shared roster saved"} ${fmtStamp(sync.at)} by ${sync.by}`
            : "nothing saved yet — your first change will save it"}
        </span>
        <Btn small onClick={loadShared}>Refresh</Btn>
      </div>

      {/* DATE BAR */}
      <div style={{ padding: "10px 18px", borderBottom: `1px solid ${C.line}`, display: "flex",
        alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Btn small onClick={() => setFocusDate(addDays(focusDate, -1))}>◀</Btn>
        <div style={{ fontFamily: disp, fontSize: 19, fontWeight: 600, minWidth: 210 }}>{fmtLong(focusDate)}</div>
        <Btn small onClick={() => setFocusDate(addDays(focusDate, 1))}>▶</Btn>
        <input type="date" value={focusDate} onChange={(e) => e.target.value && setFocusDate(e.target.value)} />
        <div style={{ flex: 1 }} />
        <div style={{ fontFamily: mono, fontSize: 11, color: C.dim }}>
          {employees.filter((e) => !e.demobDate || e.demobDate >= focusDate).length} mobilised · {today ? today.total : 0} on site
        </div>
      </div>

      <div style={{ padding: 18 }}>
        {view === "dash" && <Dashboard {...{ today, daily, dayIndex, focusDate, setFocusDate,
          thresholds, setThresholds, upcoming, jumpTo }} />}
        {view === "grid" && <Grid {...{ visibleEmployees, gridStart, setGridStart, codeFor, setCell,
          brush, setBrush, painting, setPainting, daily, dayIndex, thresholds, crews, crewFilter,
          setCrewFilter, focusDate, setFocusDate, overrides, menu, setMenu, employees }} />}
        {view === "leave" && <Leave {...{ employees, leaveRecords, addLeave, removeLeave, focusDate }} />}
        {view === "travel" && <Travel {...{ employees, travel, setTravel, setCell, record, user }} />}
        {view === "people" && <People {...{ employees, updateEmployee, thresholds, setThresholds }} />}
        {view === "audit" && <Audit {...{ log, employees }} />}
      </div>
    </div>
  );
}

/* ============================================================
   DASHBOARD
   ============================================================ */

function Dashboard({ today, daily, dayIndex, focusDate, setFocusDate, thresholds, upcoming, jumpTo }) {
  const railStart = Math.max(0, (dayIndex[focusDate] || 0) - 7);
  const rail = daily.slice(railStart, railStart + 90);
  const maxOps = Math.max(12, ...rail.map((d) => d.counts.ops));

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        <Tile label="Total on site" value={today.total} sub="all categories" state="ok" />
        {METRICS.map((m) => {
          const have = today.counts[m.id], min = thresholds[m.id];
          const state = !min ? "" : have < min ? (have === 0 ? "bad" : "warn") : "ok";
          return <Tile key={m.id} label={m.name} value={have}
            sub={min ? `min ${min}${have < min ? ` · short ${min - have}` : ""}` : "no minimum"}
            state={state} onClick={() => jumpTo(focusDate)} />;
        })}
      </div>

      <div style={{ background: C.panel2, border: `1px solid ${C.line}`, padding: "14px 16px 10px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
          <div style={{ fontFamily: disp, fontSize: 15, letterSpacing: ".12em", textTransform: "uppercase" }}>
            Manning rail — next 90 days</div>
          <div style={{ fontFamily: mono, fontSize: 10.5, color: C.dimmer }}>
            operators on site vs minimum {thresholds.ops} · click any day</div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 1, height: 110, overflowX: "auto" }}>
          {rail.map((d) => {
            const h = Math.max(3, (d.counts.ops / maxOps) * 92);
            const short = d.counts.ops < thresholds.ops;
            const noSup = d.counts.s26 < thresholds.s26;
            return (
              <div key={d.iso} onClick={() => setFocusDate(d.iso)}
                title={`${fmtLong(d.iso)} — ${d.counts.ops} operators, ${d.counts.s26} S26, ${d.counts.ns} nights`}
                style={{ flex: "0 0 11px", cursor: "pointer", display: "flex", flexDirection: "column",
                  justifyContent: "flex-end", height: "100%",
                  background: d.iso === focusDate ? "#1B2A38" : "transparent" }}>
                {noSup && <div style={{ height: 4, background: C.bad, marginBottom: 2 }} />}
                <div style={{ height: h, background: short ? C.bad : dow(d.iso) % 6 === 0 ? "#2E5F8A" : C.accent,
                  opacity: short ? 1 : 0.85 }} />
                <div style={{ fontFamily: mono, fontSize: 7, color: C.dimmer, textAlign: "center", height: 9 }}>
                  {parse(d.iso).getUTCDate() === 1 ? MON[parse(d.iso).getUTCMonth()] : ""}</div>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 8, fontFamily: mono, fontSize: 10, color: C.dimmer }}>
          <span><span style={{ color: C.accent }}>█</span> at or above minimum</span>
          <span><span style={{ color: C.bad }}>█</span> below {thresholds.ops} operators</span>
          <span><span style={{ color: C.bad }}>▔</span> no Section 26 coverage</span>
        </div>
      </div>

      <Panel title="Coverage &amp; compliance alerts" note={`from ${fmtShort(focusDate)} forward`} pad={0}>
        <div style={{ maxHeight: 340, overflowY: "auto" }}>
          {upcoming.length === 0 && <div style={{ padding: 20, color: C.dim, fontFamily: mono, fontSize: 12 }}>
            No breaches in the horizon.</div>}
          {upcoming.map((a, i) => (
            <div key={i} onClick={() => jumpTo(a.iso)} style={{ display: "flex", alignItems: "center", gap: 14,
              padding: "8px 16px", borderBottom: `1px solid ${C.line}`, cursor: "pointer",
              borderLeft: `3px solid ${a.sev === "critical" ? C.bad : C.warn}` }}>
              <div style={{ fontFamily: mono, fontSize: 11, color: C.dim, width: 96 }}>
                {DOW[dow(a.iso)]} {fmtShort(a.iso)}</div>
              <div style={{ fontFamily: disp, fontSize: 11, letterSpacing: ".1em", width: 66,
                color: a.sev === "critical" ? C.bad : C.warn }}>
                {a.sev === "critical" ? "CRITICAL" : "WARNING"}</div>
              <div style={{ fontSize: 13, flex: 1 }}>{a.name}</div>
              {a.have !== null && <div style={{ fontFamily: mono, fontSize: 12, color: C.dim }}>{a.have} / {a.need}</div>}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

/* ============================================================
   ROSTER GRID
   ============================================================ */

function Grid({ visibleEmployees, gridStart, setGridStart, codeFor, setCell, brush, setBrush,
  painting, setPainting, daily, dayIndex, thresholds, crews, crewFilter, setCrewFilter,
  focusDate, setFocusDate, overrides, menu, setMenu }) {

  const NAMEW = 186, CW = 34, GRID_DAYS = 28;
  const gridDates = Array.from({ length: GRID_DAYS }, (_, i) => addDays(gridStart, i));

  const openMenu = (e, emp, iso) => {
    e.stopPropagation();
    setMenu({ x: Math.min(e.clientX, window.innerWidth - 230), y: e.clientY, emp, iso });
  };

  const MENU_ACTIONS = [
    ["1", "Day shift"], ["NS", "Night shift"], ["RR", "R & R"],
    ["AL", "Annual leave"], ["SL", "Sick leave"], ["TR", "Training"],
    ["__clear", "Back to pattern"],
  ];

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <Btn small onClick={() => setGridStart(addDays(gridStart, -28))}>◀ 4 wks</Btn>
        <Btn small onClick={() => setGridStart(addDays(gridStart, -7))}>◀ wk</Btn>
        <Btn small onClick={() => setGridStart(addDays(gridStart, 7))}>wk ▶</Btn>
        <Btn small onClick={() => setGridStart(addDays(gridStart, 28))}>4 wks ▶</Btn>
        <span style={{ fontFamily: mono, fontSize: 11, color: C.dim }}>
          {fmtShort(gridDates[0])} – {fmtShort(gridDates[GRID_DAYS - 1])}</span>
        <div style={{ width: 1, height: 22, background: C.line }} />
        <span style={{ fontFamily: disp, fontSize: 12, letterSpacing: ".12em", color: C.dim }}>CREW</span>
        <select value={crewFilter} onChange={(e) => setCrewFilter(e.target.value)}>
          {crews.map((c) => <option key={c}>{c}</option>)}
        </select>
        <div style={{ width: 1, height: 22, background: C.line }} />
        <span style={{ fontFamily: disp, fontSize: 12, letterSpacing: ".12em", color: C.dim }}>MODE</span>
        <select value={brush} onChange={(e) => setBrush(e.target.value)} style={{ minWidth: 210 }}>
          <option value="__select">Click a cell to choose</option>
          <option value="__clear">Paint: back to pattern</option>
          {Object.keys(CODES).map((c) => <option key={c} value={c}>Paint: {c} · {CODES[c].label}</option>)}
        </select>
        {brush !== "__select" && (
          <>
            <div style={{ width: 18, height: 18, border: `1px solid ${C.line2}`,
              background: brush === "__clear" ? "transparent" : codeStyle(brush)[0] }} />
            <span style={{ fontFamily: mono, fontSize: 10.5, color: C.warn }}>drag across cells to paint</span>
          </>
        )}
      </div>

      <div style={{ overflowX: "auto", border: `1px solid ${C.line}`, background: C.panel2 }}
        onMouseLeave={() => setPainting(false)}>
        <div style={{ minWidth: NAMEW + GRID_DAYS * CW }}>

          <div style={{ display: "flex", position: "sticky", top: 0, zIndex: 3, background: C.panel2 }}>
            <div style={{ width: NAMEW, flex: `0 0 ${NAMEW}px`, borderRight: `1px solid ${C.line2}`,
              borderBottom: `1px solid ${C.line2}`, padding: "6px 8px", fontFamily: disp, fontSize: 11,
              letterSpacing: ".12em", color: C.dim }}>EMPLOYEE / CREW / PATTERN</div>
            {gridDates.map((iso) => {
              const d = daily[dayIndex[iso]];
              const short = d && d.counts.ops < thresholds.ops;
              const wknd = dow(iso) === 0 || dow(iso) === 6;
              return (
                <div key={iso} onClick={() => setFocusDate(iso)} style={{ width: CW, flex: `0 0 ${CW}px`,
                  textAlign: "center", cursor: "pointer", borderRight: `1px solid ${C.line}`,
                  borderBottom: `1px solid ${C.line2}`, padding: "4px 0 3px",
                  background: iso === focusDate ? "#1B2A38" : wknd ? "#0C1219" : "transparent" }}>
                  <div style={{ fontFamily: mono, fontSize: 9, color: C.dimmer }}>{DOW[dow(iso)][0]}</div>
                  <div style={{ fontFamily: mono, fontSize: 12 }}>{parse(iso).getUTCDate()}</div>
                  <div style={{ fontFamily: mono, fontSize: 11, fontWeight: 600, marginTop: 2,
                    color: short ? C.bad : C.ok }}>{d ? d.counts.ops : "-"}</div>
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", background: "#0C1219" }}>
            <div style={{ width: NAMEW, flex: `0 0 ${NAMEW}px`, borderRight: `1px solid ${C.line2}`,
              padding: "2px 8px", fontFamily: mono, fontSize: 10, color: C.dim }}>S26 · NS · GRD</div>
            {gridDates.map((iso) => {
              const d = daily[dayIndex[iso]];
              return (
                <div key={iso} style={{ width: CW, flex: `0 0 ${CW}px`, textAlign: "center",
                  borderRight: `1px solid ${C.line}`, padding: "2px 0", fontFamily: mono, fontSize: 9 }}>
                  {d ? <>
                    <span style={{ color: d.counts.s26 < thresholds.s26 ? C.bad : C.dimmer }}>{d.counts.s26}</span>·
                    <span style={{ color: d.counts.ns < thresholds.ns ? C.bad : C.dimmer }}>{d.counts.ns}</span>·
                    <span style={{ color: d.counts.grader < thresholds.grader ? C.bad : C.dimmer }}>{d.counts.grader}</span>
                  </> : ""}
                </div>
              );
            })}
          </div>

          {visibleEmployees.map((emp, ri) => (
            <div key={emp.id} style={{ display: "flex", borderTop: `1px solid ${C.line}`,
              background: ri % 2 ? "#101820" : "transparent" }}>
              <div style={{ width: NAMEW, flex: `0 0 ${NAMEW}px`, borderRight: `1px solid ${C.line2}`,
                padding: "4px 8px", overflow: "hidden" }}>
                <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden",
                  textOverflow: "ellipsis" }}>
                  {emp.name}{emp.s26 && <span style={{ color: C.warn, fontSize: 10, marginLeft: 4 }}>§26</span>}
                </div>
                <div style={{ fontFamily: mono, fontSize: 9.5, color: C.dimmer, whiteSpace: "nowrap" }}>
                  {emp.crew} · {emp.pattern} · {emp.defaultShift}
                  {emp.grader && " · GRD"}{emp.leadingHand && " · LH"}
                </div>
              </div>
              {gridDates.map((iso) => {
                const preMobe = emp.mobeDate && iso < emp.mobeDate;
                const postDemob = emp.demobDate && iso > emp.demobDate;
                const code = codeFor(emp, iso);
                const [bg, fg] = codeStyle(code);
                const isOverride = (emp.id + "|" + iso) in overrides;
                const unconf = code && CODES[code] && CODES[code].unconfirmed;
                return (
                  <div key={iso} className="cell"
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => {
                      if (brush === "__select") { openMenu(e, emp, iso); return; }
                      setPainting(true); setCell(emp.id, iso, brush);
                    }}
                    onMouseEnter={() => { if (painting && brush !== "__select") setCell(emp.id, iso, brush); }}
                    title={`${emp.name} · ${fmtLong(iso)} · ${preMobe ? "not yet mobilised"
                      : postDemob ? "demobilised" : code ? (CODES[code] ? CODES[code].label : code) : "not rostered"}`}
                    style={{ width: CW, flex: `0 0 ${CW}px`, height: 30, color: fg,
                      background: preMobe || postDemob
                        ? "repeating-linear-gradient(45deg, #0C1219, #0C1219 3px, #151E28 3px, #151E28 6px)" : bg,
                      borderRight: `1px solid ${C.line}`, display: "flex", alignItems: "center",
                      justifyContent: "center", fontFamily: mono, fontSize: 9, cursor: "cell",
                      userSelect: "none", position: "relative",
                      boxShadow: unconf ? `inset 0 0 0 1px ${PALETTE.travel[0]}` : "none" }}>
                    {preMobe || postDemob ? "" : code === "1" ? "" : code || ""}
                    {isOverride && !preMobe && !postDemob && (
                      <div style={{ position: "absolute", top: 1, right: 1, width: 3, height: 3, background: C.accent }} />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div style={{ fontFamily: mono, fontSize: 10.5, color: C.dimmer }}>
        Blank blue = day shift. Cyan corner dot = manual change over the pattern. Hatched = outside
        mobilisation dates. Cyan outline = travel not yet confirmed by FMG.
      </div>

      {menu && (
        <div onClick={(e) => e.stopPropagation()} style={{ position: "fixed", left: menu.x, top: menu.y,
          background: C.panel, border: `1px solid ${C.line2}`, zIndex: 50, minWidth: 210,
          boxShadow: "0 8px 28px rgba(0,0,0,.6)" }}>
          <div style={{ padding: "8px 10px", borderBottom: `1px solid ${C.line}`, fontFamily: mono,
            fontSize: 10.5, color: C.dim }}>
            {menu.emp.name}<br />{fmtLong(menu.iso)}
          </div>
          {MENU_ACTIONS.map(([code, label]) => (
            <div key={code} onClick={() => { setCell(menu.emp.id, menu.iso, code); setMenu(null); }}
              style={{ padding: "7px 10px", cursor: "pointer", fontSize: 12.5, display: "flex",
                alignItems: "center", gap: 8, borderBottom: `1px solid ${C.line}` }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#1B2733")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
              <span style={{ width: 12, height: 12, border: `1px solid ${C.line2}`,
                background: code === "__clear" ? "transparent" : codeStyle(code)[0] }} />
              {label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   LEAVE
   ============================================================ */

function Leave({ employees, leaveRecords, addLeave, removeLeave, focusDate }) {
  const [empId, setEmpId] = useState(employees[6] ? employees[6].id : 1);
  const [code, setCode] = useState("AL");
  const [from, setFrom] = useState(focusDate);
  const [to, setTo] = useState(addDays(focusDate, 6));
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");

  const submit = () => {
    if (to < from) { setErr("End date is before the start date."); return; }
    setErr("");
    addLeave({ empId: Number(empId), code, from, to, note });
    setNote("");
  };

  const sorted = leaveRecords.slice().sort((a, b) => (a.from < b.from ? 1 : -1));
  const th = { textAlign: "left", padding: "7px 10px", fontFamily: disp, fontSize: 11,
    letterSpacing: ".12em", color: C.dim, textTransform: "uppercase", borderBottom: `1px solid ${C.line2}` };
  const td = { padding: "6px 10px", borderBottom: `1px solid ${C.line}`, fontSize: 12.5 };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 370px) 1fr", gap: 18 }}>
      <Panel title="Enter leave">
        <Field label="Employee">
          <select value={empId} onChange={(e) => setEmpId(e.target.value)} style={{ width: "100%" }}>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </Field>
        <Field label="Leave type">
          <select value={code} onChange={(e) => setCode(e.target.value)} style={{ width: "100%" }}>
            {LEAVE_CODES.map((c) => <option key={c} value={c}>{c} · {CODES[c].label}</option>)}
          </select>
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="From"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: "100%" }} /></Field>
          <Field label="To"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: "100%" }} /></Field>
        </div>
        <Field label="Note">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" style={{ width: "100%" }} />
        </Field>
        {err && <div style={{ color: C.bad, fontFamily: mono, fontSize: 11, marginBottom: 8 }}>{err}</div>}
        <Btn onClick={submit}>Add leave</Btn>
        <div style={{ fontFamily: mono, fontSize: 10.5, color: C.dimmer, marginTop: 12, lineHeight: 1.5 }}>
          Leave writes across the whole range and overrides the pattern. Removing it puts those days
          back on pattern. Every entry is recorded in the change log.
        </div>
      </Panel>

      <Panel title="Leave register" note={`${leaveRecords.length} records`} pad={0}>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr>
              <th style={th}>Employee</th><th style={th}>Type</th><th style={th}>From</th>
              <th style={th}>To</th><th style={th}>Days</th><th style={th}>Note</th>
              <th style={th}>Entered by</th><th style={th}></th>
            </tr></thead>
            <tbody>
              {sorted.map((r) => {
                const emp = employees.find((e) => e.id === r.empId);
                const [bg, fg] = codeStyle(r.code);
                return (
                  <tr key={r.id}>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{emp ? emp.name : "?"}</td>
                    <td style={td}><span style={{ background: bg, color: fg, padding: "2px 6px",
                      fontFamily: mono, fontSize: 11 }}>{r.code}</span></td>
                    <td style={{ ...td, fontFamily: mono, fontSize: 11 }}>{fmtShort(r.from)}</td>
                    <td style={{ ...td, fontFamily: mono, fontSize: 11 }}>{fmtShort(r.to)}</td>
                    <td style={{ ...td, fontFamily: mono, fontSize: 11 }}>{diffDays(r.to, r.from) + 1}</td>
                    <td style={{ ...td, color: C.dim, fontSize: 11.5 }}>{r.note}</td>
                    <td style={{ ...td, color: C.dim, fontFamily: mono, fontSize: 10.5 }}>{r.by}</td>
                    <td style={td}><Btn small danger onClick={() => removeLeave(r.id)}>Remove</Btn></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

/* ============================================================
   TRAVEL — email import + manual entry
   ============================================================ */

const normalise = (s) => (s || "").toUpperCase().replace(/[^A-Z ]/g, " ").replace(/\s+/g, " ").trim();

function matchEmployee(nameText, employees) {
  const n = normalise(nameText);
  if (!n) return null;
  const parts = n.split(" ");
  let best = null, bestScore = 0;
  employees.forEach((e) => {
    const full = normalise(e.name), alias = normalise(e.alias);
    const surname = full.split(" ")[0];
    let score = 0;
    if (full === n) score = 100;
    else if (parts.includes(surname)) score = 60 + (parts.some((p) => full.includes(p) && p !== surname) ? 20 : 0);
    else if (alias && parts.includes(alias)) score = 50;
    if (score > bestScore) { bestScore = score; best = e; }
  });
  return bestScore >= 50 ? best : null;
}

function movementToCode(m) {
  const dir = (m.direction || "").toUpperCase() === "OUT" ? "O" : "I";
  const period = (m.period || "").toUpperCase() === "PM" ? "P" : "A";
  const mode = (m.mode || "").toUpperCase() === "DRIVE" ? "D" : "F";
  let code = `${mode}${dir}${period}`;
  if (mode === "D" && !["DIA", "DOP"].includes(code)) code = dir === "I" ? "DIA" : "DOP";
  return m.confirmed === false ? code : "C-" + code;
}

function Travel({ employees, travel, setTravel, setCell, record, user }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [pdf, setPdf] = useState(null);
  const [manual, setManual] = useState(false);

  const onFile = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setFileName(f.name); setErr("");
    if (f.type === "application/pdf") {
      const b64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result).split(",")[1]);
        r.onerror = () => rej(new Error("Could not read the file"));
        r.readAsDataURL(f);
      }).catch(() => null);
      if (!b64) { setErr("Could not read that PDF."); return; }
      setPdf(b64); setText("");
    } else {
      const t = await f.text().catch(() => "");
      setText(t); setPdf(null);
    }
  };

  const readEmail = async () => {
    if (!text.trim() && !pdf) { setErr("Paste the email text or attach the file first."); return; }
    setBusy(true); setErr(""); setRows([]);
    try {
      const resp = await fetch("/api/read-travel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pdf ? { pdf } : { text }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setErr(data.error || "Could not read that message.");
        setBusy(false);
        return;
      }
      const parsed = data.movements;
      if (!Array.isArray(parsed)) throw new Error("bad shape");
      if (parsed.length === 0) { setErr("No travel movements found in that message."); setBusy(false); return; }
      setRows(parsed.map((m, i) => {
        const emp = matchEmployee(m.name, employees);
        return { key: i, raw: m.name, empId: emp ? emp.id : "", date: m.date || "",
          code: movementToCode(m), flight: m.flight || "", use: !!emp };
      }));
    } catch (e) {
      setErr("Could not read that message. Check it contains names and dates, or enter the travel manually.");
    }
    setBusy(false);
  };

  const applyRows = () => {
    const chosen = rows.filter((r) => r.use && r.empId && r.date);
    chosen.forEach((r) => {
      const emp = employees.find((e) => e.id === Number(r.empId));
      setCell(Number(r.empId), r.date, r.code, `travel email${r.flight ? " " + r.flight : ""}`);
      setTravel((t) => [...t, { id: Date.now() + Math.random(), empId: Number(r.empId),
        name: emp ? emp.name : r.raw, date: r.date, code: r.code, flight: r.flight,
        source: fileName || "pasted email", by: user || "unsigned" }]);
    });
    setRows([]); setText(""); setPdf(null); setFileName("");
  };

  const th = { textAlign: "left", padding: "6px 8px", fontFamily: disp, fontSize: 11,
    letterSpacing: ".1em", color: C.dim, textTransform: "uppercase", borderBottom: `1px solid ${C.line2}` };
  const td = { padding: "5px 8px", borderBottom: `1px solid ${C.line}`, fontSize: 12 };

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <Panel title="Read a travel email from FMG"
        note="paste the email, or attach the PDF / .txt they send">
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "start" }}>
          <textarea rows={7} value={text} onChange={(e) => { setText(e.target.value); setPdf(null); }}
            placeholder="Paste the travel confirmation email here…" style={{ width: "100%" }} />
          <div style={{ display: "grid", gap: 8 }}>
            <label style={{ display: "inline-block" }}>
              <input type="file" accept=".pdf,.txt,.eml,.msg,text/*" onChange={onFile} style={{ display: "none" }} />
              <span style={{ display: "inline-block", border: `1px solid ${C.line2}`, padding: "7px 14px",
                fontFamily: disp, fontSize: 13, letterSpacing: ".08em", textTransform: "uppercase",
                fontWeight: 600, cursor: "pointer" }}>Attach file</span>
            </label>
            <Btn onClick={readEmail} disabled={busy}>{busy ? "Reading…" : "Read travel"}</Btn>
            {fileName && <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>{fileName}</span>}
          </div>
        </div>
        {err && <div style={{ color: C.bad, fontFamily: mono, fontSize: 11.5, marginTop: 10 }}>{err}</div>}
        <div style={{ fontFamily: mono, fontSize: 10.5, color: C.dimmer, marginTop: 10 }}>
          Nothing is written to the roster until you check the lines below and apply them.
        </div>
      </Panel>

      {rows.length > 0 && (
        <Panel title="Check before applying" note={`${rows.filter((r) => r.use).length} of ${rows.length} selected`} pad={0}>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr>
                <th style={th}>Apply</th><th style={th}>Name in email</th><th style={th}>Matched to</th>
                <th style={th}>Date</th><th style={th}>Movement</th><th style={th}>Flight</th>
              </tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.key} style={{ background: r.empId ? "transparent" : "#2A1410" }}>
                    <td style={td}>
                      <input type="checkbox" checked={r.use} disabled={!r.empId}
                        onChange={(e) => setRows((rs) => rs.map((x, j) => j === i ? { ...x, use: e.target.checked } : x))}
                        style={{ width: 15, height: 15, accentColor: C.accent }} />
                    </td>
                    <td style={{ ...td, fontFamily: mono, fontSize: 11 }}>{r.raw}</td>
                    <td style={td}>
                      <select value={r.empId}
                        onChange={(e) => setRows((rs) => rs.map((x, j) => j === i
                          ? { ...x, empId: e.target.value, use: !!e.target.value } : x))}>
                        <option value="">— no match, choose —</option>
                        {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                      </select>
                    </td>
                    <td style={td}>
                      <input type="date" value={r.date}
                        onChange={(e) => setRows((rs) => rs.map((x, j) => j === i ? { ...x, date: e.target.value } : x))} />
                    </td>
                    <td style={td}>
                      <select value={r.code}
                        onChange={(e) => setRows((rs) => rs.map((x, j) => j === i ? { ...x, code: e.target.value } : x))}>
                        {["C-FIA","C-FIP","C-FOA","C-FOP","C-DIA","C-DOP","FIA","FIP","FOA","FOP","TBC","WL"]
                          .map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td style={{ ...td, fontFamily: mono, fontSize: 11, color: C.dim }}>{r.flight || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: 12, display: "flex", gap: 10 }}>
            <Btn onClick={applyRows} disabled={!rows.some((r) => r.use && r.empId)}>Apply to roster</Btn>
            <Btn onClick={() => setRows([])}>Discard</Btn>
          </div>
        </Panel>
      )}

      <Panel title="Applied travel" note={`${travel.length} movements`} pad={0}>
        {travel.length === 0 && <div style={{ padding: 18, fontFamily: mono, fontSize: 12, color: C.dim }}>
          Nothing applied yet.</div>}
        {travel.slice().reverse().map((t) => (
          <div key={t.id} style={{ display: "flex", gap: 14, alignItems: "center", padding: "8px 16px",
            borderBottom: `1px solid ${C.line}` }}>
            <div style={{ fontFamily: mono, fontSize: 11, color: C.dim, width: 78 }}>{fmtShort(t.date)}</div>
            <div style={{ fontSize: 13, flex: 1 }}>{t.name}</div>
            <div style={{ fontFamily: mono, fontSize: 11, background: codeStyle(t.code)[0],
              color: codeStyle(t.code)[1], padding: "2px 7px" }}>{t.code}</div>
            <div style={{ fontFamily: mono, fontSize: 11, color: C.dim, width: 70 }}>{t.flight || "—"}</div>
            <div style={{ fontFamily: mono, fontSize: 10, color: C.dimmer, width: 130,
              overflow: "hidden", textOverflow: "ellipsis" }}>{t.source}</div>
          </div>
        ))}
      </Panel>

      <Btn small onClick={() => setManual(!manual)}>{manual ? "Hide" : "Show"} manual entry</Btn>
      {manual && <ManualTravel {...{ employees, setCell, setTravel, user }} />}
    </div>
  );
}

function ManualTravel({ employees, setCell, setTravel, user }) {
  const [empId, setEmpId] = useState(employees[6] ? employees[6].id : 1);
  const [date, setDate] = useState("2026-08-05");
  const [code, setCode] = useState("C-FIA");
  const [flight, setFlight] = useState("");
  const [swing, setSwing] = useState(14);

  const apply = () => {
    const emp = employees.find((e) => e.id === Number(empId));
    setCell(Number(empId), date, code, "manual travel entry");
    if (code.startsWith("C-FI") && swing > 1) {
      for (let i = 1; i < swing; i++) {
        setCell(Number(empId), addDays(date, i),
          i === swing - 1 ? "C-FOP" : emp && emp.defaultShift === "NS" ? "NS" : "1", "swing from travel entry");
      }
    }
    setTravel((t) => [...t, { id: Date.now(), empId: Number(empId), name: emp ? emp.name : "?",
      date, code, flight, source: "manual entry", by: user || "unsigned" }]);
  };

  return (
    <Panel title="Manual travel entry">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <Field label="Employee">
          <select value={empId} onChange={(e) => setEmpId(e.target.value)} style={{ width: "100%" }}>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </Field>
        <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: "100%" }} /></Field>
        <Field label="Movement">
          <select value={code} onChange={(e) => setCode(e.target.value)} style={{ width: "100%" }}>
            {["C-FIA","C-FIP","C-FOA","C-FOP","C-DIA","C-DOP","TBC","WL"].map((c) =>
              <option key={c} value={c}>{c} · {CODES[c].label}</option>)}
          </select>
        </Field>
        <Field label="Flight"><input value={flight} onChange={(e) => setFlight(e.target.value)} style={{ width: "100%" }} /></Field>
        {code.startsWith("C-FI") && (
          <Field label="Swing length (days)">
            <input type="number" min="1" max="21" value={swing}
              onChange={(e) => setSwing(Number(e.target.value))} style={{ width: "100%" }} />
          </Field>
        )}
      </div>
      <Btn onClick={apply}>Apply to roster</Btn>
    </Panel>
  );
}

/* ============================================================
   PEOPLE
   ============================================================ */

function People({ employees, updateEmployee, thresholds, setThresholds }) {
  const th = { textAlign: "left", padding: "7px 8px", fontFamily: disp, fontSize: 11,
    letterSpacing: ".12em", color: C.dim, textTransform: "uppercase",
    borderBottom: `1px solid ${C.line2}`, whiteSpace: "nowrap" };
  const td = { padding: "5px 8px", borderBottom: `1px solid ${C.line}`, fontSize: 12.5 };

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <Panel title="Coverage minimums" note="0 tracks the count without raising an alert">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 }}>
          {METRICS.map((m) => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, fontSize: 12.5 }}>{m.name}</div>
              <input type="number" min="0" max="30" value={thresholds[m.id]} style={{ width: 62 }}
                onChange={(e) => setThresholds((t) => ({ ...t, [m.id]: Number(e.target.value) || 0 }))} />
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Personnel" note="mobilisation and demobilisation dates drive the roster" pad={0}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ minWidth: 1120 }}>
            <thead><tr>
              <th style={th}>Name</th><th style={th}>Position</th><th style={th}>Crew</th>
              <th style={th}>Pattern</th><th style={th}>Swing start</th>
              <th style={th}>Mobe</th><th style={th}>Demobe</th><th style={th}>Default shift</th>
              <th style={th}>§26</th><th style={th}>LH</th><th style={th}>Grader</th>
            </tr></thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id} style={{ opacity: e.demobDate ? 0.55 : 1 }}>
                  <td style={{ ...td, fontWeight: 500, whiteSpace: "nowrap" }}>{e.name}</td>
                  <td style={{ ...td, color: C.dim, fontSize: 11.5 }}>{e.position}</td>
                  <td style={{ ...td, fontFamily: mono, fontSize: 11 }}>{e.crew}</td>
                  <td style={td}>
                    <select value={e.pattern} onChange={(ev) => updateEmployee(e.id, { pattern: ev.target.value })}>
                      {Object.keys(PATTERNS).map((p) => <option key={p}>{p}</option>)}
                    </select>
                  </td>
                  <td style={td}><input type="date" value={e.anchor}
                    onChange={(ev) => ev.target.value && updateEmployee(e.id, { anchor: ev.target.value })} /></td>
                  <td style={td}><input type="date" value={e.mobeDate || ""}
                    onChange={(ev) => updateEmployee(e.id, { mobeDate: ev.target.value })} /></td>
                  <td style={td}><input type="date" value={e.demobDate || ""}
                    onChange={(ev) => updateEmployee(e.id, { demobDate: ev.target.value })} /></td>
                  <td style={td}>
                    <select value={e.defaultShift} onChange={(ev) => updateEmployee(e.id, { defaultShift: ev.target.value })}>
                      <option value="DS">Day</option><option value="NS">Night</option>
                    </select>
                  </td>
                  {["s26", "leadingHand", "grader"].map((k) => (
                    <td key={k} style={{ ...td, textAlign: "center" }}>
                      <input type="checkbox" checked={!!e[k]}
                        onChange={(ev) => updateEmployee(e.id, { [k]: ev.target.checked })}
                        style={{ width: 15, height: 15, accentColor: C.accent }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "10px 12px", fontFamily: mono, fontSize: 10.5, color: C.dimmer }}>
          Default shift only sets what the pattern generates. To move someone from days to nights for
          part of a swing, change those cells in the roster grid.
        </div>
      </Panel>
    </div>
  );
}

/* ============================================================
   CHANGE LOG
   ============================================================ */

function Audit({ log, employees }) {
  const [who, setWho] = useState("All");
  const [kind, setKind] = useState("All");
  const [csv, setCsv] = useState("");

  const people = ["All", ...Array.from(new Set(log.map((l) => l.name)))];
  const kinds = ["All", "cell", "leave", "person"];
  const filtered = log.filter((l) => (who === "All" || l.name === who) && (kind === "All" || l.kind === kind));

  const makeCsv = () => {
    const head = "when,by,type,employee,date,from,to,reason";
    const esc = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    setCsv([head, ...filtered.map((l) =>
      [l.at, l.by, l.kind, l.name, l.date, l.from, l.to, l.why].map(esc).join(","))].join("\n"));
  };

  const th = { textAlign: "left", padding: "7px 10px", fontFamily: disp, fontSize: 11,
    letterSpacing: ".12em", color: C.dim, textTransform: "uppercase", borderBottom: `1px solid ${C.line2}` };
  const td = { padding: "5px 10px", borderBottom: `1px solid ${C.line}`, fontSize: 12 };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontFamily: disp, fontSize: 12, letterSpacing: ".12em", color: C.dim }}>EMPLOYEE</span>
        <select value={who} onChange={(e) => setWho(e.target.value)}>{people.map((p) => <option key={p}>{p}</option>)}</select>
        <span style={{ fontFamily: disp, fontSize: 12, letterSpacing: ".12em", color: C.dim }}>TYPE</span>
        <select value={kind} onChange={(e) => setKind(e.target.value)}>{kinds.map((k) => <option key={k}>{k}</option>)}</select>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: mono, fontSize: 11, color: C.dim }}>{filtered.length} entries</span>
        <Btn small onClick={makeCsv}>Build CSV</Btn>
      </div>

      {csv && (
        <Panel title="CSV — select all and copy">
          <textarea readOnly value={csv} rows={8} style={{ width: "100%" }}
            onFocus={(e) => e.target.select()} />
          <div style={{ marginTop: 8 }}><Btn small onClick={() => setCsv("")}>Close</Btn></div>
        </Panel>
      )}

      <Panel pad={0}>
        <div style={{ maxHeight: 560, overflowY: "auto" }}>
          <table>
            <thead><tr>
              <th style={th}>When</th><th style={th}>By</th><th style={th}>Employee</th>
              <th style={th}>Date</th><th style={th}>From</th><th style={th}>To</th><th style={th}>Reason</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td style={{ ...td, color: C.dim, fontFamily: mono }} colSpan={7}>
                No changes recorded yet.</td></tr>}
              {filtered.map((l, i) => (
                <tr key={i}>
                  <td style={{ ...td, fontFamily: mono, fontSize: 10.5, color: C.dim, whiteSpace: "nowrap" }}>{fmtStamp(l.at)}</td>
                  <td style={{ ...td, fontSize: 11.5, color: l.by === "unsigned" ? C.warn : C.ink }}>{l.by}</td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>{l.name}</td>
                  <td style={{ ...td, fontFamily: mono, fontSize: 10.5, color: C.dim }}>{l.date}</td>
                  <td style={{ ...td, fontFamily: mono, fontSize: 11 }}>{l.from}</td>
                  <td style={{ ...td, fontFamily: mono, fontSize: 11, color: C.accent }}>{l.to}</td>
                  <td style={{ ...td, fontSize: 11.5, color: C.dim }}>{l.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div style={{ fontFamily: mono, fontSize: 10.5, color: C.warn, lineHeight: 1.6 }}>
        This log records what changed and which name was selected at the time. It is not
        authenticated — anyone can select any name. Treat it as a working record, not as evidence.
      </div>
    </div>
  );
}
