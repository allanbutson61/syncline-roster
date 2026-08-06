



import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { loadRoster, saveRoster, STORAGE_MODE } from "./storage.js";
import LOGO from "./logo.js";

/* ============================================================
   SYNCLINE ROSTER CONTROL v3
   Seeded from Roster_20240409.xlsx
   ============================================================ */

/* ---------- BRAND ---------- */

const C = {
  page:   "#F7F4F1",
  panel:  "#FFFFFF",
  panel2: "#FBF9F7",
  line:   "#E5DED8",
  line2:  "#CFC5BD",
  ink:    "#312122",
  dim:    "#7A6A64",
  dimmer: "#A2938C",
  red:    "#B02423",
  orange: "#DC7A40",
  ok:     "#2E7D5B",
  warn:   "#DC7A40",
  bad:    "#B02423",
};

const mono = "'IBM Plex Mono', ui-monospace, Menlo, monospace";
const sans = "'IBM Plex Sans', system-ui, sans-serif";
const disp = "'Barlow Condensed', 'IBM Plex Sans', sans-serif";

/* ---------- TRAVEL MOVEMENTS ----------
   Three states for every movement:
     FIA       needs requesting from the travel team
     FIA-TBC   requested, waiting on the travel team
     C-FIA     confirmed by FMG                                */

const MOVEMENTS = {
  FIA: { label: "Fly in AM",    dir: "IN",  onsite: true  },
  FIP: { label: "Fly in PM",    dir: "IN",  onsite: false },
  FOA: { label: "Fly out AM",   dir: "OUT", onsite: false },
  FOP: { label: "Fly out PM",   dir: "OUT", onsite: true  },
  DIA: { label: "Drive in AM",  dir: "IN",  onsite: true  },
  DIP: { label: "Drive in PM",  dir: "IN",  onsite: false },
  DOA: { label: "Drive out AM", dir: "OUT", onsite: false },
  DOP: { label: "Drive out PM", dir: "OUT", onsite: true  },
};

const TRAVEL_STATES = {
  toRequest: { suffix: "",     prefix: "",   word: "to request" },
  requested: { suffix: "-TBC", prefix: "",   word: "requested — awaiting travel team" },
  confirmed: { suffix: "",     prefix: "C-", word: "confirmed by FMG" },
};

const travelCode = (mv, state) =>
  TRAVEL_STATES[state].prefix + mv + TRAVEL_STATES[state].suffix;

const CODES = {
  "1":     { label: "Day shift",            group: "Site",  onsite: true, display: "DS" },
  "NS":    { label: "Night shift",          group: "Site",  onsite: true },
  "GTN":   { label: "Geraldton office",     group: "Site",  onsite: false },
  "WFH":   { label: "Working from home",    group: "Site",  onsite: false },
  "RR":    { label: "R & R",                group: "Leave", onsite: false },
  "RDO":   { label: "Rostered day off",     group: "Leave", onsite: false },
  "AL":    { label: "Annual leave",         group: "Leave", onsite: false, leave: true },
  "SL":    { label: "Sick leave",           group: "Leave", onsite: false, leave: true, risk: true },
  "WC":    { label: "Workers comp",         group: "Leave", onsite: false, leave: true },
  "LWOP":  { label: "Leave without pay",    group: "Leave", onsite: false, leave: true },
  "CL":    { label: "Compassionate leave",  group: "Leave", onsite: false, leave: true },
  "LSL":   { label: "Long service leave",   group: "Leave", onsite: false, leave: true },
  "PH":    { label: "Public holiday",       group: "Leave", onsite: false },
  "TR":    { label: "Training course",      group: "Other", onsite: false },
  "CRS":   { label: "Course",               group: "Other", onsite: false },
  "PEM":   { label: "Pre-employment medical", group: "Other", onsite: false },
  "F2F":   { label: "Face to face induction", group: "Other", onsite: false },
  "SD":    { label: "Stand down",           group: "Other", onsite: false },
  "TOIL":  { label: "Time off in lieu",     group: "Other", onsite: false },
  "WL":    { label: "Waitlisted",           group: "Travel", onsite: false, risk: true },
  "Nshow": { label: "No show",              group: "Other", onsite: false, risk: true },
};

Object.keys(MOVEMENTS).forEach((mv) => {
  const m = MOVEMENTS[mv];
  Object.keys(TRAVEL_STATES).forEach((st) => {
    CODES[travelCode(mv, st)] = {
      label: `${m.label} — ${TRAVEL_STATES[st].word}`,
      group: "Travel", onsite: m.onsite, movement: mv, dir: m.dir, travelState: st,
      risk: st === "toRequest",
    };
  });
});

const LEAVE_CODES = Object.keys(CODES).filter((c) => CODES[c].leave);
const isOnSite = (c) => !!(c && CODES[c] && CODES[c].onsite);
const codeText = (c) => (c && CODES[c] && CODES[c].display) || c || "";
const isWorkDay = (c) => c === "1" || c === "NS";
const travelState = (c) => (c && CODES[c] ? CODES[c].travelState : null);
const movementOf = (c) => (c && CODES[c] ? CODES[c].movement : null);
const dirOf = (c) => (c && CODES[c] ? CODES[c].dir : null);

/* ---------- CELL COLOURS ---------- */

const SOLID = {
  "1":     ["#DBE5F4", "#22447B", "#BCCCE6"],
  "NS":    ["#2E3F66", "#EAF0FB", "#2E3F66"],
  "GTN":   ["#EDE7E1", "#5E524C", "#DDD3CB"],
  "WFH":   ["#EDE7E1", "#5E524C", "#DDD3CB"],
  "RR":    ["#F2EDE8", "#A2938C", "#E5DED8"],
  "RDO":   ["#F2EDE8", "#A2938C", "#E5DED8"],
  "AL":    ["#DCEFE3", "#1E6B4A", "#BEE0CD"],
  "LSL":   ["#DCEFE3", "#1E6B4A", "#BEE0CD"],
  "SL":    ["#FBE0DC", "#A02D24", "#F0C4BD"],
  "WC":    ["#FBE0DC", "#A02D24", "#F0C4BD"],
  "CL":    ["#FBE0DC", "#A02D24", "#F0C4BD"],
  "LWOP":  ["#E9E0F4", "#5A3E86", "#D6C8EA"],
  "PH":    ["#F8DEEE", "#8E3D6C", "#EFC6DF"],
  "Nshow": ["#B02423", "#FFFFFF", "#B02423"],
  "WL":    ["#FBE3CF", "#A8541B", "#B02423"],
  other:   ["#F5EFD6", "#6E5E17", "#E6DBB6"],
};

/* returns [background, text, border] */
function codeStyle(code) {
  if (!code) return ["transparent", C.dimmer, C.line];
  const meta = CODES[code];
  if (!meta) return ["#EFE9E4", C.dim, C.line];
  if (meta.movement) {
    if (meta.travelState === "confirmed") return ["#1E88A8", "#FFFFFF", "#1E88A8"];
    if (meta.travelState === "requested") return ["#FBE3CF", "#A8541B", "#DC7A40"];
    return ["#FFFFFF", "#B02423", "#B02423"];
  }
  if (SOLID[code]) return SOLID[code];
  return SOLID.other;
}

/* ---------- PATTERNS ---------- */

const PATTERNS = {
  "2:2":       { on: 14, off: 14, travel: true, label: "14 on / 14 off" },
  "2:1":       { on: 14, off: 7,  travel: true, label: "14 on / 7 off" },
  "3:1":       { on: 21, off: 7,  travel: true, label: "21 on / 7 off" },
  "8:6":       { on: 8,  off: 6,  travel: true, label: "8 on / 6 off" },
  "9:5":       { on: 9,  off: 5,  travel: true, label: "9 on / 5 off" },
  "4:3":       { on: 4,  off: 3,  travel: true, label: "4 on / 3 off" },
  "7D/7N/14R": { seq: [["1", 7], ["NS", 7], ["RR", 14]], travel: true, label: "7 day / 7 night / 14 off" },
  "5:2":       { office: true, label: "Mon-Fri office" },
  "Ad hoc":    { adhoc: true, label: "No pattern - manual only" },
};

/* ---------- SEED WORKFORCE ---------- */

const SW_A = "2026-06-24";
const SW_B = "2026-07-08";

const RAW = [
  ["BUTSON, Allan","","General Manager","General Manager","Geraldton","Staff","5:2",0,"2026-07-01","2023-09-21"],
  ["SOUTAR, Jacqueline","Jaki","Administrator","Administrator","Geraldton","Staff","5:2",0,"2026-07-01","2024-08-26"],
  ["CLACK, Wesley","Wes","Project Manager","Project Manager","Perth","Staff","4:3",0,"2026-07-01","2026-01-06"],
  ["JOZWICKI, Gregory","Greg","Supervisor","Supervisor","Perth","Staff B","8:6",0,"2026-06-29","2025-12-17"],
  ["FIELD, Scott","Scottie","Supervisor","Supervisor","Perth","Staff","8:6",0,"2026-07-08","2026-01-21"],
  ["MATIU, Donna","","HSE Advisor","HSE Advisor","Perth","Staff","8:6",0,"2026-07-02","2024-07-24"],
  ["TUXWORTH, James","","Operator","All Rounder Intermediate","Perth","A","2:2",0,SW_A,"2026-02-18"],
  ["WILLIAMS, Jarrod","Jay Jay","Operator","Grader operations","Busselton","A","2:2",0,SW_B,"2026-02-24"],
  ["JACKSON, David","Jacko","Operator","Grader Operations","Busselton","A","2:2",0,SW_A,"2024-06-05"],
  ["BUTSON, Jett","","Operator","Grader operations","Perth","A","2:2",0,SW_B,"2024-01-10"],
  ["VO, Tran","","Operator","Junior - HR WC / Roller / Loader / Grader","Perth","A","2:2",0,SW_A,"2024-07-18"],
  ["ZOSEL, Edward","Eddie","Operator","Operator / Grader / Leading Hand","Perth","A","2:2",1,SW_B,"2024-10-02"],
  ["ROBERTS, Simone","","Operator","All Rounder / Watercart / Loader / Roller","Perth","A","2:2",1,SW_A,"2026-06-10"],
  ["PASSMORE, Gavin","","Operator","Junior - HR WC / Roller / Grader","Perth","A","2:2",1,SW_B,"2026-02-04"],
  ["JOZWICKI, Renee","","Operator","WC / Moxy / Roller","Perth","A","2:2",0,SW_A,"2026-03-04"],
  ["RADONICH, Colin","","Operator","All Rounder - Experienced","Perth","A","2:2",1,SW_B,"2026-07-14"],
  ["LACROIX, Carla","","Operator","HR WC / Roller / Loader / Grader","Perth","B","2:2",1,SW_A,"2024-07-24"],
  ["PARRY, Jordan","","Operator","HR WC / Roller / Grader","Busselton","B","2:2",1,SW_B,"2025-11-12"],
  ["COBBY, Layne","","Operator","Junior - HR WC / Roller","Perth","B","2:2",0,SW_A,"2025-04-30"],
  ["WOODLEY, Justin","","Operator","All Rounder / Grader","Perth","B","2:2",0,SW_B,"2025-11-12"],
  ["RIVE, Michael","Chucky","Operator","All Rounder / Watercart / Loader / Roller","Perth","B","2:2",0,SW_A,"2026-02-04"],
  ["SHEHADE, Victor","Vic","Operator","Operator - Leading Hand / Grader","Perth","A+B","2:1",1,"2026-07-01","2024-11-25"],
  ["VERVERIS, Alexandrou","Alex","Operator","WC / Loader / Grader","Perth","A+B","2:1",1,"2026-07-08","2026-03-03"],
  ["HARKIN, Dara","","Operator","Allrounder","Perth","A+B","2:1",1,"2026-07-15","2026-07-15"],
  ["CAIRD, Sarah","","Operator","WC / Roller / Exc / Posi / Tipper","Perth","C","2:2",1,SW_B,"2026-03-04"],
  ["FOGARTY, Troy","","Operator","Excavator / Posi / Loader / Grader / WC","Perth","C","2:2",0,SW_A,"2026-03-10"],
  ["SLOAN, David","Davo","Operator","All Rounder / Grader Experience","Perth","C","2:2",1,SW_B,"2026-03-10"],
];

const USERS = ["Jaki Soutar", "Kiteesha", "Kylie Turner", "Wes Clack", "Greg Jozwicki", "Donna Matiu", "Allan Butson"];
const ADMINS = ["Jaki Soutar", "Kiteesha", "Kylie Turner"];

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
const rangeDays = (from, to) => { const out = []; for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d); return out; };

/* ---------- PATTERN ENGINE ----------
   Each person holds a list of pattern segments. A segment runs
   from its start date until the next begins, so a roster change
   is entered once and rolls forward on its own.                */

function segmentFor(emp, iso) {
  const segs = (emp.patterns || []).filter((s) => s.from <= iso);
  if (!segs.length) return null;
  return segs.reduce((a, b) => (a.from > b.from ? a : b));
}

function patternCode(emp, iso) {
  if (emp.mobeDate && iso < emp.mobeDate) return null;
  if (emp.demobDate && iso > emp.demobDate) return null;
  const seg = segmentFor(emp, iso);
  if (!seg) return null;
  const p = PATTERNS[seg.pattern];
  if (!p || p.adhoc) return null;
  if (p.office) return dow(iso) === 0 || dow(iso) === 6 ? "RR" : "GTN";

  const n = diffDays(iso, seg.anchor);
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

/* ---------- ROSTER SENSE CHECKS ---------- */

function checkEmployee(emp, codeFor, dates) {
  const out = [];
  const seq = dates.map((iso) => ({ iso, code: codeFor(emp, iso) }));
  let openIn = null;
  let workSinceIn = 0;
  let strayWorkStart = null;
  let strayWorkEnd = null;
  let lastOut = null;

  const flag = (iso, msg, sev) => out.push({ empId: emp.id, name: emp.name, iso, msg, sev: sev || "warning" });

  const closeStray = () => {
    if (!strayWorkStart) return;
    const span = strayWorkStart === strayWorkEnd
      ? fmtShort(strayWorkStart)
      : `${fmtShort(strayWorkStart)} to ${fmtShort(strayWorkEnd)}`;
    flag(strayWorkStart,
      lastOut
        ? `Flies out ${fmtShort(lastOut)} but is still rostered on site ${span}. Either move the departure, or change those days.`
        : `Rostered on site ${span} with no inbound travel booked. Either add a travel-in beforehand, or change those days.`,
      "critical");
    strayWorkStart = null; strayWorkEnd = null;
  };

  seq.forEach(({ iso, code }, i) => {
    const dir = dirOf(code);
    const work = isWorkDay(code);

    if (dir === "IN") {
      if (openIn) flag(iso, `Travels in ${fmtShort(iso)} but is already on site since ${fmtShort(openIn)} — a departure is needed first.`, "critical");
      closeStray();
      openIn = iso; workSinceIn = 0;
      return;
    }

    if (dir === "OUT") {
      if (!openIn) {
        flag(iso, `Travels out ${fmtShort(iso)} with no inbound travel beforehand.`, "critical");
      } else if (workSinceIn === 0) {
        flag(openIn, `Travels in ${fmtShort(openIn)} and out ${fmtShort(iso)} with no rostered work days in between.`, "critical");
      }
      openIn = null; workSinceIn = 0; lastOut = iso;
      closeStray();
      return;
    }

    if (work) {
      if (openIn) workSinceIn++;
      else { if (!strayWorkStart) strayWorkStart = iso; strayWorkEnd = iso; }
    } else {
      closeStray();
    }

    if (openIn && code === "RR" && workSinceIn === 0 && i > 0 && dirOf(seq[i - 1].code) === "IN") {
      flag(iso, `R & R from ${fmtShort(iso)} immediately after travelling in on ${fmtShort(openIn)}.`, "warning");
    }
  });
  closeStray();

  if (openIn) {
    const last = seq[seq.length - 1];
    if (last && diffDays(last.iso, openIn) > 30)
      flag(openIn, `Flew in ${fmtShort(openIn)} with no departure booked in the next month.`, "warning");
  }
  return out;
}

/* ---------- UI ATOMS ---------- */

function Btn({ children, onClick, active, danger, small, disabled, primary }) {
  const filled = active || primary;
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: filled ? C.red : "transparent",
      color: disabled ? C.dimmer : filled ? "#FFF" : danger ? C.red : C.ink,
      border: `1px solid ${filled ? C.red : danger ? "#E3B6B2" : C.line2}`,
      padding: small ? "4px 9px" : "7px 14px", borderRadius: 2,
      cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1,
      fontFamily: disp, fontSize: small ? 12 : 13, letterSpacing: ".08em",
      textTransform: "uppercase", fontWeight: 600, whiteSpace: "nowrap",
    }}>{children}</button>
  );
}

function Tile({ label, value, sub, state, onClick }) {
  const col = state === "bad" ? C.bad : state === "warn" ? C.orange : state === "ok" ? C.ok : C.ink;
  return (
    <button onClick={onClick} style={{
      background: C.panel, border: `1px solid ${state === "bad" ? "#EBC6C3" : C.line}`,
      borderTop: `3px solid ${col}`, padding: "10px 12px 12px", textAlign: "left",
      cursor: onClick ? "pointer" : "default", minWidth: 0, borderRadius: 2, fontFamily: sans }}>
      <div style={{ fontFamily: disp, fontSize: 11.5, letterSpacing: ".14em", textTransform: "uppercase",
        color: C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
      <div style={{ fontFamily: mono, fontSize: 30, fontWeight: 600, color: col, lineHeight: 1.1, marginTop: 4 }}>{value}</div>
      <div style={{ fontFamily: mono, fontSize: 10.5, color: C.dimmer, marginTop: 2 }}>{sub}</div>
    </button>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 11 }}>
      <div style={{ fontFamily: disp, fontSize: 11.5, letterSpacing: ".12em", color: C.dim,
        textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

function Panel({ title, note, children, pad = 16 }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 2 }}>
      {title && (
        <div style={{ padding: "11px 16px", borderBottom: `1px solid ${C.line}`, display: "flex",
          alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontFamily: disp, fontSize: 15.5, letterSpacing: ".12em", textTransform: "uppercase" }}>{title}</span>
          {note && <span style={{ fontFamily: mono, fontSize: 10.5, color: C.dimmer }}>{note}</span>}
        </div>
      )}
      <div style={{ padding: pad }}>{children}</div>
    </div>
  );
}

function Chip({ code, small }) {
  const [bg, fg, br] = codeStyle(code);
  const st = travelState(code);
  return (
    <span style={{ background: bg, color: fg, border: `1px solid ${br}`,
      borderStyle: st === "requested" ? "dashed" : "solid",
      padding: small ? "1px 5px" : "2px 7px", fontFamily: mono, fontSize: small ? 10 : 11,
      whiteSpace: "nowrap", borderRadius: 2 }}>{codeText(code) || "—"}</span>
  );
}

function Stat({ label, n, bad }) {
  const col = n === 0 ? C.dimmer : bad ? C.red : C.orange;
  return (
    <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
      <span style={{ fontFamily: disp, fontSize: 11.5, letterSpacing: ".1em", color: C.dim,
        textTransform: "uppercase" }}>{label}</span>
      <span className={bad && n ? "pulse" : ""} style={{ fontFamily: mono, fontSize: 17, fontWeight: 600, color: col }}>{n}</span>
    </span>
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
        poh: r[4], crew: r[5],
        defaultShift: r[7] ? "NS" : "DS",
        patterns: [{ from: "2000-01-01", pattern: r[6], anchor: r[8] }],
        mobeDate: r[9], demobDate: "",
        grader: pos.includes("grader"), leadingHand: pos.includes("leading hand"),
        s26: r[2] === "Supervisor" || r[2] === "Project Manager",
      };
    });

  const [employees, setEmployees] = useState(buildEmployees);
  const [overrides, setOverrides] = useState({});
  const [leaveRecords, setLeaveRecords] = useState([]);
  const [travel, setTravel] = useState([]);
  const [requests, setRequests] = useState([]);
  const [actions, setActions] = useState([]);
  const [log, setLog] = useState([]);
  const [thresholds, setThresholds] = useState(Object.fromEntries(METRICS.map((m) => [m.id, m.min])));

  const [user, setUser] = useState("");
  const [view, setView] = useState("dash");
  const [focusDate, setFocusDate] = useState("2026-07-29");
  const [gridStart, setGridStart] = useState("2026-07-27");
  const [gridDays, setGridDays] = useState(28);
  const [cellW, setCellW] = useState(34);
  const [brush, setBrush] = useState("__select");
  const [painting, setPainting] = useState(false);
  const [menu, setMenu] = useState(null);
  const [crewFilter, setCrewFilter] = useState("All");
  const [catFilter, setCatFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState([]);
  const [sync, setSync] = useState({ state: "idle", at: null, by: null });
  const [confirm, setConfirm] = useState(null);

  const hydrated = useRef(false);
  const saveTimer = useRef(null);

  const snapshot = () => ({
    employees, overrides, leaveRecords, travel, requests, actions, log, thresholds,
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
        if (d.requests) setRequests(d.requests);
        if (d.actions) setActions(d.actions);
        if (d.log) setLog(d.log);
        if (d.thresholds) setThresholds(d.thresholds);
        setSync({ state: "ok", at: d.savedAt, by: d.savedBy });
      } else setSync({ state: "empty", at: null, by: null });
    } catch {
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
      } catch {
        setSync((s) => ({ ...s, state: "error" }));
      }
    }, 900);
    return () => clearTimeout(saveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees, overrides, leaveRecords, travel, requests, actions, thresholds]);

  const record = useCallback((entry) => {
    setLog((l) => [{ ...entry, at: nowStamp(), by: user || "unsigned" }, ...l].slice(0, 800));
  }, [user]);

  const notify = useCallback(async (subject, body, kind) => {
    const item = { id: "N" + Date.now() + Math.random(), subject, body, kind,
      at: nowStamp(), by: user || "unsigned", emailed: false };
    try {
      const res = await fetch("/api/notify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body, to: ADMINS }),
      });
      item.emailed = res.ok;
    } catch {
      item.emailed = false;
    }
    setActions((a) => [item, ...a].slice(0, 300));
  }, [user]);

  const codeFor = useCallback((emp, iso) => {
    const k = emp.id + "|" + iso;
    if (k in overrides) return overrides[k];
    return patternCode(emp, iso);
  }, [overrides]);

  const codeForRef = useRef(codeFor);
  useEffect(() => { codeForRef.current = codeFor; }, [codeFor]);

  const applyCell = useCallback((empId, iso, code, why) => {
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

  /* Checks a proposed change before it is written, and returns any
     new problems it would create near that date. */
  const problemsFromChange = useCallback((empId, iso, code) => {
    const emp = employees.find((e) => e.id === empId);
    if (!emp) return [];
    const now = codeForRef.current;
    const after = code === "__clear" ? patternCode(emp, iso) : code;
    const proposed = (e, d) => (e.id === empId && d === iso ? after : now(e, d));
    const win = (a) => Math.abs(diffDays(a.iso, iso)) <= 45;
    const beforeSet = new Set(checkEmployee(emp, now, DATES).filter(win).map((a) => a.iso + a.msg));
    return checkEmployee(emp, proposed, DATES).filter(win).filter((a) => !beforeSet.has(a.iso + a.msg));
  }, [employees]);

  /* Same check, for a set of proposed changes such as a travel request. */
  const problemsFromChanges = useCallback((empId, changes) => {
    const emp = employees.find((e) => e.id === empId);
    if (!emp || !changes.length) return [];
    const now = codeForRef.current;
    const map = {};
    changes.forEach((c) => {
      if (!c.date) return;
      map[c.date] = c.movement === "__cancel" ? "RR" : travelCode(c.movement, "requested");
    });
    const proposed = (e, d) => (e.id === empId && map[d] ? map[d] : now(e, d));
    const dates = Object.keys(map).sort();
    const near = (a) => dates.some((d) => Math.abs(diffDays(a.iso, d)) <= 45);
    const beforeSet = new Set(checkEmployee(emp, now, DATES).filter(near).map((a) => a.iso + a.msg));
    return checkEmployee(emp, proposed, DATES).filter(near).filter((a) => !beforeSet.has(a.iso + a.msg));
  }, [employees]);

  const setCell = useCallback((empId, iso, code, why, opts) => {
    if (opts && opts.validate) {
      const probs = problemsFromChange(empId, iso, code);
      if (probs.length) {
        setConfirm({ empId, iso, code, why, probs,
          emp: employees.find((e) => e.id === empId) });
        return;
      }
    }
    applyCell(empId, iso, code, why);
  }, [applyCell, problemsFromChange, employees]);

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

  const anomalies = useMemo(() => {
    const out = [];
    employees.forEach((e) => out.push(...checkEmployee(e, codeFor, DATES)));
    return out.sort((a, b) => (a.iso < b.iso ? -1 : 1));
  }, [employees, codeFor]);

  const toRequestCount = useMemo(() => {
    let n = 0;
    employees.forEach((e) => DATES.forEach((iso) => {
      if (travelState(codeFor(e, iso)) === "toRequest") n++;
    }));
    return n;
  }, [employees, codeFor]);

  const alerts = useMemo(() => {
    const out = [];
    daily.forEach((d) => {
      METRICS.forEach((m) => {
        const min = thresholds[m.id];
        if (min && d.counts[m.id] < min)
          out.push({ iso: d.iso, metric: m.id, name: m.name, have: d.counts[m.id], need: min,
            sev: d.counts[m.id] === 0 ? "critical" : "warning" });
      });
    });
    return out;
  }, [daily, thresholds]);

  const upcoming = useMemo(() => alerts.filter((a) => a.iso >= focusDate).slice(0, 250), [alerts, focusDate]);
  const upcomingAnomalies = useMemo(() => anomalies.filter((a) => a.iso >= focusDate).slice(0, 120), [anomalies, focusDate]);
  const pendingRequests = requests.filter((r) => r.status === "pending").length;

  useEffect(() => {
    const up = () => setPainting(false);
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  const jumpTo = (iso) => { setFocusDate(iso); setGridStart(addDays(iso, -3)); setView("grid"); };

  const addLeave = (rec) => {
    const emp = employees.find((e) => e.id === rec.empId);
    const days = rangeDays(rec.from, rec.to);
    const impacted = [];
    days.forEach((d) => {
      const c = codeFor(emp, d);
      if (movementOf(c)) impacted.push({ date: d, code: c });
    });
    const worked = days.filter((d) => isWorkDay(codeFor(emp, d))).length;

    setOverrides((o) => { const n = { ...o }; days.forEach((d) => (n[rec.empId + "|" + d] = rec.code)); return n; });
    const id = "L" + Date.now();
    setLeaveRecords((r) => [...r, { ...rec, id, by: user || "unsigned", at: nowStamp() }]);
    record({ kind: "leave", empId: rec.empId, name: emp ? emp.name : "?", date: `${rec.from} → ${rec.to}`,
      from: "roster", to: `${rec.code} (${days.length}d)`, why: rec.note || "leave entered" });

    if (impacted.length || worked) {
      const lines = impacted.length
        ? impacted.map((x) => `  ${fmtShort(x.date)} — ${x.code} (${CODES[x.code] ? CODES[x.code].label : ""})`).join("\n")
        : "  no travel currently booked inside the leave range";
      notify(
        `Travel change needed — ${emp ? emp.name : "?"} ${fmtShort(rec.from)} to ${fmtShort(rec.to)}`,
        `${emp ? emp.name : "?"} has been put on ${rec.code} from ${fmtLong(rec.from)} to ${fmtLong(rec.to)}.\n\n` +
        `Travel affected:\n${lines}\n\n` +
        `${worked} rostered work day(s) fall inside this leave.\n\n` +
        `Action: cancel or reschedule the flights above and review camp accommodation for those nights.`,
        "travel"
      );
    }
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

  const updateEmployee = (id, patch) => {
    const emp = employees.find((e) => e.id === id);
    setEmployees((es) => es.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    Object.keys(patch).forEach((k) => {
      if (k === "patterns") return;
      record({ kind: "person", empId: id, name: emp ? emp.name : "?", date: "—",
        from: `${k}: ${emp ? emp[k] : "?"}`, to: `${k}: ${patch[k]}`, why: "employee record" });
    });
  };

  const changePattern = (empId, from, pattern, anchor) => {
    const emp = employees.find((e) => e.id === empId);
    if (!emp) return;
    const prev = segmentFor(emp, addDays(from, -1));
    const segs = [...(emp.patterns || []).filter((s) => s.from !== from), { from, pattern, anchor }]
      .sort((a, b) => (a.from < b.from ? -1 : 1));
    setEmployees((es) => es.map((e) => (e.id === empId ? { ...e, patterns: segs } : e)));
    let kept = 0;
    setOverrides((o) => {
      const n = {};
      Object.keys(o).forEach((k) => {
        const bar = k.indexOf("|");
        const id = Number(k.slice(0, bar));
        const iso = k.slice(bar + 1);
        const code = o[k];
        const protectedCell = !!(CODES[code] && (CODES[code].leave || CODES[code].travelState === "confirmed"));
        if (id === empId && iso >= from && !protectedCell) return;
        if (id === empId && iso >= from && protectedCell) kept++;
        n[k] = o[k];
      });
      return n;
    });
    record({ kind: "pattern", empId, name: emp.name, date: from,
      from: prev ? prev.pattern : "—", to: `${pattern} (swing starts ${fmtShort(anchor)})`,
      why: kept ? `roster pattern changed — ${kept} approved leave/confirmed travel day(s) kept` : "roster pattern changed" });
  };

  const removePatternSegment = (empId, from) => {
    const emp = employees.find((e) => e.id === empId);
    if (!emp || (emp.patterns || []).length < 2) return;
    setEmployees((es) => es.map((e) => e.id === empId
      ? { ...e, patterns: e.patterns.filter((s) => s.from !== from) } : e));
    record({ kind: "pattern", empId, name: emp.name, date: from, from: "segment", to: "removed",
      why: "pattern change reversed" });
  };

  const submitRequest = (req) => {
    const emp = employees.find((e) => e.id === req.empId);
    const before = {};
    rangeDays(addDays(req.changes[0].date, -8), addDays(req.changes[req.changes.length - 1].date, 8))
      .forEach((d) => (before[d] = codeFor(emp, d)));
    const full = { ...req, id: "R" + Date.now(), status: "pending", by: user || "unsigned",
      at: nowStamp(), before, name: emp ? emp.name : "?",
      problems: problemsFromChanges(req.empId, req.changes).map((x) => ({ iso: x.iso, msg: x.msg })) };
    setRequests((r) => [full, ...r]);
    record({ kind: "request", empId: req.empId, name: emp ? emp.name : "?",
      date: req.changes.map((c) => c.date).join(", "), from: "current travel",
      to: req.changes.map((c) => c.movement).join(", "), why: req.reason || "travel change requested" });
    notify(
      `Travel change request — ${emp ? emp.name : "?"}`,
      `${user || "Site"} has requested a travel change for ${emp ? emp.name : "?"}.\n\n` +
      req.changes.map((c) => `  ${fmtLong(c.date)} — ${c.movement === "__cancel" ? "cancel travel" : c.movement}`).join("\n") +
      `\n\nReason: ${req.reason || "not given"}\n\nOpen the Requests tab for the before and after roster.`,
      "request"
    );
  };

  const markRequested = (reqId) => {
    const req = requests.find((r) => r.id === reqId);
    if (!req) return;
    req.changes.forEach((c) => {
      if (c.movement === "__cancel") setCell(req.empId, c.date, "RR", "travel cancelled on request");
      else setCell(req.empId, c.date, travelCode(c.movement, "requested"), "requested from travel team");
    });
    setRequests((rs) => rs.map((r) => r.id === reqId
      ? { ...r, status: "rescheduled", actionedBy: user || "unsigned", actionedAt: nowStamp() } : r));
  };

  const declineRequest = (reqId) => {
    setRequests((rs) => rs.map((r) => r.id === reqId
      ? { ...r, status: "declined", actionedBy: user || "unsigned", actionedAt: nowStamp() } : r));
  };

  const crews = ["All", ...Array.from(new Set(employees.map((e) => e.crew)))];
  const cats = ["All", ...Array.from(new Set(employees.map((e) => e.category)))];
  const visibleEmployees = employees.filter((e) => {
    if (picked.length) return picked.includes(e.id);
    if (crewFilter !== "All" && e.crew !== crewFilter) return false;
    if (catFilter !== "All" && e.category !== catFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!(e.name.toLowerCase().includes(q) || (e.alias || "").toLowerCase().includes(q)
        || e.position.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const tabs = [["dash","Dashboard"],["grid","Roster"],["leave","Leave"],["travel","Travel"],
    ["requests", pendingRequests ? `Requests (${pendingRequests})` : "Requests"],
    ["people","People"],["audit","Change log"]];

  return (
    <div style={{ background: C.page, color: C.ink, fontFamily: sans, minHeight: "100vh" }}
      onClick={() => setMenu(null)}>
      <style>{`
        * { box-sizing: border-box; }
        body { background: ${C.page}; }
        ::-webkit-scrollbar { height: 10px; width: 10px; }
        ::-webkit-scrollbar-track { background: #EFE9E4; }
        ::-webkit-scrollbar-thumb { background: ${C.line2}; border-radius: 5px; }
        .cell:hover { outline: 2px solid ${C.red}; outline-offset: -2px; z-index: 2; }
        select, input, textarea { background: #FFF; color: ${C.ink}; border: 1px solid ${C.line2};
          padding: 6px 8px; font-family: ${mono}; font-size: 12px; border-radius: 2px; }
        textarea { font-size: 12px; line-height: 1.55; }
        table { border-collapse: collapse; width: 100%; }
        @media (prefers-reduced-motion: no-preference) { .pulse { animation: p 2.4s ease-in-out infinite; } }
        @keyframes p { 0%,100% { opacity: 1 } 50% { opacity: .5 } }
      `}</style>

      <div style={{ borderBottom: `3px solid ${C.red}`, background: C.panel, padding: "10px 18px",
        display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <img src={LOGO} alt="Syncline Haulage" style={{ height: 54, width: "auto", display: "block" }} />
        <div style={{ borderLeft: `1px solid ${C.line}`, paddingLeft: 16 }}>
          <div style={{ fontFamily: disp, fontSize: 21, fontWeight: 700, letterSpacing: ".05em",
            lineHeight: 1, textTransform: "uppercase" }}>Roster Control</div>
          <div style={{ fontFamily: mono, fontSize: 10, color: C.dimmer, letterSpacing: ".1em", marginTop: 3 }}>
            ELIWANA / KARTAJIRRI VILLAGE · FMG
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, marginLeft: "auto", flexWrap: "wrap" }}>
          {tabs.map(([k, l]) => <Btn key={k} active={view === k} onClick={() => setView(k)}>{l}</Btn>)}
        </div>
      </div>

      <div style={{ padding: "8px 18px", borderBottom: `1px solid ${C.line}`, background: C.panel2,
        display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <span style={{ fontFamily: disp, fontSize: 12, letterSpacing: ".12em", color: C.dim }}>WORKING AS</span>
        <select value={user} onChange={(e) => setUser(e.target.value)}>
          <option value="">— select your name —</option>
          {USERS.map((u) => <option key={u}>{u}</option>)}
        </select>
        {!user && <span style={{ fontFamily: mono, fontSize: 11, color: C.red }}>
          Pick your name so changes are attributed.</span>}
        <div style={{ display: "flex", gap: 14, marginLeft: "auto", alignItems: "center", flexWrap: "wrap" }}>
          <Stat label="Coverage" n={upcoming.length} bad={upcoming.some((a) => a.sev === "critical")} />
          <Stat label="Roster checks" n={upcomingAnomalies.length} bad={upcomingAnomalies.some((a) => a.sev === "critical")} />
          <Stat label="Travel to request" n={toRequestCount} bad={false} />
          <Stat label="Requests" n={pendingRequests} bad={false} />
          <span style={{ fontFamily: mono, fontSize: 10.5, color: sync.state === "error" ? C.red : C.dimmer }}>
            {sync.state === "saving" ? "saving…"
              : sync.state === "loading" ? "loading…"
              : sync.state === "error" ? "save failed"
              : sync.at ? `${STORAGE_MODE === "local" ? "saved locally" : "shared"} ${fmtStamp(sync.at)}`
              : "nothing saved yet"}
          </span>
          <Btn small onClick={loadShared}>Refresh</Btn>
        </div>
      </div>

      <div style={{ padding: "10px 18px", borderBottom: `1px solid ${C.line}`, display: "flex",
        alignItems: "center", gap: 12, flexWrap: "wrap", background: C.panel }}>
        <Btn small onClick={() => setFocusDate(addDays(focusDate, -1))}>◀</Btn>
        <div style={{ fontFamily: disp, fontSize: 19, fontWeight: 600, minWidth: 205 }}>{fmtLong(focusDate)}</div>
        <Btn small onClick={() => setFocusDate(addDays(focusDate, 1))}>▶</Btn>
        <input type="date" value={focusDate} onChange={(e) => e.target.value && setFocusDate(e.target.value)} />
        <div style={{ flex: 1 }} />
        <div style={{ fontFamily: mono, fontSize: 11, color: C.dim }}>
          {employees.filter((e) => !e.demobDate || e.demobDate >= focusDate).length} mobilised · {today ? today.total : 0} on site
        </div>
      </div>

      <div style={{ padding: 18 }}>
        {view === "dash" && <Dashboard {...{ today, daily, dayIndex, focusDate, setFocusDate,
          thresholds, upcoming, upcomingAnomalies, jumpTo, toRequestCount, setView }} />}
        {view === "grid" && <Grid {...{ visibleEmployees, employees, gridStart, setGridStart, gridDays,
          setGridDays, cellW, setCellW, codeFor, setCell, brush, setBrush, painting, setPainting, daily, dayIndex,
          thresholds, crews, cats, crewFilter, setCrewFilter, catFilter, setCatFilter, search,
          setSearch, picked, setPicked, focusDate, setFocusDate, overrides, menu, setMenu, anomalies }} />}
        {view === "leave" && <Leave {...{ employees, leaveRecords, addLeave, removeLeave, focusDate }} />}
        {view === "travel" && <Travel {...{ employees, travel, setTravel, setCell, actions, user }} />}
        {view === "requests" && <Requests {...{ employees, requests, submitRequest, markRequested,
          declineRequest, codeFor, focusDate, problemsFromChanges }} />}
        {view === "people" && <People {...{ employees, updateEmployee, changePattern,
          removePatternSegment, thresholds, setThresholds, focusDate }} />}
        {view === "audit" && <Audit {...{ log }} />}
      </div>

      {confirm && (
        <div onClick={(e) => e.stopPropagation()} style={{ position: "fixed", inset: 0,
          background: "rgba(49,33,34,.45)", zIndex: 100, display: "flex",
          alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: C.panel, border: `1px solid ${C.line2}`, borderTop: `4px solid ${C.red}`,
            maxWidth: 560, width: "100%", boxShadow: "0 18px 50px rgba(49,33,34,.3)" }}>
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.line}` }}>
              <div style={{ fontFamily: disp, fontSize: 17, letterSpacing: ".1em", textTransform: "uppercase",
                color: C.red, fontWeight: 700 }}>This does not add up</div>
              <div style={{ fontFamily: mono, fontSize: 11, color: C.dim, marginTop: 3 }}>
                {confirm.emp ? confirm.emp.name : ""} · {fmtLong(confirm.iso)} ·{" "}
                {confirm.code === "__clear" ? "back to pattern" : confirm.code}
              </div>
            </div>
            <div style={{ padding: "14px 18px" }}>
              {confirm.probs.map((pr, i) => (
                <div key={i} style={{ display: "flex", gap: 9, marginBottom: 9 }}>
                  <span style={{ color: C.red, fontWeight: 700 }}>•</span>
                  <span style={{ fontSize: 13.5, lineHeight: 1.5 }}>{pr.msg}</span>
                </div>
              ))}
              <div style={{ fontFamily: mono, fontSize: 10.5, color: C.dim, marginTop: 10, lineHeight: 1.55 }}>
                Apply it anyway if you know it is right and will fix the rest — the flag stays on the
                roster until the sequence makes sense.
              </div>
            </div>
            <div style={{ padding: "12px 18px", borderTop: `1px solid ${C.line}`, display: "flex", gap: 10 }}>
              <Btn primary onClick={() => {
                applyCell(confirm.empId, confirm.iso, confirm.code, confirm.why);
                setConfirm(null);
              }}>Apply anyway</Btn>
              <Btn onClick={() => setConfirm(null)}>Cancel the change</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   DASHBOARD
   ============================================================ */

function Dashboard({ today, daily, dayIndex, focusDate, setFocusDate, thresholds, upcoming,
  upcomingAnomalies, jumpTo, toRequestCount, setView }) {
  const railStart = Math.max(0, (dayIndex[focusDate] || 0) - 7);
  const rail = daily.slice(railStart, railStart + 90);
  const maxOps = Math.max(12, ...rail.map((d) => d.counts.ops));

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(148px, 1fr))", gap: 10 }}>
        <Tile label="Total on site" value={today.total} sub="all categories" state="ok" />
        {METRICS.map((m) => {
          const have = today.counts[m.id], min = thresholds[m.id];
          const state = !min ? "" : have < min ? (have === 0 ? "bad" : "warn") : "ok";
          return <Tile key={m.id} label={m.name} value={have}
            sub={min ? `min ${min}${have < min ? ` · short ${min - have}` : ""}` : "no minimum"}
            state={state} onClick={() => jumpTo(focusDate)} />;
        })}
        <Tile label="Travel to request" value={toRequestCount} sub="not yet sent to travel team"
          state={toRequestCount ? "warn" : "ok"} onClick={() => setView("grid")} />
      </div>

      <Panel title="Manning rail — next 90 days"
        note={`operators on site vs minimum ${thresholds.ops} · click any day`}>
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
                  background: d.iso === focusDate ? "#F0E4DC" : "transparent" }}>
                {noSup && <div style={{ height: 4, background: C.red, marginBottom: 2 }} />}
                <div style={{ height: h, background: short ? C.red : dow(d.iso) % 6 === 0 ? "#C8B8AE" : C.orange }} />
                <div style={{ fontFamily: mono, fontSize: 7, color: C.dimmer, textAlign: "center", height: 9 }}>
                  {parse(d.iso).getUTCDate() === 1 ? MON[parse(d.iso).getUTCMonth()] : ""}</div>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 8, fontFamily: mono, fontSize: 10, color: C.dim }}>
          <span><span style={{ color: C.orange }}>█</span> at or above minimum</span>
          <span><span style={{ color: C.red }}>█</span> below {thresholds.ops} operators</span>
          <span><span style={{ color: C.red }}>▔</span> no Section 26 coverage</span>
        </div>
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 18 }}>
        <Panel title="Coverage alerts" note={`from ${fmtShort(focusDate)}`} pad={0}>
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {upcoming.length === 0 && <div style={{ padding: 18, color: C.dim, fontFamily: mono, fontSize: 12 }}>
              No coverage breaches in the horizon.</div>}
            {upcoming.map((a, i) => (
              <div key={i} onClick={() => jumpTo(a.iso)} style={{ display: "flex", alignItems: "center", gap: 12,
                padding: "8px 14px", borderBottom: `1px solid ${C.line}`, cursor: "pointer",
                borderLeft: `3px solid ${a.sev === "critical" ? C.red : C.orange}` }}>
                <div style={{ fontFamily: mono, fontSize: 11, color: C.dim, width: 88 }}>
                  {DOW[dow(a.iso)]} {fmtShort(a.iso)}</div>
                <div style={{ fontSize: 12.5, flex: 1 }}>{a.name}</div>
                <div style={{ fontFamily: mono, fontSize: 12, color: a.sev === "critical" ? C.red : C.dim }}>
                  {a.have} / {a.need}</div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Roster checks" note="sequences that don't add up" pad={0}>
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {upcomingAnomalies.length === 0 && <div style={{ padding: 18, color: C.dim, fontFamily: mono, fontSize: 12 }}>
              Nothing flagged. Every swing has travel in, work days, then travel out.</div>}
            {upcomingAnomalies.map((a, i) => (
              <div key={i} onClick={() => jumpTo(a.iso)} style={{ padding: "8px 14px",
                borderBottom: `1px solid ${C.line}`, cursor: "pointer",
                borderLeft: `3px solid ${a.sev === "critical" ? C.red : C.orange}` }}>
                <div style={{ fontSize: 12.5, fontWeight: 500 }}>{a.name}</div>
                <div style={{ fontSize: 12, color: C.dim, marginTop: 1 }}>{a.msg}</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

/* ============================================================
   ROSTER GRID
   ============================================================ */

function Grid({ visibleEmployees, employees, gridStart, setGridStart, gridDays, setGridDays, cellW,
  setCellW, codeFor,
  setCell, brush, setBrush, painting, setPainting, daily, dayIndex, thresholds, crews, cats,
  crewFilter, setCrewFilter, catFilter, setCatFilter, search, setSearch, picked, setPicked,
  focusDate, setFocusDate, overrides, menu, setMenu, anomalies }) {

  const [showPicker, setShowPicker] = useState(false);
  const NAMEW = 190;
  const CW = cellW;
  const gridDates = Array.from({ length: gridDays }, (_, i) => addDays(gridStart, i));
  const showText = CW >= 26;

  /* month bands, so you can always see which month and year you are in */
  const months = [];
  gridDates.forEach((iso) => {
    const key = iso.slice(0, 7);
    const last = months[months.length - 1];
    if (last && last.key === key) last.n++;
    else months.push({ key, n: 1,
      label: `${MON[parse(iso).getUTCMonth()]} ${parse(iso).getUTCFullYear()}` });
  });

  const anomalyMap = useMemo(() => {
    const m = {};
    anomalies.forEach((a) => (m[a.empId + "|" + a.iso] = a));
    return m;
  }, [anomalies]);

  const openMenu = (e, emp, iso) => {
    e.stopPropagation();
    setMenu({ x: Math.min(e.clientX, window.innerWidth - 260),
      y: Math.min(e.clientY, Math.max(60, window.innerHeight - 430)), emp, iso });
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Panel pad={12}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontFamily: disp, fontSize: 12, letterSpacing: ".12em", color: C.dim }}>FROM</span>
          <input type="date" value={gridStart} onChange={(e) => e.target.value && setGridStart(e.target.value)} />
          <span style={{ fontFamily: disp, fontSize: 12, letterSpacing: ".12em", color: C.dim }}>SHOW</span>
          <select value={gridDays} onChange={(e) => setGridDays(Number(e.target.value))}>
            <option value={14}>2 weeks</option>
            <option value={28}>4 weeks</option>
            <option value={42}>6 weeks</option>
            <option value={56}>8 weeks</option>
            <option value={84}>12 weeks</option>
            <option value={120}>17 weeks</option>
          </select>
          <Btn small onClick={() => setGridStart(addDays(gridStart, -gridDays))}>◀</Btn>
          <Btn small onClick={() => setGridStart(addDays(gridStart, gridDays))}>▶</Btn>
          <Btn small onClick={() => setGridStart(addDays(focusDate, -3))}>Today</Btn>
          <span style={{ fontFamily: disp, fontSize: 12, letterSpacing: ".12em", color: C.dim }}>SIZE</span>
          <select value={cellW} onChange={(e) => setCellW(Number(e.target.value))}>
            <option value={40}>Large</option>
            <option value={34}>Normal</option>
            <option value={26}>Small</option>
            <option value={16}>Tiny — colour only</option>
          </select>
          <span style={{ fontFamily: mono, fontSize: 11, color: C.dim }}>
            {fmtShort(gridDates[0])} – {fmtShort(gridDates[gridDays - 1])}</span>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 10,
          paddingTop: 10, borderTop: `1px solid ${C.line}` }}>
          <span style={{ fontFamily: disp, fontSize: 12, letterSpacing: ".12em", color: C.dim }}>FIND</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="name or position" style={{ width: 180 }} />
          <select value={crewFilter} onChange={(e) => setCrewFilter(e.target.value)}>
            {crews.map((c) => <option key={c} value={c}>{c === "All" ? "All crews" : "Crew " + c}</option>)}
          </select>
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
            {cats.map((c) => <option key={c} value={c}>{c === "All" ? "All roles" : c}</option>)}
          </select>
          <Btn small active={showPicker} onClick={() => setShowPicker(!showPicker)}>
            {picked.length ? `Pick people (${picked.length})` : "Pick people"}
          </Btn>
          {picked.length > 0 && <Btn small danger onClick={() => setPicked([])}>Clear selection</Btn>}
          <span style={{ fontFamily: mono, fontSize: 11, color: C.dim, marginLeft: "auto" }}>
            showing {visibleEmployees.length} of {employees.length}</span>
        </div>

        {showPicker && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.line}`,
            display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 4 }}>
            {employees.map((e) => (
              <label key={e.id} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12,
                cursor: "pointer", padding: "2px 0" }}>
                <input type="checkbox" checked={picked.includes(e.id)}
                  onChange={(ev) => setPicked((p) => ev.target.checked ? [...p, e.id] : p.filter((x) => x !== e.id))}
                  style={{ width: 14, height: 14, accentColor: C.red }} />
                {e.name}
              </label>
            ))}
          </div>
        )}
      </Panel>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontFamily: disp, fontSize: 12, letterSpacing: ".12em", color: C.dim }}>MODE</span>
        <select value={brush} onChange={(e) => setBrush(e.target.value)} style={{ minWidth: 250 }}>
          <option value="__select">Click a cell to choose</option>
          <option value="__clear">Paint: back to pattern</option>
          {Object.keys(CODES).map((c) => <option key={c} value={c}>Paint: {c} · {CODES[c].label}</option>)}
        </select>
        {brush !== "__select" && <>
          <Chip code={brush === "__clear" ? "" : brush} />
          <span style={{ fontFamily: mono, fontSize: 10.5, color: C.red }}>drag across cells to paint</span>
        </>}
        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontFamily: disp, fontSize: 11.5, letterSpacing: ".12em", color: C.dim }}>TRAVEL</span>
          {[["FIA", "to request"], ["FIA-TBC", "requested"], ["C-FIA", "confirmed"]].map(([c, l]) => (
            <span key={c} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <Chip code={c} small />
              <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>{l}</span>
            </span>
          ))}
        </div>
      </div>

      <div style={{ overflowX: "auto", border: `1px solid ${C.line}`, background: C.panel, borderRadius: 2 }}
        onMouseLeave={() => setPainting(false)}>
        <div style={{ minWidth: NAMEW + gridDays * CW }}>

          <div style={{ display: "flex", position: "sticky", top: 0, zIndex: 4, background: C.panel2 }}>
            <div style={{ width: NAMEW, flex: `0 0 ${NAMEW}px`, borderRight: `1px solid ${C.line2}`,
              borderBottom: `1px solid ${C.line}`, padding: "3px 8px", fontFamily: disp, fontSize: 11.5,
              letterSpacing: ".12em", color: C.dim }}>MONTH</div>
            {months.map((m) => (
              <div key={m.key} style={{ width: m.n * CW, flex: `0 0 ${m.n * CW}px`,
                borderRight: `1px solid ${C.line2}`, borderBottom: `1px solid ${C.line}`,
                padding: "3px 6px", fontFamily: disp, fontSize: 12.5, fontWeight: 600,
                letterSpacing: ".1em", textTransform: "uppercase", color: C.red,
                background: "#F3EEEA", whiteSpace: "nowrap", overflow: "hidden" }}>
                {m.n * CW >= 62 ? m.label : m.label.slice(0, 3)}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", position: "sticky", top: 22, zIndex: 3, background: C.panel2 }}>
            <div style={{ width: NAMEW, flex: `0 0 ${NAMEW}px`, borderRight: `1px solid ${C.line2}`,
              borderBottom: `1px solid ${C.line2}`, padding: "6px 8px", fontFamily: disp, fontSize: 11.5,
              letterSpacing: ".12em", color: C.dim }}>EMPLOYEE / CREW / PATTERN</div>
            {gridDates.map((iso) => {
              const d = daily[dayIndex[iso]];
              const short = d && d.counts.ops < thresholds.ops;
              const wknd = dow(iso) === 0 || dow(iso) === 6;
              const first = parse(iso).getUTCDate() === 1;
              return (
                <div key={iso} onClick={() => setFocusDate(iso)} style={{ width: CW, flex: `0 0 ${CW}px`,
                  textAlign: "center", cursor: "pointer",
                  borderRight: `1px solid ${first ? C.line2 : C.line}`,
                  borderBottom: `1px solid ${C.line2}`, padding: "3px 0",
                  background: iso === focusDate ? "#F5E3DA" : wknd ? "#F3EEEA" : "transparent" }}>
                  {CW >= 16 && <div style={{ fontFamily: mono, fontSize: 8.5, color: C.dimmer }}>{DOW[dow(iso)][0]}</div>}
                  <div style={{ fontFamily: mono, fontSize: CW >= 26 ? 12 : 9.5 }}>{parse(iso).getUTCDate()}</div>
                  {CW >= 22 && <div style={{ fontFamily: mono, fontSize: 8, color: C.dimmer }}>
                    {MON[parse(iso).getUTCMonth()]}</div>}
                  <div style={{ fontFamily: mono, fontSize: CW >= 26 ? 11 : 9, fontWeight: 600,
                    color: short ? C.red : C.ok }}>{d ? d.counts.ops : "-"}</div>
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", background: "#F3EEEA" }}>
            <div style={{ width: NAMEW, flex: `0 0 ${NAMEW}px`, borderRight: `1px solid ${C.line2}`,
              padding: "2px 8px", fontFamily: mono, fontSize: 10, color: C.dim }}>S26 · NS · GRD</div>
            {gridDates.map((iso) => {
              const d = daily[dayIndex[iso]];
              return (
                <div key={iso} style={{ width: CW, flex: `0 0 ${CW}px`, textAlign: "center",
                  borderRight: `1px solid ${C.line}`, padding: "2px 0", fontFamily: mono,
                  fontSize: CW >= 26 ? 9 : 7.5, whiteSpace: "nowrap" }}>
                  {d ? <>
                    <span style={{ color: d.counts.s26 < thresholds.s26 ? C.red : C.dimmer }}>{d.counts.s26}</span>
                    <span style={{ color: C.line2 }}>·</span>
                    <span style={{ color: d.counts.ns < thresholds.ns ? C.red : C.dimmer }}>{d.counts.ns}</span>
                    <span style={{ color: C.line2 }}>·</span>
                    <span style={{ color: d.counts.grader < thresholds.grader ? C.red : C.dimmer }}>{d.counts.grader}</span>
                  </> : ""}
                </div>
              );
            })}
          </div>

          {visibleEmployees.map((emp, ri) => {
            const seg = segmentFor(emp, focusDate);
            return (
              <div key={emp.id} style={{ display: "flex", borderTop: `1px solid ${C.line}`,
                background: ri % 2 ? "#FBF9F7" : C.panel }}>
                <div style={{ width: NAMEW, flex: `0 0 ${NAMEW}px`, borderRight: `1px solid ${C.line2}`,
                  padding: "4px 8px", overflow: "hidden" }}>
                  <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden",
                    textOverflow: "ellipsis" }}>
                    {emp.name}{emp.s26 && <span style={{ color: C.orange, fontSize: 10, marginLeft: 4 }}>§26</span>}
                  </div>
                  <div style={{ fontFamily: mono, fontSize: 9.5, color: C.dimmer, whiteSpace: "nowrap" }}>
                    {emp.crew} · {seg ? seg.pattern : "—"} · {emp.defaultShift}
                    {emp.grader && " · GRD"}{emp.leadingHand && " · LH"}
                  </div>
                </div>
                {gridDates.map((iso) => {
                  const preMobe = emp.mobeDate && iso < emp.mobeDate;
                  const postDemob = emp.demobDate && iso > emp.demobDate;
                  const code = codeFor(emp, iso);
                  const [bg, fg, br] = codeStyle(code);
                  const isOverride = (emp.id + "|" + iso) in overrides;
                  const st = travelState(code);
                  const anom = anomalyMap[emp.id + "|" + iso];
                  return (
                    <div key={iso} className="cell"
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => {
                        if (brush === "__select") { openMenu(e, emp, iso); return; }
                        setPainting(true); setCell(emp.id, iso, brush);
                      }}
                      onMouseEnter={() => { if (painting && brush !== "__select") setCell(emp.id, iso, brush); }}
                      title={`${emp.name} · ${fmtLong(iso)} · ${preMobe ? "not yet mobilised"
                        : postDemob ? "demobilised"
                        : code ? (CODES[code] ? CODES[code].label : code) : "not rostered"}${anom ? " — " + anom.msg : ""}`}
                      style={{ width: CW, flex: `0 0 ${CW}px`, height: 30, color: fg,
                        background: preMobe || postDemob
                          ? "repeating-linear-gradient(45deg, #F3EEEA, #F3EEEA 3px, #E5DED8 3px, #E5DED8 6px)" : bg,
                        borderRight: `1px solid ${C.line}`, display: "flex", alignItems: "center",
                        justifyContent: "center", fontFamily: mono, fontSize: CW >= 32 ? 9 : 7.5,
                        cursor: "cell", userSelect: "none", position: "relative",
                        boxShadow: st && st !== "confirmed" ? `inset 0 0 0 2px ${br}` : "none" }}>
                      {preMobe || postDemob ? "" : showText ? codeText(code) : ""}
                      {isOverride && !preMobe && !postDemob && (
                        <div style={{ position: "absolute", top: 1, right: 1, width: 4, height: 4,
                          background: C.red, borderRadius: "50%" }} />
                      )}
                      {anom && <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 4,
                        background: C.red }} />}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ fontFamily: mono, fontSize: 10.5, color: C.dim, lineHeight: 1.6 }}>
        Plain blue = day shift. Red dot = manual change over the pattern. Hatched = outside mobilisation
        dates. Red bar along the bottom of a cell = the roster checks have flagged that day.
      </div>

      {menu && (
        <div onClick={(e) => e.stopPropagation()} style={{ position: "fixed", left: menu.x, top: menu.y,
          background: C.panel, border: `1px solid ${C.line2}`, zIndex: 50, minWidth: 248,
          boxShadow: "0 10px 30px rgba(49,33,34,.22)", maxHeight: 430, overflowY: "auto", borderRadius: 2 }}>
          <div style={{ padding: "8px 10px", borderBottom: `1px solid ${C.line}`, fontFamily: mono,
            fontSize: 10.5, color: C.dim, background: C.panel2 }}>
            {menu.emp.name}<br />{fmtLong(menu.iso)}
          </div>
          {[["1", "Day shift"], ["NS", "Night shift"], ["RR", "R & R"], ["AL", "Annual leave"],
            ["SL", "Sick leave"], ["TR", "Training"]].map(([code, label]) => (
            <MenuItem key={code} code={code} label={label}
              onClick={() => { setCell(menu.emp.id, menu.iso, code, "roster edit", { validate: true }); setMenu(null); }} />
          ))}
          <div style={{ padding: "6px 10px", fontFamily: disp, fontSize: 11.5, letterSpacing: ".12em",
            color: C.dim, background: C.panel2, borderTop: `1px solid ${C.line}` }}>
            TRAVEL — to request / TBC / confirmed
          </div>
          {["FIA", "FIP", "FOA", "FOP"].map((mv) => (
            <div key={mv} style={{ display: "flex", alignItems: "center", borderBottom: `1px solid ${C.line}` }}>
              <div style={{ width: 42, padding: "6px 8px", fontFamily: mono, fontSize: 11, color: C.dim }}>{mv}</div>
              {["toRequest", "requested", "confirmed"].map((st) => {
                const code = travelCode(mv, st);
                const [bg, fg, br] = codeStyle(code);
                return (
                  <div key={st} onClick={() => { setCell(menu.emp.id, menu.iso, code, "travel edit", { validate: true }); setMenu(null); }}
                    title={CODES[code].label}
                    style={{ flex: 1, padding: "5px 4px", cursor: "pointer", textAlign: "center",
                      fontFamily: mono, fontSize: 9, background: bg, color: fg,
                      border: `1px solid ${br}`, borderStyle: st === "requested" ? "dashed" : "solid",
                      margin: 2 }}>
                    {st === "toRequest" ? "req" : st === "requested" ? "TBC" : "C-"}
                  </div>
                );
              })}
            </div>
          ))}
          <MenuItem code="__clear" label="Back to pattern"
            onClick={() => { setCell(menu.emp.id, menu.iso, "__clear", "back to pattern", { validate: true }); setMenu(null); }} />
        </div>
      )}
    </div>
  );
}

function MenuItem({ code, label, onClick }) {
  const [bg, , br] = codeStyle(code === "__clear" ? "" : code);
  return (
    <div onClick={onClick} style={{ padding: "7px 10px", cursor: "pointer", fontSize: 12.5,
      display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${C.line}` }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#F5EFEB")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
      <span style={{ width: 13, height: 13, border: `1px solid ${br}`, background: bg }} />
      {label}
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
  const th = { textAlign: "left", padding: "7px 10px", fontFamily: disp, fontSize: 11.5,
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
        {err && <div style={{ color: C.red, fontFamily: mono, fontSize: 11, marginBottom: 8 }}>{err}</div>}
        <Btn primary onClick={submit}>Add leave</Btn>
        <div style={{ fontFamily: mono, fontSize: 10.5, color: C.dim, marginTop: 12, lineHeight: 1.55 }}>
          If the leave covers days with travel booked or rostered work, a travel action is raised listing
          exactly which flights need cancelling or moving. It appears on the Travel tab.
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
              {sorted.length === 0 && <tr><td style={{ ...td, color: C.dim, fontFamily: mono }} colSpan={8}>
                No leave recorded.</td></tr>}
              {sorted.map((r) => {
                const emp = employees.find((e) => e.id === r.empId);
                return (
                  <tr key={r.id}>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{emp ? emp.name : "?"}</td>
                    <td style={td}><Chip code={r.code} /></td>
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
   TRAVEL
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

function movementFrom(m) {
  const dir = (m.direction || "").toUpperCase() === "OUT" ? "O" : "I";
  const period = (m.period || "").toUpperCase() === "PM" ? "P" : "A";
  const mode = (m.mode || "").toUpperCase() === "DRIVE" ? "D" : "F";
  const mv = `${mode}${dir}${period}`;
  return MOVEMENTS[mv] ? mv : dir === "I" ? "FIA" : "FOP";
}

function Travel({ employees, travel, setTravel, setCell, actions, user }) {
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
        r.onerror = () => rej(new Error("read failed"));
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
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pdf ? { pdf } : { text }),
      });
      let data = null;
      try { data = await resp.json(); } catch { data = null; }
      if (!data) {
        setErr("The travel reader did not respond. It is probably not switched on yet — an API key needs adding in Netlify. Manual entry below still works.");
        setBusy(false); return;
      }
      if (!resp.ok) { setErr(data.error || "Could not read that message."); setBusy(false); return; }
      const parsed = data.movements;
      if (!Array.isArray(parsed) || parsed.length === 0) {
        setErr("No travel movements found in that message."); setBusy(false); return;
      }
      setRows(parsed.map((m, i) => {
        const emp = matchEmployee(m.name, employees);
        return { key: i, raw: m.name, empId: emp ? emp.id : "", date: m.date || "",
          movement: movementFrom(m), state: m.confirmed === false ? "requested" : "confirmed",
          flight: m.flight || "", use: !!emp };
      }));
    } catch {
      setErr("Could not reach the travel reader. Check the site is online, or use manual entry.");
    }
    setBusy(false);
  };

  const applyRows = () => {
    rows.filter((r) => r.use && r.empId && r.date).forEach((r) => {
      const emp = employees.find((e) => e.id === Number(r.empId));
      const code = travelCode(r.movement, r.state);
      setCell(Number(r.empId), r.date, code, `FMG travel${r.flight ? " " + r.flight : ""}`);
      setTravel((t) => [...t, { id: Date.now() + Math.random(), empId: Number(r.empId),
        name: emp ? emp.name : r.raw, date: r.date, code, flight: r.flight,
        source: fileName || "pasted email", by: user || "unsigned" }]);
    });
    setRows([]); setText(""); setPdf(null); setFileName("");
  };

  const th = { textAlign: "left", padding: "6px 8px", fontFamily: disp, fontSize: 11.5,
    letterSpacing: ".1em", color: C.dim, textTransform: "uppercase", borderBottom: `1px solid ${C.line2}` };
  const td = { padding: "5px 8px", borderBottom: `1px solid ${C.line}`, fontSize: 12 };
  const travelActions = actions.filter((a) => a.kind === "travel");

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {travelActions.length > 0 && (
        <Panel title="Travel actions required" note="raised by leave entries" pad={0}>
          {travelActions.slice(0, 12).map((a) => (
            <div key={a.id} style={{ padding: "10px 16px", borderBottom: `1px solid ${C.line}`,
              borderLeft: `3px solid ${C.orange}` }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{a.subject}</div>
              <pre style={{ margin: "5px 0 0", fontFamily: mono, fontSize: 11, color: C.dim,
                whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{a.body}</pre>
              <div style={{ fontFamily: mono, fontSize: 10, color: C.dimmer, marginTop: 5 }}>
                {fmtStamp(a.at)} · {a.by} · {a.emailed ? "emailed" : "not emailed — email not configured"}
              </div>
            </div>
          ))}
        </Panel>
      )}

      <Panel title="Read a travel email from FMG" note="paste the email, or attach the PDF they send">
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "start" }}>
          <textarea rows={7} value={text} onChange={(e) => { setText(e.target.value); setPdf(null); }}
            placeholder="Paste the travel confirmation email here…" style={{ width: "100%" }} />
          <div style={{ display: "grid", gap: 8 }}>
            <label>
              <input type="file" accept=".pdf,.txt,.eml,.msg,text/*" onChange={onFile} style={{ display: "none" }} />
              <span style={{ display: "inline-block", border: `1px solid ${C.line2}`, padding: "7px 14px",
                fontFamily: disp, fontSize: 13, letterSpacing: ".08em", textTransform: "uppercase",
                fontWeight: 600, cursor: "pointer" }}>Attach file</span>
            </label>
            <Btn primary onClick={readEmail} disabled={busy}>{busy ? "Reading…" : "Read travel"}</Btn>
            {fileName && <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>{fileName}</span>}
          </div>
        </div>
        {err && <div style={{ color: C.red, fontFamily: mono, fontSize: 11.5, marginTop: 10, lineHeight: 1.5 }}>{err}</div>}
        <div style={{ fontFamily: mono, fontSize: 10.5, color: C.dim, marginTop: 10 }}>
          Confirmed movements come back as C- codes. Nothing is written until you check the lines and apply.
        </div>
      </Panel>

      {rows.length > 0 && (
        <Panel title="Check before applying" note={`${rows.filter((r) => r.use).length} of ${rows.length} selected`} pad={0}>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr>
                <th style={th}>Apply</th><th style={th}>Name in email</th><th style={th}>Matched to</th>
                <th style={th}>Date</th><th style={th}>Movement</th><th style={th}>Status</th>
                <th style={th}>Code</th><th style={th}>Flight</th>
              </tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.key} style={{ background: r.empId ? "transparent" : "#FCEAE7" }}>
                    <td style={td}>
                      <input type="checkbox" checked={r.use} disabled={!r.empId}
                        onChange={(e) => setRows((rs) => rs.map((x, j) => j === i ? { ...x, use: e.target.checked } : x))}
                        style={{ width: 15, height: 15, accentColor: C.red }} />
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
                      <select value={r.movement}
                        onChange={(e) => setRows((rs) => rs.map((x, j) => j === i ? { ...x, movement: e.target.value } : x))}>
                        {Object.keys(MOVEMENTS).map((mv) => <option key={mv} value={mv}>{mv}</option>)}
                      </select>
                    </td>
                    <td style={td}>
                      <select value={r.state}
                        onChange={(e) => setRows((rs) => rs.map((x, j) => j === i ? { ...x, state: e.target.value } : x))}>
                        <option value="confirmed">Confirmed</option>
                        <option value="requested">Requested (TBC)</option>
                        <option value="toRequest">Still to request</option>
                      </select>
                    </td>
                    <td style={td}><Chip code={travelCode(r.movement, r.state)} /></td>
                    <td style={{ ...td, fontFamily: mono, fontSize: 11, color: C.dim }}>{r.flight || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: 12, display: "flex", gap: 10 }}>
            <Btn primary onClick={applyRows} disabled={!rows.some((r) => r.use && r.empId)}>Apply to roster</Btn>
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
            <Chip code={t.code} />
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
  const [mv, setMv] = useState("FIA");
  const [state, setState] = useState("confirmed");
  const [flight, setFlight] = useState("");

  const apply = () => {
    const emp = employees.find((e) => e.id === Number(empId));
    const code = travelCode(mv, state);
    setCell(Number(empId), date, code, "manual travel entry", { validate: true });
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
          <select value={mv} onChange={(e) => setMv(e.target.value)} style={{ width: "100%" }}>
            {Object.keys(MOVEMENTS).map((m) => <option key={m} value={m}>{m} · {MOVEMENTS[m].label}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select value={state} onChange={(e) => setState(e.target.value)} style={{ width: "100%" }}>
            <option value="toRequest">Still to request</option>
            <option value="requested">Requested — TBC</option>
            <option value="confirmed">Confirmed</option>
          </select>
        </Field>
        <Field label="Flight"><input value={flight} onChange={(e) => setFlight(e.target.value)} style={{ width: "100%" }} /></Field>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Btn primary onClick={apply}>Apply</Btn>
        <Chip code={travelCode(mv, state)} />
      </div>
    </Panel>
  );
}

/* ============================================================
   TRAVEL CHANGE REQUESTS
   ============================================================ */

function Requests({ employees, requests, submitRequest, markRequested, declineRequest, codeFor,
  focusDate, problemsFromChanges }) {
  const [empId, setEmpId] = useState(employees[6] ? employees[6].id : 1);
  const [reason, setReason] = useState("");
  const [changes, setChanges] = useState([{ date: focusDate, movement: "FOP" }]);

  const emp = employees.find((e) => e.id === Number(empId));
  const setChange = (i, patch) => setChanges((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const problems = useMemo(
    () => problemsFromChanges(Number(empId), changes.filter((c) => c.date)),
    [empId, changes, problemsFromChanges]
  );

  const submit = () => {
    const clean = changes.filter((c) => c.date).sort((a, b) => (a.date < b.date ? -1 : 1));
    if (!clean.length) return;
    submitRequest({ empId: Number(empId), reason, changes: clean });
    setReason(""); setChanges([{ date: focusDate, movement: "FOP" }]);
  };

  const pending = requests.filter((r) => r.status === "pending");
  const done = requests.filter((r) => r.status !== "pending");

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 400px) 1fr", gap: 18 }}>
        <Panel title="Request a travel change" note="site crew">
          <Field label="Employee">
            <select value={empId} onChange={(e) => setEmpId(e.target.value)} style={{ width: "100%" }}>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
          <Field label="Changes requested">
            {changes.map((c, i) => (
              <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <input type="date" value={c.date} onChange={(e) => setChange(i, { date: e.target.value })}
                  style={{ flex: 1 }} />
                <select value={c.movement} onChange={(e) => setChange(i, { movement: e.target.value })}>
                  {Object.keys(MOVEMENTS).map((m) => <option key={m} value={m}>{m}</option>)}
                  <option value="__cancel">cancel travel</option>
                </select>
                {changes.length > 1 && (
                  <Btn small danger onClick={() => setChanges((cs) => cs.filter((_, j) => j !== i))}>×</Btn>
                )}
              </div>
            ))}
            <Btn small onClick={() => setChanges((cs) => [...cs, { date: focusDate, movement: "FIA" }])}>
              Add another day
            </Btn>
          </Field>
          <Field label="Reason">
            <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="why the change is needed" style={{ width: "100%" }} />
          </Field>
          {problems.length > 0 && (
            <div style={{ border: `1px solid ${C.red}`, background: "#FCEAE7", padding: "10px 12px",
              marginBottom: 12 }}>
              <div style={{ fontFamily: disp, fontSize: 12.5, letterSpacing: ".1em", color: C.red,
                textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>
                This does not add up
              </div>
              {problems.map((pr, i) => (
                <div key={i} style={{ fontSize: 12.5, color: C.ink, marginBottom: 4 }}>• {pr.msg}</div>
              ))}
              <div style={{ fontFamily: mono, fontSize: 10.5, color: C.dim, marginTop: 6 }}>
                You can still send it — the administrator will see the same warning.
              </div>
            </div>
          )}
          <Btn primary onClick={submit}>
            {problems.length ? "Send anyway" : "Send request"}
          </Btn>
          <div style={{ fontFamily: mono, fontSize: 10.5, color: C.dim, marginTop: 12, lineHeight: 1.55 }}>
            The request records who asked, when, and why. The administrator sees the roster before and
            after, then marks it once it has gone to the travel team — which puts TBC on the roster.
          </div>
        </Panel>

        <Panel title="Roster as it stands" note={emp ? emp.name : ""}>
          {emp && <StripCells cells={Array.from({ length: 21 }, (_, i) => addDays(focusDate, i - 3))
            .map((d) => ({ iso: d, code: codeFor(emp, d) }))} />}
        </Panel>
      </div>

      <Panel title="Pending requests" note={`${pending.length} waiting`} pad={0}>
        {pending.length === 0 && <div style={{ padding: 18, fontFamily: mono, fontSize: 12, color: C.dim }}>
          Nothing waiting.</div>}
        {pending.map((r) => {
          const first = r.changes[0].date;
          const overlay = Object.fromEntries(r.changes.map((c) =>
            [c.date, c.movement === "__cancel" ? "RR" : travelCode(c.movement, "requested")]));
          const window16 = Array.from({ length: 16 }, (_, i) => addDays(first, i - 5));
          return (
            <div key={r.id} style={{ padding: "12px 16px", borderBottom: `1px solid ${C.line}`,
              borderLeft: `3px solid ${C.orange}` }}>
              <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{r.name}</div>
                <div style={{ fontFamily: mono, fontSize: 10.5, color: C.dim }}>
                  requested by {r.by} · {fmtStamp(r.at)}</div>
              </div>
              {r.reason && <div style={{ fontSize: 12.5, color: C.dim, marginTop: 3 }}>{r.reason}</div>}
              {(r.problems || []).length > 0 && (
                <div style={{ border: `1px solid ${C.red}`, background: "#FCEAE7", padding: "8px 10px",
                  marginTop: 8 }}>
                  {r.problems.map((pr, i) => (
                    <div key={i} style={{ fontSize: 12.5, color: C.red }}>• {pr.msg}</div>
                  ))}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))",
                gap: 14, marginTop: 10 }}>
                <div>
                  <div style={{ fontFamily: disp, fontSize: 11.5, letterSpacing: ".12em", color: C.dim,
                    textTransform: "uppercase", marginBottom: 4 }}>Before</div>
                  <StripCells cells={window16.map((d) => ({ iso: d, code: r.before[d] || null }))} />
                </div>
                <div>
                  <div style={{ fontFamily: disp, fontSize: 11.5, letterSpacing: ".12em", color: C.dim,
                    textTransform: "uppercase", marginBottom: 4 }}>After, if approved</div>
                  <StripCells cells={window16.map((d) => ({ iso: d,
                    code: overlay[d] || r.before[d] || null, changed: !!overlay[d] }))} />
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <Btn primary onClick={() => markRequested(r.id)}>Mark as requested with travel team</Btn>
                <Btn danger onClick={() => declineRequest(r.id)}>Decline</Btn>
              </div>
            </div>
          );
        })}
      </Panel>

      {done.length > 0 && (
        <Panel title="Actioned" pad={0}>
          {done.map((r) => (
            <div key={r.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "8px 16px",
              borderBottom: `1px solid ${C.line}` }}>
              <div style={{ fontFamily: mono, fontSize: 10.5, color: C.dim, width: 92 }}>{fmtStamp(r.at)}</div>
              <div style={{ fontSize: 12.5, flex: 1 }}>{r.name}</div>
              <div style={{ fontFamily: mono, fontSize: 11, color: r.status === "declined" ? C.red : C.ok }}>
                {r.status}</div>
              <div style={{ fontFamily: mono, fontSize: 10.5, color: C.dim, width: 110 }}>{r.actionedBy}</div>
            </div>
          ))}
        </Panel>
      )}
    </div>
  );
}

function StripCells({ cells }) {
  return (
    <div style={{ display: "flex", gap: 1, overflowX: "auto" }}>
      {cells.map((c) => {
        const [bg, fg, br] = codeStyle(c.code);
        const st = travelState(c.code);
        return (
          <div key={c.iso} title={`${fmtLong(c.iso)} — ${c.code ? (CODES[c.code] ? CODES[c.code].label : c.code) : "not rostered"}`}
            style={{ flex: "0 0 34px", textAlign: "center" }}>
            <div style={{ fontFamily: mono, fontSize: 8.5, color: C.dimmer }}>{DOW[dow(c.iso)][0]}</div>
            <div style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>{parse(c.iso).getUTCDate()}</div>
            <div style={{ height: 26, background: bg, color: fg, border: `1px solid ${br}`,
              borderStyle: st === "requested" ? "dashed" : "solid",
              outline: c.changed ? `2px solid ${C.red}` : "none", outlineOffset: -1,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: mono, fontSize: 8 }}>
              {codeText(c.code)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   PEOPLE
   ============================================================ */

function People({ employees, updateEmployee, changePattern, removePatternSegment, thresholds,
  setThresholds, focusDate }) {
  const [pEmp, setPEmp] = useState(employees[6] ? employees[6].id : 1);
  const [pPattern, setPPattern] = useState("2:1");
  const [pFrom, setPFrom] = useState(focusDate);
  const [pAnchor, setPAnchor] = useState(focusDate);

  const emp = employees.find((e) => e.id === Number(pEmp));

  const th = { textAlign: "left", padding: "7px 8px", fontFamily: disp, fontSize: 11.5,
    letterSpacing: ".12em", color: C.dim, textTransform: "uppercase",
    borderBottom: `1px solid ${C.line2}`, whiteSpace: "nowrap" };
  const td = { padding: "5px 8px", borderBottom: `1px solid ${C.line}`, fontSize: 12.5 };

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 420px) 1fr", gap: 18 }}>
        <Panel title="Change a roster pattern" note="from a date, rolls forward">
          <Field label="Employee">
            <select value={pEmp} onChange={(e) => setPEmp(e.target.value)} style={{ width: "100%" }}>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
          <Field label="New pattern">
            <select value={pPattern} onChange={(e) => setPPattern(e.target.value)} style={{ width: "100%" }}>
              {Object.keys(PATTERNS).map((p) => <option key={p} value={p}>{p} · {PATTERNS[p].label}</option>)}
            </select>
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Effective from">
              <input type="date" value={pFrom}
                onChange={(e) => { setPFrom(e.target.value); setPAnchor(e.target.value); }}
                style={{ width: "100%" }} />
            </Field>
            <Field label="First swing starts">
              <input type="date" value={pAnchor} onChange={(e) => setPAnchor(e.target.value)} style={{ width: "100%" }} />
            </Field>
          </div>
          <Btn primary onClick={() => changePattern(Number(pEmp), pFrom, pPattern, pAnchor)}>
            Apply pattern change
          </Btn>
          <div style={{ fontFamily: mono, fontSize: 10.5, color: C.dim, marginTop: 12, lineHeight: 1.55 }}>
            Everything from that date forward is regenerated on the new pattern. Manual edits after that
            date are cleared, so change the pattern first and enter travel and leave afterwards.
          </div>

          {emp && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
              <div style={{ fontFamily: disp, fontSize: 11.5, letterSpacing: ".12em", color: C.dim,
                textTransform: "uppercase", marginBottom: 6 }}>{emp.name} — pattern history</div>
              {(emp.patterns || []).map((s) => (
                <div key={s.from} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 12,
                  padding: "4px 0", borderBottom: `1px solid ${C.line}` }}>
                  <span style={{ fontFamily: mono, fontSize: 11, color: C.dim, width: 80 }}>
                    {s.from === "2000-01-01" ? "from start" : fmtShort(s.from)}</span>
                  <span style={{ flex: 1 }}>{s.pattern}</span>
                  <span style={{ fontFamily: mono, fontSize: 10.5, color: C.dimmer }}>
                    swing {fmtShort(s.anchor)}</span>
                  {(emp.patterns || []).length > 1 && s.from !== "2000-01-01" && (
                    <Btn small danger onClick={() => removePatternSegment(emp.id, s.from)}>×</Btn>
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>

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
      </div>

      <Panel title="Personnel" note="mobilisation and demobilisation dates drive the roster" pad={0}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ minWidth: 1080 }}>
            <thead><tr>
              <th style={th}>Name</th><th style={th}>Position</th><th style={th}>Crew</th>
              <th style={th}>Pattern now</th><th style={th}>Mobe</th><th style={th}>Demobe</th>
              <th style={th}>Default shift</th><th style={th}>§26</th><th style={th}>LH</th><th style={th}>Grader</th>
            </tr></thead>
            <tbody>
              {employees.map((e) => {
                const seg = segmentFor(e, focusDate);
                return (
                  <tr key={e.id} style={{ opacity: e.demobDate ? 0.55 : 1 }}>
                    <td style={{ ...td, fontWeight: 500, whiteSpace: "nowrap" }}>{e.name}</td>
                    <td style={{ ...td, color: C.dim, fontSize: 11.5 }}>{e.position}</td>
                    <td style={{ ...td, fontFamily: mono, fontSize: 11 }}>{e.crew}</td>
                    <td style={{ ...td, fontFamily: mono, fontSize: 11 }}>
                      {seg ? seg.pattern : "—"}
                      <span style={{ color: C.dimmer }}> · {seg ? fmtShort(seg.anchor) : ""}</span>
                    </td>
                    <td style={td}><input type="date" value={e.mobeDate || ""}
                      onChange={(ev) => updateEmployee(e.id, { mobeDate: ev.target.value })} /></td>
                    <td style={td}><input type="date" value={e.demobDate || ""}
                      onChange={(ev) => updateEmployee(e.id, { demobDate: ev.target.value })} /></td>
                    <td style={td}>
                      <select value={e.defaultShift}
                        onChange={(ev) => updateEmployee(e.id, { defaultShift: ev.target.value })}>
                        <option value="DS">Day</option><option value="NS">Night</option>
                      </select>
                    </td>
                    {["s26", "leadingHand", "grader"].map((k) => (
                      <td key={k} style={{ ...td, textAlign: "center" }}>
                        <input type="checkbox" checked={!!e[k]}
                          onChange={(ev) => updateEmployee(e.id, { [k]: ev.target.checked })}
                          style={{ width: 15, height: 15, accentColor: C.red }} />
                      </td>
                    ))}
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
   CHANGE LOG
   ============================================================ */

function Audit({ log }) {
  const [who, setWho] = useState("All");
  const [kind, setKind] = useState("All");
  const [csv, setCsv] = useState("");

  const people = ["All", ...Array.from(new Set(log.map((l) => l.name)))];
  const kinds = ["All", "cell", "leave", "person", "pattern", "request"];
  const filtered = log.filter((l) => (who === "All" || l.name === who) && (kind === "All" || l.kind === kind));

  const makeCsv = () => {
    const head = "when,by,type,employee,date,from,to,reason";
    const esc = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    setCsv([head, ...filtered.map((l) =>
      [l.at, l.by, l.kind, l.name, l.date, l.from, l.to, l.why].map(esc).join(","))].join("\n"));
  };

  const th = { textAlign: "left", padding: "7px 10px", fontFamily: disp, fontSize: 11.5,
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
          <textarea readOnly value={csv} rows={8} style={{ width: "100%" }} onFocus={(e) => e.target.select()} />
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
                  <td style={{ ...td, fontSize: 11.5, color: l.by === "unsigned" ? C.orange : C.ink }}>{l.by}</td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>{l.name}</td>
                  <td style={{ ...td, fontFamily: mono, fontSize: 10.5, color: C.dim }}>{l.date}</td>
                  <td style={{ ...td, fontFamily: mono, fontSize: 11 }}>{l.from}</td>
                  <td style={{ ...td, fontFamily: mono, fontSize: 11, color: C.red }}>{l.to}</td>
                  <td style={{ ...td, fontSize: 11.5, color: C.dim }}>{l.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div style={{ fontFamily: mono, fontSize: 10.5, color: C.orange, lineHeight: 1.6 }}>
        This records what changed and which name was selected at the time. It is not authenticated —
        anyone can select any name. A working record, not evidence.
      </div>
    </div>
  );
}
