import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { loadRoster, saveRoster, STORAGE_MODE, onRemoteChange, forgetCache,
  lastSaveError, lastSaveReport } from "./storage.js";
import { CONFIGURED, currentProfile, onAuthChange, signOut } from "./supabase.js";
import SignIn from "./signin.jsx";
import { FLIGHTS, DAY_NAMES, flightsOn, describeFlight, weeklySummary, siteFlights } from "./flights.js";
import { PEOPLE, OVERRIDES, NOSHOWS, LEAVE } from "./seed.js";
import Help from "./help.jsx";
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
  DT:  { label: "Day trip — in and out same day", dir: "DAY", onsite: true },
};

const TRAVEL_STATES = {
  toRequest:  { suffix: "",     prefix: "",   word: "to request" },
  requested:  { suffix: "-TBC", prefix: "",   word: "requested — awaiting travel team" },
  waitlisted: { suffix: "-WL",  prefix: "",   word: "waitlisted — keep checking" },
  confirmed:  { suffix: "",     prefix: "C-", word: "confirmed by FMG" },
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
      group: "Travel", onsite: st === "waitlisted" ? false : m.onsite,
      movement: mv, dir: m.dir, travelState: st,
      risk: st === "toRequest" || st === "waitlisted",
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
  "SD":    ["#E4E7EA", "#4A5560", "#C3CAD1"],
  "Nshow": ["#B02423", "#FFFFFF", "#B02423"],
  "T":     ["#312122", "#FFFFFF", "#312122"],
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
    if (meta.travelState === "waitlisted") return ["#FCE2DE", "#9B2B22", "#B02423"];
    return ["#FFFFFF", "#B02423", "#B02423"];
  }
  if (SOLID[code]) return SOLID[code];
  return SOLID.other;
}

/* ---------- PATTERNS ---------- */

const PATTERNS = {
  "2:2":       { on: 14, off: 14, travel: true, label: "14 days / 14 off" },
  "2:1":       { on: 14, off: 7,  travel: true, label: "14 days / 7 off" },
  "3:1":       { on: 21, off: 7,  travel: true, label: "21 days / 7 off" },
  "8:6":       { on: 8,  off: 6,  travel: true, label: "8 days / 6 off" },
  "9:5":       { on: 9,  off: 5,  travel: true, label: "9 days / 5 off" },
  "4:3":       { on: 4,  off: 3,  travel: true, label: "4 days / 3 off" },
  "2:2 nights":{ on: 14, off: 14, travel: true, shift: "NS", label: "14 nights / 14 off" },
  "2:1 nights":{ on: 14, off: 7,  travel: true, shift: "NS", label: "14 nights / 7 off" },
  "8:6 nights":{ on: 8,  off: 6,  travel: true, shift: "NS", label: "8 nights / 6 off" },
  "7D/7N/14R": { seq: [["FIA", 1], ["1", 6], ["NS", 7], ["FOA", 1], ["RR", 13]], travel: false,
                 label: "fly in, 6 days, 7 nights, fly out AM, 13 off" },
  "5:2":       { office: true, label: "Mon-Fri office" },
  "Ad hoc":    { adhoc: true, label: "No pattern - manual only" },
};

/* Patterns the office builds themselves are merged in here, so the roster
   engine and every dropdown see the same list. */
const PATTERN_REGISTRY = { ...PATTERNS };

function setCustomPatterns(custom) {
  Object.keys(PATTERN_REGISTRY).forEach((k) => { if (!PATTERNS[k]) delete PATTERN_REGISTRY[k]; });
  Object.keys(custom || {}).forEach((k) => {
    const c = custom[k];
    PATTERN_REGISTRY[k] = { seq: c.seq, travel: false, custom: true,
      label: c.label || describeSeq(c.seq) };
  });
  return PATTERN_REGISTRY;
}

function describeSeq(seq) {
  const total = seq.reduce((n, x) => n + x[1], 0);
  return seq.map(([c, n]) => `${n}${codeText(c) || c}`).join(" + ") + ` = ${total} days`;
}

const patternNames = () => Object.keys(PATTERN_REGISTRY);

/* ---------- SEED WORKFORCE ---------- */

const CATEGORIES = ["Operator", "Leading Hand", "Supervisor", "Project Manager",
  "HSE Advisor", "Administrator", "General Manager", "Trainer", "Maintenance", "Other"];

const USERS = ["Jaki Soutar", "Kiteesha", "Kylie Turner", "Wes Clack", "Greg Jozwicki", "Donna Matiu", "Allan Butson"];
const ADMINS = ["Jaki Soutar", "Kiteesha", "Kylie Turner"];

/* Reaches back to December 2025 because leave that began in 2025 carries its
   true start date, and the roster has to have somewhere to show it. */
const HORIZON_START = "2025-12-01";
const HORIZON_DAYS = 671;

/* ---------- DATES ---------- */

const MS = 86400000;
const toISO = (d) => d.toISOString().slice(0, 10);
const parse = (s) => new Date(s + "T00:00:00Z");
const addDays = (iso, n) => toISO(new Date(parse(iso).getTime() + n * MS));
const diffDays = (a, b) => Math.round((parse(a) - parse(b)) / MS);
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const dow = (iso) => parse(iso).getUTCDay();
const fmtShort = (iso) => `${parse(iso).getUTCDate()} ${MON[parse(iso).getUTCMonth()]} ${parse(iso).getUTCFullYear()}`;
/* the short form, for the grid columns where the month band already shows the year */
const fmtDay = (iso) => `${parse(iso).getUTCDate()} ${MON[parse(iso).getUTCMonth()]}`;
const fmtLong = (iso) => `${DOW[dow(iso)]} ${parse(iso).getUTCDate()} ${MON[parse(iso).getUTCMonth()]} ${parse(iso).getUTCFullYear()}`;
const nowStamp = () => new Date().toISOString();

/* Every saved record needs an id no other record shares. Ids used to be built
   from Date.now() alone, so anything creating several records in the same
   millisecond — a travel import, two quick clicks — could mint the same id
   twice. Those records are then written in one statement, and Postgres refuses
   an upsert carrying the same key twice ("ON CONFLICT DO UPDATE command cannot
   affect row a second time"), which failed the whole save. The random tail is
   kept as text: Date.now() + Math.random() as a number loses almost all of the
   random part, because the timestamp alone uses 41 of a double's 53 bits. */
let uidCount = 0;
const uid = (prefix) => prefix + Date.now().toString(36)
  + (uidCount++).toString(36) + Math.random().toString(36).slice(2, 8);
const fmtStamp = (s) => { const d = new Date(s);
  return `${String(d.getDate()).padStart(2,"0")} ${MON[d.getMonth()]} ${d.getFullYear()} `
    + `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; };
const DATES = Array.from({ length: HORIZON_DAYS }, (_, i) => addDays(HORIZON_START, i));
const bySurname = (a, b) => (a.name || "").localeCompare((b.name || ""), "en",
  { sensitivity: "base" });

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

/* The swing this person's pattern is built around, travel days included.
   For 2:2 and 2:1 that is 14. Staff on 8:6 or 4:3 are measured against
   their own pattern rather than against 14, so their normal swings do
   not read as faults. */
function expectedSwing(emp, iso) {
  const seg = segmentFor(emp, iso);
  if (!seg) return null;
  const p = PATTERN_REGISTRY[seg.pattern];
  if (!p || p.adhoc || p.office) return null;
  if (p.seq) {
    return p.seq.reduce((n, [code, len]) =>
      n + (code === "RR" || code === "RDO" ? 0 : len), 0);
  }
  return p.on || null;
}

function patternCode(emp, iso) {
  if (emp.mobeDate && iso < emp.mobeDate) return null;
  if (emp.demobDate && iso > emp.demobDate) return null;
  const seg = segmentFor(emp, iso);
  if (!seg) return null;
  const p = PATTERN_REGISTRY[seg.pattern];
  if (!p || p.adhoc) return null;
  if (p.office) return dow(iso) === 0 || dow(iso) === 6 ? "RR" : "GTN";

  const n = diffDays(iso, seg.anchor);
  const base = p.shift === "NS" ? "NS" : "1";

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

/* Night shift used to be a minimum of 2. It is now an exact count of 1, so a
   saved 2 is a leftover from the old rule rather than a decision anyone made.
   Anything other than 2 is left alone — that was somebody choosing. */
function migrateThresholds(saved) {
  if (!saved) return saved;
  if (saved.ns === 2) return { ...saved, ns: 1 };
  return saved;
}

/* ---------- IS THERE A FLIGHT? ----------
   Checks a travel movement against FMG's weekly schedule and, when
   there isn't one, says what there is instead and when the next one
   of that kind runs.                                                */

function flightAdvice(iso, code) {
  const meta = CODES[code];
  if (!meta || !meta.movement) return null;
  const mv = meta.movement;
  if (mv.startsWith("D")) return null;                 /* driving needs no flight */
  if (mv === "DT") return null;                        /* handled as its two legs */

  const dir = meta.dir;
  const period = mv.endsWith("A") ? "AM" : "PM";
  const dayOfWeek = dow(iso);
  if (flightsOn(dayOfWeek, dir, period).length) return null;

  const word = dir === "IN" ? "in" : "out";
  const half = period === "AM" ? "morning" : "afternoon";
  const dayName = DAY_NAMES[dayOfWeek];
  const sameDay = flightsOn(dayOfWeek, dir);

  let msg;
  if (!sameDay.length) {
    msg = `There are no flights ${word} of Eliwana on a ${dayName} at all.`;
  } else {
    const other = sameDay.map(describeFlight).join("; ");
    msg = `There is no ${half} flight ${word} on a ${dayName}. ${dayName} has ${other}.`;
  }

  /* when is the next one of the kind they asked for? */
  for (let i = 1; i <= 7; i++) {
    const d = addDays(iso, i);
    const found = flightsOn(dow(d), dir, period);
    if (found.length) {
      msg += ` The next ${half} flight ${word} is ${DAY_NAMES[dow(d)]} ${fmtShort(d)} — ${describeFlight(found[0])}.`;
      break;
    }
  }
  return msg;
}

/* a day trip needs a flight in and a flight out on the same day */
function dayTripAdvice(iso) {
  const dayOfWeek = dow(iso);
  const ins = flightsOn(dayOfWeek, "IN");
  const outs = flightsOn(dayOfWeek, "OUT");
  if (!ins.length && !outs.length)
    return `There are no flights at all on a ${DAY_NAMES[dayOfWeek]}, so a day trip is not possible.`;
  if (!ins.length) return `There is no flight in on a ${DAY_NAMES[dayOfWeek]}, so a day trip is not possible.`;
  if (!outs.length) return `There is no flight out on a ${DAY_NAMES[dayOfWeek]}, so a day trip is not possible.`;
  const firstIn = ins[0], lastOut = outs[outs.length - 1];
  if (lastOut.depart <= firstIn.arrive)
    return `On a ${DAY_NAMES[dayOfWeek]} the last flight out (${describeFlight(lastOut)}) leaves before the first flight in arrives (${describeFlight(firstIn)}).`;
  return null;
}

function travelAdvice(iso, code) {
  const meta = CODES[code];
  if (!meta || !meta.movement) return null;
  if (meta.movement === "DT") return dayTripAdvice(iso);
  return flightAdvice(iso, code);
}

/* ---------- METRICS ---------- */

const METRICS = [
  { id: "ops",    name: "Operators on site",      min: 8, test: (e) => e.category === "Operator" },
  { id: "sup",    name: "Supervisors on site",    min: 1, test: (e) => e.category === "Supervisor" },
  { id: "s26",    name: "Section 26 supervision", min: 1, test: (e) => e.s26 },
  { id: "lead",   name: "Leading hands",          min: 1, test: (e) => e.leadingHand },
  { id: "ns",     name: "Night shift crew",       min: 1, exact: true,
    test: () => true, onlyCode: (c) => c === "NS" },
  { id: "grader", name: "Grader operators",       min: 2, test: (e) => e.grader },
  { id: "hse",    name: "HSE on site",            min: 0, test: (e) => e.category === "HSE Advisor" },
  { id: "pm",     name: "Project manager on site",min: 0, test: (e) => e.category === "Project Manager" },
];

/* ---------- ROSTER SENSE CHECKS ---------- */

const seg0 = (emp, iso) => {
  const sg = segmentFor(emp, iso);
  return sg ? sg.pattern : "rostered";
};

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

    const advice = travelAdvice(iso, code);
    if (advice) flag(iso, `${codeText(code)} on ${fmtShort(iso)} — ${advice}`, "warning");

    /* a day trip starts and finishes on the same day — it neither opens
       nor closes a swing, and it needs no work days either side */
    if (dir === "DAY") {
      if (openIn) flag(iso, `Day trip on ${fmtShort(iso)} but already on site since ${fmtShort(openIn)}.`, "warning");
      return;
    }

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
      } else {
        /* a swing shorter than the pattern, unless leave either side explains it */
        const want = expectedSwing(emp, openIn);
        const span = diffDays(iso, openIn) + 1;
        if (want && span < want) {
          const before = codeFor(emp, addDays(openIn, -1));
          const after = codeFor(emp, addDays(iso, 1));
          const isLeave = (c) => !!(c && CODES[c] && CODES[c].leave);
          if (isLeave(before) || isLeave(after)) {
            /* deliberate — leave butts up against it */
          } else {
            flag(openIn,
              `Swing of ${span} days, ${fmtShort(openIn)} to ${fmtShort(iso)}, including travel — `
              + `the ${seg0(emp, openIn)} pattern is ${want} days. No leave either side to explain it.`,
              "warning");
          }
        }
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

const csvCell = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;

function downloadCsv(filename, rows) {
  const text = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["\ufeff" + text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

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

/* If anything goes wrong on screen, say so plainly instead of showing a
   blank page — and give the person something they can send back. */
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { console.error("Roster Control crashed", err, info); }
  render() {
    if (!this.state.err) return this.props.children;
    const detail = String(this.state.err && (this.state.err.stack || this.state.err.message || this.state.err));
    return (
      <div style={{ background: C.page, minHeight: "100vh", fontFamily: sans, color: C.ink,
        padding: 24 }}>
        <div style={{ maxWidth: 620, margin: "40px auto", background: C.panel,
          border: `1px solid ${C.line}`, borderTop: `4px solid ${C.red}`, borderRadius: 2 }}>
          <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.line}`,
            fontFamily: disp, fontSize: 18, letterSpacing: ".1em", textTransform: "uppercase",
            color: C.red, fontWeight: 700 }}>Something went wrong on this screen</div>
          <div style={{ padding: "16px 18px", fontSize: 13.5, lineHeight: 1.6 }}>
            Nothing has been lost — the roster is safe. Try the button below, and if it keeps
            happening send the wording underneath to Allan.
            <div style={{ marginTop: 14 }}>
              <button onClick={() => this.setState({ err: null })} style={{ background: C.red,
                color: "#FFF", border: `1px solid ${C.red}`, padding: "9px 16px", borderRadius: 2,
                cursor: "pointer", fontFamily: disp, fontSize: 14, letterSpacing: ".1em",
                textTransform: "uppercase", fontWeight: 600, marginRight: 8 }}>Try again</button>
              <button onClick={() => window.location.reload()} style={{ background: "transparent",
                color: C.ink, border: `1px solid ${C.line2}`, padding: "9px 16px", borderRadius: 2,
                cursor: "pointer", fontFamily: disp, fontSize: 14, letterSpacing: ".1em",
                textTransform: "uppercase", fontWeight: 600 }}>Reload the page</button>
            </div>
            <textarea readOnly value={detail} rows={7} onFocus={(e) => e.target.select()}
              style={{ width: "100%", marginTop: 16, fontFamily: mono, fontSize: 11,
                border: `1px solid ${C.line2}`, borderRadius: 2, padding: 8, background: C.panel2,
                color: C.dim }} />
          </div>
        </div>
      </div>
    );
  }
}

export default function App() {
  return <ErrorBoundary><AppInner /></ErrorBoundary>;
}

function AppInner() {
  const [profile, setProfile] = useState(undefined);   // undefined = still checking

  useEffect(() => {
    if (!CONFIGURED) { setProfile(null); return; }
    let live = true;
    const read = () => currentProfile().then((p) => { if (live) setProfile(p); });
    read();
    const stop = onAuthChange(read);
    return () => { live = false; stop(); };
  }, []);

  if (CONFIGURED && profile === undefined) {
    return (
      <div style={{ background: C.page, minHeight: "100vh", display: "flex",
        alignItems: "center", justifyContent: "center", fontFamily: mono,
        fontSize: 13, color: C.dim }}>Loading…</div>
    );
  }
  if (CONFIGURED && !profile) return <SignIn />;

  return <Roster profile={profile} />;
}

function Roster({ profile }) {
  const buildEmployees = () =>
    PEOPLE.map((r, i) => {
      const pos = (r.position || "").toLowerCase();
      return {
        id: i + 1, name: r.name, alias: r.alias, sap: r.sap,
        category: r.category, position: r.position,
        poh: r.poh, company: r.company, crew: r.crew,
        phone: r.phone, email: r.email, atsi: r.atsi, gender: r.gender,
        contract: r.contract,
        patterns: [{ from: "2000-01-01", pattern: r.pattern, anchor: r.anchor }],
        mobeDate: r.mobeDate, demobDate: r.demobDate,
        grader: pos.includes("grader"), leadingHand: pos.includes("leading hand"),
        s26: r.category === "Supervisor" || r.category === "Project Manager",
      };
    });

  const buildOverrides = () => {
    const o = {};
    PEOPLE.forEach((r, i) => {
      const days = OVERRIDES[r.name];
      if (!days) return;
      Object.keys(days).forEach((d) => (o[(i + 1) + "|" + d] = days[d]));
    });
    return o;
  };

  const [employees, setEmployees] = useState(buildEmployees);
  const [overrides, setOverrides] = useState(buildOverrides);
  const [leaveRecords, setLeaveRecords] = useState(() => LEAVE.slice());
  const [travel, setTravel] = useState([]);
  const [requests, setRequests] = useState([]);
  const [actions, setActions] = useState([]);
  const [log, setLog] = useState([]);
  const [thresholds, setThresholds] = useState(Object.fromEntries(METRICS.map((m) => [m.id, m.min])));

  const [user, setUser] = useState(profile ? profile.name : "");
  const isAdmin = !profile || profile.role === "admin";
  const [view, setView] = useState("dash");
  const startOn = (() => {
    const t = toISO(new Date());
    return t < DATES[0] ? DATES[0] : t > DATES[DATES.length - 1] ? DATES[DATES.length - 1] : t;
  })();
  const [focusDate, setFocusDate] = useState(startOn);
  const [gridStart, setGridStart] = useState(addDays(startOn, -5));
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
  const [blocked, setBlocked] = useState(false);
  const [remoteNote, setRemoteNote] = useState(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!remoteNote) return;
    const t = setTimeout(() => setRemoteNote(null), 6000);
    return () => clearTimeout(t);
  }, [remoteNote]);
  const [denied, setDenied] = useState(false);
  const [dismissed, setDismissed] = useState({});
  const [undoStack, setUndoStack] = useState([]);
  const [customPatterns, setCustomPatterns_] = useState({});
  const [noShows, setNoShows] = useState(() => NOSHOWS.slice());
  /* watch: empId|date -> a waitlisted movement running alongside whatever
     is actually on the roster that day. Shown on the cell, tracked on the
     Travel tab, and ignored by the roster checks until it is confirmed. */
  const [watch, setWatch] = useState({});
  /* free text against one person on one day — excess baggage, a phone call, anything */
  const [notes, setNotes] = useState({});

  const hydrated = useRef(false);
  const saveTimer = useRef(null);

  /* Set while a reload is being written into state, so the save effect can
     tell a change that came from the database from one a person made. */
  const applyingLoad = useRef(false);

  const snapshot = () => ({
    employees, overrides, leaveRecords, travel, requests, actions, log, thresholds, dismissed,
    customPatterns, noShows, watch, notes,
    savedAt: nowStamp(), savedBy: user || "unknown",
  });

  const loadShared = useCallback(async () => {
    setSync((s) => ({ ...s, state: "loading" }));
    try {
      const d = await loadRoster();

      /* Somebody made a change while this was in flight. Every guard against
         reloading over unsaved work is checked before the fetch starts, so
         this is the one place it can still happen — and applying what came
         back would wipe work that has not reached the database yet. Leave the
         screen alone; the save already scheduled will write it, and the next
         reload picks up whatever else has changed. */
      if (hydrated.current && dirty.current) {
        setSync((s) => ({ ...s, state: "ok" }));
        return;
      }

      if (d) {
        /* Everything set below is watched by the save effect. Left alone, a
           reload marks the tab dirty and schedules a save of data that has
           just come out of the database; that save emits change events, the
           app reads them as somebody else editing, reloads again, and the
           cycle repeats — which is what put "updated by someone else" on
           screen over and over and wiped edits made while it was going round.
           The first load is deliberately exempt: that save is what seeds an
           empty database. */
        if (hydrated.current) applyingLoad.current = true;

        /* A reload replaces the roster wholesale. If what arrives disagrees
           with what is on screen, whatever was on screen is about to vanish —
           which is what "it changed back a second later" looks like from the
           other side. Say so, and name the days, so the cause can be seen
           rather than guessed at. Press F12 and read the Console to see it. */
        if (hydrated.current && d.overrides) {
          const onScreen = overridesRef.current || {};
          const fromDb = d.overrides;
          const lost = [];
          Object.keys(onScreen).forEach((k) => {
            if (onScreen[k] !== fromDb[k]) lost.push(`${k}  screen "${onScreen[k]}" -> database "${fromDb[k] || "none"}"`);
          });
          Object.keys(fromDb).forEach((k) => {
            if (!(k in onScreen)) lost.push(`${k}  screen "none" -> database "${fromDb[k]}"`);
          });
          if (lost.length) {
            const rep = lastSaveReport();
            console.warn(`ROSTER RELOAD changed ${lost.length} day(s) that were on screen. `
              + `If you have just made a change and it disappeared, it is one of these:`);
            lost.slice(0, 40).forEach((l) => {
              const key = l.split("  ")[0];
              const verdict = !rep ? "NO SAVE HAS RUN YET"
                : rep.wrote.includes(key) ? `last save DID send this day (save ok: ${rep.ok})`
                : rep.cleared.includes(key) ? "last save CLEARED this day"
                : "last save NEVER SENT this day";
              console.warn(`   ${l}   [${verdict}]`);
            });
            if (lost.length > 40) console.warn(`   ...and ${lost.length - 40} more`);
            console.warn(`   unsaved work still pending: ${dirty.current}`);
          } else {
            console.info("ROSTER RELOAD matched what was on screen — nothing was overwritten.");
          }
        }

        /* An empty list means it has not been written yet — keep the seeded
           ones rather than blanking the tab. Applies to the three that are
           seeded from the spreadsheet; the rest start empty legitimately. */
        if (d.employees && d.employees.length) setEmployees(d.employees);
        if (d.overrides) setOverrides(d.overrides);
        if (d.leaveRecords && d.leaveRecords.length) setLeaveRecords(d.leaveRecords);
        if (d.noShows && d.noShows.length) setNoShows(d.noShows);
        if (d.travel) setTravel(d.travel);
        if (d.requests) setRequests(d.requests);
        if (d.actions) setActions(d.actions);
        /* Entries written before ids were carried on the record itself have
           none, and the save layer then falls back to a key built from the
           time, person, day and value. A bulk edit stamps the same time on
           many entries, so tens of thousands ended up sharing one key and the
           log duplicated itself on every save — 39,869 collisions in a single
           save at its worst. Give them an id here, keeping the same key but
           numbering repeats, so it is stable across loads rather than tied to
           position. Once saved, each entry carries its own id and this stops
           applying to it. */
        if (d.log) {
          const seen = new Map();
          setLog(d.log.map((r) => {
            if (r.id) return r;
            const base = "L" + (r.at || "") + ":" + (r.empId || 0) + ":" + (r.date || "")
              + ":" + (r.kind || "") + ":" + (r.to || "");
            const n = (seen.get(base) || 0) + 1;
            seen.set(base, n);
            return { ...r, id: n === 1 ? base : `${base}#${n}` };
          }));
        }
        if (d.thresholds) setThresholds(migrateThresholds(d.thresholds));
        if (d.dismissed) setDismissed(d.dismissed);
        if (d.customPatterns) setCustomPatterns_(d.customPatterns);
        if (d.watch) setWatch(d.watch);
        if (d.notes) setNotes(d.notes);
        setSync({ state: "ok", at: d.savedAt, by: d.savedBy });
      } else setSync({ state: "empty", at: null, by: null });
    } catch {
      setSync({ state: "empty", at: null, by: null });
    }
    hydrated.current = true;
  }, []);

  const savingUntil = useRef(0);
  /* True from the moment something is changed until that change is safely in
     the database. While it is true nothing reloads over the top — otherwise a
     change made in the second before a save could be wiped by an update
     arriving from someone else, or by the echo of our own earlier writes. */
  const dirty = useRef(false);
  const reloadWanted = useRef(false);

  useEffect(() => { loadShared(); }, [loadShared]);

  /* Coming back to a tab that has been sitting in the background — a second
     window, or one left open since this morning — it must catch up before
     anything is looked at or saved, or it will quietly push its old view over
     everyone else's work. */
  useEffect(() => {
    const catchUp = () => {
      if (document.hidden) return;
      if (dirty.current) return;          /* unsaved work here comes first */
      if (Date.now() < savingUntil.current) return;
      loadShared();
    };
    document.addEventListener("visibilitychange", catchUp);
    return () => {
      document.removeEventListener("visibilitychange", catchUp);
    };
  }, [loadShared]);

  /* The roster used to catch up on the window focus event as well. That fires
     every time the window regains focus — alt-tabbing, clicking back from
     another program, moving between the page and the developer tools — so the
     roster was being reloaded over the top of whatever was on screen many
     times an hour rather than once when a tab came back into view.
     visibilitychange alone covers what this is for. */

  /* A save waits 900ms so that quick successive edits go in one write. Closing
     or refreshing inside that window used to take the change with it, silently.
     Ask first — this is the "changed it, pressed refresh, it came back" case. */
  useEffect(() => {
    const warn = (e) => {
      if (!dirty.current) return;
      e.preventDefault();
      e.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  /* When someone else changes something, pull it in. We ignore the echo
     of our own writes for a moment so the screen does not flicker. */
  useEffect(() => {
    let timer = null;
    const stop = onRemoteChange(() => {
      if (Date.now() < savingUntil.current || dirty.current) {
        reloadWanted.current = true;   /* pick it up once the save is done */
        return;
      }
      clearTimeout(timer);
      timer = setTimeout(() => {
        loadShared();
        setRemoteNote(nowStamp());
      }, 700);
    });
    return () => { clearTimeout(timer); stop(); };
  }, [loadShared]);

  useEffect(() => {
    if (!hydrated.current) return;
    /* This render came from a reload, not from a person — nothing to save. */
    if (applyingLoad.current) { applyingLoad.current = false; return; }
    dirty.current = true;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSync((s) => ({ ...s, state: "saving" }));
      /* A first save writes thousands of rows and can run for a while. Hold the
         echo window open for the whole of it, and for a moment afterwards, so a
         reload triggered by our own writes cannot land mid-save. */
      savingUntil.current = Date.now() + 60000;
      try {
        const snap = snapshot();
        const ok = await saveRoster(snap);
        savingUntil.current = Date.now() + 3000;
        if (!ok) throw new Error("save failed");
        dirty.current = false;
        setSync({ state: "ok", at: snap.savedAt, by: snap.savedBy, why: null });
        /* somebody else changed something while we were working — take it now */
        if (reloadWanted.current) {
          reloadWanted.current = false;
          setTimeout(() => { if (!dirty.current) { loadShared(); setRemoteNote(nowStamp()); } }, 1200);
        }
      } catch {
        savingUntil.current = Date.now() + 3000;
        setSync((s) => ({ ...s, state: "error", why: lastSaveError() }));
      }
    }, 900);
    /* No cleanup here on purpose. React runs an effect's cleanup before every
       re-run, so clearing the timer there cancelled the pending save whenever
       anything re-rendered — and once this effect learned to skip the renders a
       reload causes, there was nothing left to put the timer back. A change
       made in the second before a reload landed was dropped without a trace:
       on screen, absent from the database, no error anywhere. Debouncing is
       handled by the clearTimeout above, which runs on every real change. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees, overrides, leaveRecords, travel, requests, actions, thresholds, dismissed, customPatterns, noShows, watch, notes, retry]);

  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);

  /* Every change is attributed, so nothing is written until a name is picked. */
  const requireUser = useCallback(() => {
    if (userRef.current) return true;
    setBlocked(true);
    return false;
  }, []);

  const adminRef = useRef(isAdmin);
  useEffect(() => { adminRef.current = isAdmin; }, [isAdmin]);

  /* personnel records, roster patterns and coverage minimums are the
     office's to change — the database enforces this too */
  const requireAdmin = useCallback(() => {
    if (!requireUser()) return false;
    if (adminRef.current) return true;
    setDenied(true);
    return false;
  }, [requireUser]);

  const record = useCallback((entry) => {
    const id = uid("L");
    setLog((l) => [{ id, ...entry, at: nowStamp(), by: user || "unsigned" }, ...l].slice(0, 800));
  }, [user]);

  const notify = useCallback(async (subject, body, kind) => {
    const item = { id: uid("N"), subject, body, kind,
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

  useMemo(() => setCustomPatterns(customPatterns), [customPatterns]);

  /* Every day covered by a leave record, from the register itself. The register
     is the source of truth for leave; the roster cell is a copy of it. */
  const leaveDays = useMemo(() => {
    const m = {};
    (leaveRecords || []).forEach((r) => {
      if (!r.from || !r.to) return;
      rangeDays(r.from, r.to).forEach((d) => (m[r.empId + "|" + d] = r.code));
    });
    return m;
  }, [leaveRecords]);

  const codeFor = useCallback((emp, iso) => {
    const k = emp.id + "|" + iso;
    if (k in overrides) return overrides[k];
    return patternCode(emp, iso);
  }, [overrides]);

  const codeForRef = useRef(codeFor);
  useEffect(() => { codeForRef.current = codeFor; }, [codeFor]);
  const overridesRef = useRef(overrides);
  useEffect(() => { overridesRef.current = overrides; }, [overrides]);

  const undo = () => {
    if (!requireUser()) return;
    setUndoStack((u) => {
      if (!u.length) return u;
      setOverrides(u[0].overrides);
      record({ kind: "cell", empId: 0, name: "—", date: "—",
        from: u[0].label, to: "undone", why: "undo" });
      return u.slice(1);
    });
  };

  const applyCell = useCallback((empId, iso, code, why) => {
    if (!requireUser()) return;
    const emp = employees.find((e) => e.id === empId);
    if (!emp) return;
    const before = codeForRef.current(emp, iso);
    const after = code === "__clear" ? patternCode(emp, iso) : code;
    if (before === after) return;
    setUndoStack((u) => [{ overrides: overridesRef.current,
      label: `${emp.name} ${fmtShort(iso)} → ${after || "pattern"}` }, ...u].slice(0, 40));
    setOverrides((o) => {
      const n = { ...o };
      if (code === "__clear") delete n[empId + "|" + iso];
      else n[empId + "|" + iso] = code;
      return n;
    });
    record({ kind: "cell", empId, name: emp.name, date: iso,
      from: before || "—", to: after || "—", why: why || "manual edit" });
  }, [employees, record, requireUser]);

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
      const advice = code === "__clear" ? null : travelAdvice(iso, code);
      if (advice) probs.unshift({ iso, msg: advice, sev: "critical", flights: true });
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
      let total = 0, opsDay = 0, opsNight = 0;
      employees.forEach((e) => {
        const c = codeFor(e, iso);
        if (!isOnSite(c)) return;
        total++;
        const night = c === "NS";
        if (e.category === "Operator") { if (night) opsNight++; else opsDay++; }
        METRICS.forEach((m) => {
          if (!m.test(e)) return;
          if (m.onlyCode && !m.onlyCode(c)) return;
          /* a leading hand working nights is not covering the day shift */
          if (m.id === "lead" && night) return;
          counts[m.id]++;
        });
      });

      /* With no supervisor and no project manager on site, a leading hand
         steps into the Section 26 role — so they stop counting as an operator. */
      let acting = false;
      if (counts.sup === 0 && counts.pm === 0 && counts.lead > 0) {
        acting = true;
        counts.s26 = Math.max(counts.s26, 1);
        if (opsDay > 0) opsDay--; else if (opsNight > 0) opsNight--;
      }
      counts.ops = opsDay + opsNight;
      return { iso, counts, total, opsDay, opsNight, acting };
    }), [employees, codeFor]);

  const dayIndex = useMemo(() => { const m = {}; daily.forEach((d, i) => (m[d.iso] = i)); return m; }, [daily]);
  const today = daily[dayIndex[focusDate]] || daily[0];

  const anomalies = useMemo(() => {
    const out = [];
    employees.forEach((e) => out.push(...checkEmployee(e, codeFor, DATES)));
    return out
      .filter((a) => !dismissed[a.empId + "|" + a.iso + "|" + a.msg])
      .sort((a, b) => (a.iso < b.iso ? -1 : 1));
  }, [employees, codeFor, dismissed]);

  const dismissAnomaly = (a) => {
    if (!requireUser()) return;
    setDismissed((d) => ({ ...d, [a.empId + "|" + a.iso + "|" + a.msg]:
      { by: user || "unsigned", at: nowStamp() } }));
    record({ kind: "check", empId: a.empId, name: a.name, date: a.iso,
      from: "flagged", to: "checked and cleared", why: a.msg });
  };

  /* Counters look ahead a working window, not the whole horizon. Over 640 days
     the pattern generates travel for years out and the numbers stop meaning
     anything. NEAR_DAYS is what the office can actually act on. */
  const NEAR_DAYS = 90;
  const nearEnd = addDays(focusDate, NEAR_DAYS);

  const toRequestCount = useMemo(() => {
    let n = 0;
    employees.forEach((e) => DATES.forEach((iso) => {
      if (iso < focusDate || iso > nearEnd) return;
      if (travelState(codeFor(e, iso)) === "toRequest") n++;
    }));
    return n;
  }, [employees, codeFor, focusDate, nearEnd]);

  const alerts = useMemo(() => {
    const out = [];
    daily.forEach((d) => {
      METRICS.forEach((m) => {
        const min = thresholds[m.id];
        if (!min) return;
        const have = d.counts[m.id];
        /* most rules are a minimum; night shift is an exact number, so too
           many is as much of a problem as too few */
        if (m.exact) {
          if (have === min) return;
          out.push({ iso: d.iso, metric: m.id, name: m.name, have, need: min,
            over: have > min,
            sev: have === 0 ? "critical" : "warning" });
          return;
        }
        if (have < min)
          out.push({ iso: d.iso, metric: m.id, name: m.name, have, need: min,
            sev: have === 0 ? "critical" : "warning" });
      });
    });
    return out;
  }, [daily, thresholds]);

  const upcoming = useMemo(
    () => alerts.filter((a) => a.iso >= focusDate && a.iso <= nearEnd).slice(0, 400),
    [alerts, focusDate, nearEnd]);
  const upcomingAnomalies = useMemo(
    () => anomalies.filter((a) => a.iso >= focusDate && a.iso <= nearEnd).slice(0, 300),
    [anomalies, focusDate, nearEnd]);
  const pendingRequests = requests.filter((r) => r.status === "pending").length;

  useEffect(() => {
    const up = () => setPainting(false);
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  const jumpTo = (iso, empId) => {
    setFocusDate(iso);
    setGridStart(addDays(iso, -5));
    if (empId) { setPicked([empId]); setSearch(""); setCrewFilter("All"); setCatFilter("All"); }
    else setPicked([]);
    setView("grid");
  };

  const leaveClash = (rec) =>
    leaveRecords.find((r) => r.empId === rec.empId && r.from <= rec.to && r.to >= rec.from);

  const addLeave = (rec) => {
    if (!requireUser()) return { error: "Select your name at the top before making changes." };
    const clash = leaveClash(rec);
    if (clash) return { error:
      `${employees.find((e) => e.id === rec.empId) ? employees.find((e) => e.id === rec.empId).name : "That person"} ` +
      `already has ${clash.code} from ${fmtShort(clash.from)} to ${fmtShort(clash.to)}. ` +
      `Remove or shorten that entry first.` };
    const emp = employees.find((e) => e.id === rec.empId);
    const days = rangeDays(rec.from, rec.to);
    const impacted = [];
    days.forEach((d) => {
      const c = codeFor(emp, d);
      if (movementOf(c)) impacted.push({ date: d, code: c });
    });
    const worked = days.filter((d) => isWorkDay(codeFor(emp, d))).length;

    setUndoStack((u) => [{ overrides: overridesRef.current,
      label: `${emp ? emp.name : "?"} leave ${fmtShort(rec.from)}–${fmtShort(rec.to)}` }, ...u].slice(0, 40));
    setOverrides((o) => { const n = { ...o }; days.forEach((d) => (n[rec.empId + "|" + d] = rec.code)); return n; });
    const id = "L" + Date.now();
    setLeaveRecords((r) => [...r, { ...rec, id, by: user || "unsigned", at: nowStamp() }]);
    record({ kind: "leave", empId: rec.empId, name: emp ? emp.name : "?", date: `${rec.from} → ${rec.to}`,
      from: "roster", to: `${rec.code} (${days.length}d)`, why: rec.note || "leave entered" });
    const ok = { error: null };

    if (impacted.length || worked) {
      /* find the flights either side, so the message is about the right thing */
      let inBefore = null, outAfter = null;
      for (let i = 1; i <= 30 && !inBefore; i++) {
        const c = codeFor(emp, addDays(rec.from, -i));
        if (dirOf(c) === "IN") inBefore = { date: addDays(rec.from, -i), code: c };
        else if (dirOf(c) === "OUT") break;
      }
      for (let i = 1; i <= 30 && !outAfter; i++) {
        const c = codeFor(emp, addDays(rec.to, i));
        if (dirOf(c) === "OUT") outAfter = { date: addDays(rec.to, i), code: c };
        else if (dirOf(c) === "IN") break;
      }

      let body;
      if (impacted.length) {
        body =
          `${emp ? emp.name : "?"} is on ${rec.code} from ${fmtLong(rec.from)} to ${fmtLong(rec.to)}.\n\n` +
          `Travel inside the leave:\n` +
          impacted.map((x) => `  ${fmtShort(x.date)} — ${x.code} (${CODES[x.code] ? CODES[x.code].label : ""})`).join("\n") +
          `\n\nAction: cancel or reschedule those movements, and review camp accommodation.`;
      } else if (worked) {
        const ctx = [];
        if (inBefore) ctx.push(`  travels in ${fmtShort(inBefore.date)} — ${inBefore.code}`);
        if (outAfter) ctx.push(`  travels out ${fmtShort(outAfter.date)} — ${outAfter.code}`);
        body =
          `${emp ? emp.name : "?"} is on ${rec.code} from ${fmtLong(rec.from)} to ${fmtLong(rec.to)}, ` +
          `covering ${worked} rostered work day(s).\n\n` +
          `No flights fall inside the leave, so nothing needs cancelling on those dates.\n\n` +
          (ctx.length ? `The surrounding swing:\n${ctx.join("\n")}\n\n` : "") +
          `Action: check whether the swing still works around the leave, and review camp ` +
          `accommodation for those nights only.`;
      } else {
        body = `${emp ? emp.name : "?"} is on ${rec.code} from ${fmtLong(rec.from)} to ${fmtLong(rec.to)}.`;
      }

      notify(
        `${impacted.length ? "Travel change needed" : "Check the swing"} — ${emp ? emp.name : "?"} ${fmtShort(rec.from)} to ${fmtShort(rec.to)}`,
        body, "travel"
      );
    }
    return ok;
  };

  /* A leave day is missing when the roster shows something that is neither the
     leave code nor a travel movement. Travel on a leave day is legitimate — the
     flight and the leave share the day — so those are left alone. */
  const missingLeave = useMemo(() => {
    const out = [];
    Object.keys(leaveDays).forEach((k) => {
      const bar = k.indexOf("|");
      const empId = Number(k.slice(0, bar));
      const iso = k.slice(bar + 1);
      const emp = employees.find((e) => e.id === empId);
      if (!emp) return;
      const now = codeFor(emp, iso);
      if (now === leaveDays[k]) return;
      if (movementOf(now)) return;
      out.push({ empId, iso, want: leaveDays[k], now: now || "—", name: emp.name });
    });
    return out.sort((a, b) => (a.iso < b.iso ? -1 : 1));
  }, [leaveDays, employees, codeFor]);

  /* The other direction: leave painted straight onto the roster never reaches
     the register, so it is invisible to anyone looking there. Find runs of a
     leave code on the roster that no record covers. */
  const unregisteredLeave = useMemo(() => {
    const out = [];
    employees.forEach((emp) => {
      let start = null, code = null, prev = null;
      const close = (end) => {
        if (!start) return;
        /* already covered by a record? */
        const covered = (leaveRecords || []).some((r) => r.empId === emp.id
          && r.code === code && r.from <= start && r.to >= end);
        if (!covered) out.push({ empId: emp.id, name: emp.name, code, from: start, to: end,
          days: diffDays(end, start) + 1 });
        start = null; code = null;
      };
      DATES.forEach((iso) => {
        const c = codeFor(emp, iso);
        const isLeave = !!(c && CODES[c] && CODES[c].leave);
        if (isLeave && c === code && prev && diffDays(iso, prev) === 1) { prev = iso; return; }
        if (start) close(prev);
        if (isLeave) { start = iso; code = c; }
        prev = iso;
      });
      close(prev);
    });
    return out.sort((a, b) => (a.from < b.from ? -1 : 1));
  }, [employees, codeFor, leaveRecords]);

  const registerLeave = () => {
    if (!requireUser()) return;
    if (!unregisteredLeave.length) return;
    const added = unregisteredLeave.map((x) => ({
      id: uid("R"),
      empId: x.empId, code: x.code, from: x.from, to: x.to,
      note: "taken from the roster", by: user || "unsigned", at: nowStamp(),
    }));
    setLeaveRecords((r) => [...r, ...added]);
    record({ kind: "leave", empId: 0,
      name: added.length === 1 ? unregisteredLeave[0].name : `${added.length} blocks`,
      date: `${unregisteredLeave[0].from} → ${unregisteredLeave[unregisteredLeave.length - 1].to}`,
      from: "on the roster only", to: `${added.length} added to the register`,
      why: "roster reconciled with the leave register" });
  };

  const reinstateLeave = () => {
    if (!requireUser()) return;
    if (!missingLeave.length) return;
    setOverrides((o) => {
      const n = { ...o };
      missingLeave.forEach((x) => (n[x.empId + "|" + x.iso] = x.want));
      return n;
    });
    const people = Array.from(new Set(missingLeave.map((x) => x.name)));
    record({ kind: "leave", empId: 0, name: people.length === 1 ? people[0] : `${people.length} people`,
      date: `${missingLeave[0].iso} → ${missingLeave[missingLeave.length - 1].iso}`,
      from: "missing from the roster", to: `${missingLeave.length} day(s) reinstated`,
      why: "leave register reconciled with the roster" });
  };

  const removeLeave = (id) => {
    if (!requireUser()) return;
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
    if (!requireAdmin()) return;
    const emp = employees.find((e) => e.id === id);
    /* the grader and leading hand flags are read off the position text, so keep
       them in step when the position changes — they stay editable by hand */
    if (patch.position != null && emp) {
      const pos = patch.position.toLowerCase();
      patch = { ...patch, grader: pos.includes("grader"),
        leadingHand: pos.includes("leading hand") };
    }
    if (patch.category != null && emp) {
      patch = { ...patch,
        s26: patch.category === "Supervisor" || patch.category === "Project Manager" || !!emp.s26 };
    }
    setEmployees((es) => es.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    Object.keys(patch).forEach((k) => {
      if (k === "patterns") return;
      record({ kind: "person", empId: id, name: emp ? emp.name : "?", date: "—",
        from: `${k}: ${emp ? emp[k] : "?"}`, to: `${k}: ${patch[k]}`, why: "employee record" });
    });
  };

  /* Applies a batch of confirmed travel and fills the swing between the
     movements with work days from that person's pattern. */
  const applyTravelBatch = (rows) => {
    const now = codeForRef.current;
    const byEmp = {};
    rows.forEach((r) => {
      if (!r.empId || !r.date) return;
      (byEmp[r.empId] = byEmp[r.empId] || []).push(r);
    });

    Object.keys(byEmp).forEach((key) => {
      const empId = Number(key);
      const emp = employees.find((e) => e.id === empId);
      if (!emp) return;
      const list = byEmp[key].slice().sort((a, b) => (a.date < b.date ? -1 : 1));

      list.forEach((r) => {
        if (r.state === "waitlisted") {
          addWatch(empId, r.date, travelCode(r.movement, "waitlisted"),
            `waitlisted with FMG${r.flight ? " — " + r.flight : ""}`);
          return;
        }
        applyCell(empId, r.date, travelCode(r.movement, r.state),
          `FMG travel${r.flight ? " " + r.flight : ""}`);
      });

      /* Between flying out and flying back in the person is off site. Unless
         leave is already recorded for those days, they are R & R. */
      const legs = list.filter((r) => r.state !== "waitlisted" && MOVEMENTS[r.movement]);
      legs.forEach((r, i) => {
        if (MOVEMENTS[r.movement].dir !== "OUT") return;
        const nextIn = legs.slice(i + 1).find((x) => MOVEMENTS[x.movement].dir === "IN");
        if (!nextIn) return;
        for (let d = addDays(r.date, 1); d < nextIn.date; d = addDays(d, 1)) {
          const c = now(emp, d);
          if (c && CODES[c] && (CODES[c].leave || c === "T")) continue;   /* leave stays */
          applyCell(empId, d, "RR", "off site between flights");
        }
      });

      list.forEach((r) => {
        if (r.state === "waitlisted") return;
        if (MOVEMENTS[r.movement].dir !== "IN") return;

        /* the matching departure: in this batch first, then the existing roster */
        let outDate = (list.find((x) => x.date > r.date && MOVEMENTS[x.movement].dir === "OUT") || {}).date;
        if (!outDate) {
          for (let i = 1; i <= 35; i++) {
            const d = addDays(r.date, i);
            const c = now(emp, d);
            if (dirOf(c) === "OUT") { outDate = d; break; }
            if (dirOf(c) === "IN") break;
          }
        }

        /* work out which shift this person's pattern runs */
        const seg = segmentFor(emp, r.date);
        const pat = seg ? PATTERN_REGISTRY[seg.pattern] : null;
        const shift = pat && pat.shift === "NS" ? "NS" : "1";

        if (outDate) {
          for (let d = addDays(r.date, 1); d < outDate; d = addDays(d, 1))
            applyCell(empId, d, shift, "site days filled from pattern");
          return;
        }

        /* no departure anywhere — fill the swing length and flag the fly-out
           as still to request */
        const len = pat && pat.on ? pat.on : 14;
        for (let i = 1; i < len - 1; i++)
          applyCell(empId, addDays(r.date, i), shift, "site days filled from pattern");
        applyCell(empId, addDays(r.date, len - 1), travelCode("FOP", "toRequest"),
          "return travel still to request");
      });
    });
  };

  const savePattern = (name, seq) => {
    if (!requireAdmin()) return;
    setCustomPatterns_((c) => ({ ...c, [name]: { seq, label: describeSeq(seq) } }));
    record({ kind: "pattern", empId: 0, name: "—", date: "—",
      from: customPatterns[name] ? "edited" : "new pattern", to: name, why: describeSeq(seq) });
  };

  const deletePattern = (name) => {
    const inUse = employees.filter((e) => (e.patterns || []).some((x) => x.pattern === name));
    if (inUse.length) return { error: `${name} is in use by ${inUse.map((e) => e.name).join(", ")}. Move them to another pattern first.` };
    setCustomPatterns_((c) => { const n = { ...c }; delete n[name]; return n; });
    record({ kind: "pattern", empId: 0, name: "—", date: "—", from: name, to: "deleted", why: "pattern removed" });
    return { error: null };
  };

  const loadImported = () => {
    if (!requireAdmin()) return;
    forgetCache();
    /* People added here since the last import are not in the spreadsheet, so
       reseeding must not remove them. Keep them, renumbered after the seeded
       list, along with any roster days entered against them. */
    const seeded = buildEmployees();
    const seededNames = new Set(seeded.map((e) => e.name.trim().toLowerCase()));
    const extra = employees.filter((e) => !seededNames.has((e.name || "").trim().toLowerCase()));
    const remap = {};
    let nextId = Math.max(0, ...seeded.map((e) => e.id));
    const kept = extra.map((e) => { nextId += 1; remap[e.id] = nextId; return { ...e, id: nextId }; });

    const base = buildOverrides();
    Object.keys(overrides).forEach((k) => {
      const bar = k.indexOf("|");
      const id = Number(k.slice(0, bar));
      if (remap[id]) base[remap[id] + "|" + k.slice(bar + 1)] = overrides[k];
    });

    setEmployees([...seeded, ...kept]);
    setOverrides(base);
    setNoShows(NOSHOWS.slice());
    setLeaveRecords(LEAVE.slice()); setTravel([]); setRequests([]); setActions([]);
    setDismissed({}); setUndoStack([]);
    record({ kind: "person", empId: 0, name: "—", date: "—", from: "saved roster",
      to: "imported roster", why: "reloaded from the Excel workbook" });
  };

  const addWatch = (empId, iso, code, why) => {
    const emp = employees.find((e) => e.id === empId);
    setWatch((w) => ({ ...w, [empId + "|" + iso]: { code, at: nowStamp(),
      by: user || "unsigned", why: why || "" } }));
    record({ kind: "cell", empId, name: emp ? emp.name : "?", date: iso,
      from: "—", to: code, why: why || "waitlisted seat noted" });
  };

  const clearWatch = (empId, iso) => {
    if (!requireUser()) return;
    setWatch((w) => { const n = { ...w }; delete n[empId + "|" + iso]; return n; });
  };

  /* the waitlist came through — put it on the roster as confirmed */
  const confirmWatch = (empId, iso) => {
    if (!requireUser()) return;
    const item = watch[empId + "|" + iso];
    if (!item) return;
    const mv = movementOf(item.code);
    if (mv) applyCell(empId, iso, travelCode(mv, "confirmed"), "waitlisted seat confirmed by FMG");
    setWatch((w) => { const n = { ...w }; delete n[empId + "|" + iso]; return n; });
  };

  const setNote = (empId, iso, text) => {
    if (!requireUser()) return;
    const emp = employees.find((e) => e.id === empId);
    const was = (notes[empId + "|" + iso] || {}).text || "";
    setNotes((n) => {
      const x = { ...n };
      if (!text.trim()) delete x[empId + "|" + iso];
      else x[empId + "|" + iso] = { text: text.trim(), by: user || "unsigned", at: nowStamp() };
      return x;
    });
    record({ kind: "note", empId, name: emp ? emp.name : "?", date: iso,
      from: was || "—", to: text.trim() || "removed", why: "note on the roster" });
  };

  const addNoShow = (rec) => {
    if (!requireUser()) return;
    const emp = employees.find((e) => e.id === Number(rec.empId));
    const full = { ...rec, id: uid("N"), name: emp ? emp.name : rec.name,
      by: user || "unsigned", at: nowStamp() };
    setNoShows((n) => [full, ...n]);
    /* a no show is a fact about the roster, so mark the day */
    applyCell(Number(rec.empId), rec.date, "Nshow", `no show — ${rec.reason || "no reason given"}`);
    record({ kind: "noshow", empId: Number(rec.empId), name: full.name, date: rec.date,
      from: rec.flight || "flight", to: rec.rebookedDate ? `rebooked ${rec.rebookedDate}` : "not rebooked",
      why: rec.reason || "no show" });
  };

  const removeNoShow = (id) => {
    if (!requireUser()) return;
    setNoShows((n) => n.filter((x) => x.id !== id));
  };

  /* The highest id handed out so far this session. `employees` is only as
     current as the last render, so adding two people in quick succession used
     to give them both the same id — and two people sharing an id collide in
     the database. */
  const lastNewId = useRef(0);

  const addPerson = (p) => {
    if (!requireAdmin()) return;
    const id = Math.max(0, ...employees.map((e) => e.id), lastNewId.current) + 1;
    lastNewId.current = id;
    const pos = (p.position || "").toLowerCase();
    const person = {
      id, name: p.name, alias: p.alias || "", sap: p.sap || "", category: p.category,
      position: p.position, poh: p.poh || "", crew: p.crew || "A",
      company: p.company || "", contract: p.contract || "", gender: p.gender || "",
      atsi: p.atsi || "", email: p.email || "", phone: p.phone || "",
      patterns: [{ from: "2000-01-01", pattern: p.pattern, anchor: p.anchor }],
      mobeDate: p.mobeDate || "", demobDate: "",
      grader: pos.includes("grader"), leadingHand: pos.includes("leading hand"),
      s26: p.category === "Supervisor" || p.category === "Project Manager",
    };
    setEmployees((es) => [...es, person]);
    record({ kind: "person", empId: id, name: p.name, date: p.mobeDate || "—",
      from: "—", to: `${p.category} · ${p.crew} · ${p.pattern}`, why: "person added" });
  };

  const changePattern = (empId, from, pattern, anchor) => {
    if (!requireAdmin()) return;
    const emp = employees.find((e) => e.id === empId);
    if (!emp) return;
    const prev = segmentFor(emp, addDays(from, -1));
    const segs = [...(emp.patterns || []).filter((s) => s.from !== from), { from, pattern, anchor }]
      .sort((a, b) => (a.from < b.from ? -1 : 1));
    setEmployees((es) => es.map((e) => (e.id === empId ? { ...e, patterns: segs } : e)));
    let kept = 0;
    setUndoStack((u) => [{ overrides: overridesRef.current,
      label: `${emp.name} pattern → ${pattern}` }, ...u].slice(0, 40));
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

  const sameRequest = (a, b) => a.empId === b.empId
    && a.kind === b.kind
    && JSON.stringify(a.changes.map((c) => [c.date, c.movement]).sort())
       === JSON.stringify(b.changes.map((c) => [c.date, c.movement]).sort());

  const submitRequest = (req) => {
    if (!requireUser()) return;
    const dupe = requests.find((r) => r.status === "pending" && sameRequest(r, req));
    if (dupe) return { error:
      `That request is already waiting — raised by ${dupe.by} on ${fmtStamp(dupe.at)}. `
      + `Action or remove that one rather than sending it again.` };
    const emp = employees.find((e) => e.id === req.empId);
    const before = {};
    rangeDays(addDays(req.changes[0].date, -8), addDays(req.changes[req.changes.length - 1].date, 8))
      .forEach((d) => (before[d] = codeFor(emp, d)));
    const full = { ...req, kind: req.kind || "travel",
      id: uid("R"), status: "pending", by: user || "unsigned",
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
    return { error: null };
  };

  const markRequested = (reqId) => {
    if (!requireUser()) return;
    const req = requests.find((r) => r.id === reqId);
    if (!req) return;

    if (req.kind === "demob") {
      const from = req.changes[0].date;
      const emp = employees.find((e) => e.id === req.empId);
      /* the last departure before that date becomes the demobilisation date */
      let lastOut = "";
      for (let i = 1; i <= 60 && !lastOut; i++) {
        const d = addDays(from, -i);
        if (dirOf(codeFor(emp, d)) === "OUT") lastOut = d;
      }
      /* clear everything from that date, then mark it terminated */
      setOverrides((o) => {
        const n = {};
        Object.keys(o).forEach((k) => {
          const bar = k.indexOf("|");
          if (Number(k.slice(0, bar)) === req.empId && k.slice(bar + 1) >= from) return;
          n[k] = o[k];
        });
        n[req.empId + "|" + from] = "T";
        return n;
      });
      setEmployees((es) => es.map((e) => e.id === req.empId
        ? { ...e, demobDate: lastOut || addDays(from, -1) } : e));
      record({ kind: "person", empId: req.empId, name: req.name, date: from,
        from: "mobilised", to: `terminated ${fmtShort(from)}, demobilised ${fmtShort(lastOut || addDays(from, -1))}`,
        why: req.reason || "demobilised on request" });
      setRequests((rs) => rs.map((r) => r.id === reqId
        ? { ...r, status: "demobilised", actionedBy: user || "unsigned", actionedAt: nowStamp() } : r));
      return;
    }

    if (req.kind === "shift") {
      req.changes.forEach((c) => setCell(req.empId, c.date, c.movement,
        `shift change on request${req.reason ? " — " + req.reason : ""}`));
      setRequests((rs) => rs.map((r) => r.id === reqId
        ? { ...r, status: "changed", actionedBy: user || "unsigned", actionedAt: nowStamp() } : r));
      return;
    }

    req.changes.forEach((c) => {
      if (c.movement === "__cancel") setCell(req.empId, c.date, "RR", "travel cancelled on request");
      else setCell(req.empId, c.date, travelCode(c.movement, "requested"), "requested from travel team");
    });
    /* days between a requested fly-in and fly-out become site days */
    const ins = req.changes.filter((c) => MOVEMENTS[c.movement] && MOVEMENTS[c.movement].dir === "IN");
    ins.forEach((inLeg) => {
      const out = req.changes.find((c) => c.date > inLeg.date
        && MOVEMENTS[c.movement] && MOVEMENTS[c.movement].dir === "OUT");
      if (!out) return;
      for (let d = addDays(inLeg.date, 1); d < out.date; d = addDays(d, 1))
        setCell(req.empId, d, req.siteShift || "1", "site days from the request");
    });
    setRequests((rs) => rs.map((r) => r.id === reqId
      ? { ...r, status: "rescheduled", actionedBy: user || "unsigned", actionedAt: nowStamp() } : r));
  };

  const markActionDone = (id) => {
    if (!requireUser()) return;
    setActions((as) => as.map((a) => a.id === id
      ? { ...a, done: true, doneBy: user || "unsigned", doneAt: nowStamp() } : a));
  };

  const removeTravel = (id) => {
    if (!requireUser()) return;
    const t = travel.find((x) => x.id === id);
    if (!t) return;
    setCell(t.empId, t.date, "__clear", "travel removed");
    setTravel((ts) => ts.filter((x) => x.id !== id));
  };

  const removeRequest = (reqId) => {
    if (!requireUser()) return;
    const r = requests.find((x) => x.id === reqId);
    setRequests((rs) => rs.filter((x) => x.id !== reqId));
    if (r) record({ kind: "request", empId: r.empId, name: r.name, date: "—",
      from: r.status, to: "removed", why: "request removed from the list" });
  };

  const declineRequest = (reqId) => {
    setRequests((rs) => rs.map((r) => r.id === reqId
      ? { ...r, status: "declined", actionedBy: user || "unsigned", actionedAt: nowStamp() } : r));
  };

  const crews = ["All", ...Array.from(new Set(employees.map((e) => e.crew)))];
  const cats = ["All", ...Array.from(new Set(employees.map((e) => e.category)))];
  const sortedEmployees = employees.slice().sort(bySurname);
  /* A pick can be left over from clicking a roster check, and ids change when the
     roster is reimported. Anything that no longer matches a person is ignored. */
  const livePicked = picked.filter((id) => employees.some((e) => e.id === id));
  const visibleEmployees = sortedEmployees.filter((e) => {
    if (livePicked.length) return livePicked.includes(e.id);
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
    ["people","People"],["flights","Flights"],["histogram","Histogram"],["noshow","No shows"],
    ["audit","Change log"],["help","Guide"]];

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
        {profile ? (
          <>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{profile.name}</span>
            <span style={{ fontFamily: mono, fontSize: 10, color: "#FFF", background: C.dim,
              padding: "2px 7px", borderRadius: 2, textTransform: "uppercase",
              letterSpacing: ".08em" }}>
              {profile.role === "admin" ? "admin" : "supervisor"}
            </span>
            <Btn small onClick={() => signOut()}>Sign out</Btn>
          </>
        ) : (
          <>
            <select value={user} onChange={(e) => setUser(e.target.value)}>
              <option value="">— select your name —</option>
              {USERS.map((u) => <option key={u}>{u}</option>)}
            </select>
            {!user && <span style={{ fontFamily: mono, fontSize: 11, color: C.red }}>
              Pick your name so changes are attributed.</span>}
          </>
        )}
        <div style={{ display: "flex", gap: 14, marginLeft: "auto", alignItems: "center", flexWrap: "wrap" }}>
          <span title="Counts look ahead 90 days from the date shown"
            style={{ fontFamily: disp, fontSize: 11, letterSpacing: ".1em", color: C.dimmer,
              textTransform: "uppercase" }}>next 90 days</span>
          <Stat label="Coverage" n={upcoming.length} bad={upcoming.some((a) => a.sev === "critical")} />
          <Stat label="Roster checks" n={upcomingAnomalies.length} bad={upcomingAnomalies.some((a) => a.sev === "critical")} />
          <Stat label="Travel to request" n={toRequestCount} bad={false} />
          <Stat label="Requests" n={pendingRequests} bad={false} />
          {remoteNote && (
            <span title={`Updated ${fmtStamp(remoteNote)}`} style={{ fontFamily: mono, fontSize: 10.5,
              color: "#FFF", background: C.ok, padding: "2px 7px", borderRadius: 2 }}>
              updated by someone else
            </span>
          )}
          <span style={{ fontFamily: mono, fontSize: 10.5, color: sync.state === "error" ? C.red : C.dimmer }}>
            {sync.state === "saving" ? "saving…"
              : sync.state === "loading" ? "loading…"
              : sync.state === "error" ? "NOT SAVED"
              : sync.at ? `${STORAGE_MODE === "local" ? "saved to this browser" : "shared roster"} ${fmtStamp(sync.at)}`
              : STORAGE_MODE === "local" ? "nothing saved yet" : "shared roster"}
          </span>
          <Btn small onClick={loadShared}>Refresh</Btn>
        </div>
      </div>

      {sync.state === "error" && (
        <div style={{ background: "#FCEAE7", borderBottom: `2px solid ${C.red}`,
          padding: "11px 18px" }}>
          <div style={{ fontFamily: disp, fontSize: 14, letterSpacing: ".08em",
            textTransform: "uppercase", color: C.red, fontWeight: 700 }}>
            Your last change has not been saved
          </div>
          <div style={{ fontSize: 13, marginTop: 4, lineHeight: 1.55 }}>
            Everything is still on screen and nothing is lost — but it is only in this browser, so
            do not sign out or close the tab yet. Press Retry. If it keeps failing, use{" "}
            <b>Export to Excel</b> on the Roster tab to keep a copy, then send the wording below.
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
            <Btn primary onClick={() => setRetry((n) => n + 1)}>Retry the save</Btn>
            {sync.why && (
              <span style={{ fontFamily: mono, fontSize: 10.5, color: C.red }}>{sync.why}</span>
            )}
          </div>
        </div>
      )}

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
          thresholds, upcoming, upcomingAnomalies, jumpTo, toRequestCount, setView,
          dismissAnomaly, actions, markActionDone, employees, watchList: watch }} />}
        {view === "grid" && <Grid {...{ watch, notes, setNote, leaveDays, visibleEmployees, employees, gridStart, setGridStart, gridDays,
          setGridDays, cellW, setCellW, codeFor, setCell, brush, setBrush, painting, setPainting, daily, dayIndex,
          undo, undoStack,
          thresholds, crews, cats, crewFilter, setCrewFilter, catFilter, setCatFilter, search,
          setSearch, picked, setPicked, focusDate, setFocusDate, overrides, menu, setMenu, anomalies }} />}
        {view === "leave" && <Leave {...{ employees, leaveRecords, addLeave, removeLeave, focusDate,
          missingLeave, reinstateLeave, unregisteredLeave, registerLeave }} />}
        {view === "travel" && <Travel {...{ employees, travel, setTravel, setCell, actions, user,
          applyTravelBatch, markActionDone, watch, confirmWatch, clearWatch,
          removeTravel }} />}
        {view === "requests" && <Requests {...{ employees, requests, submitRequest, markRequested,
          declineRequest, removeRequest, codeFor, focusDate, problemsFromChanges }} />}
        {view === "people" && <People {...{ employees, updateEmployee, changePattern,
          removePatternSegment, thresholds, setThresholds, focusDate, addPerson,
          customPatterns, savePattern, deletePattern, loadImported, isAdmin, requireAdmin,
          userName: user }} />}
        {view === "flights" && <Flights />}
        {view === "histogram" && <Histogram {...{ daily, dayIndex, focusDate, thresholds }} />}
        {view === "noshow" && <NoShow {...{ employees, noShows, addNoShow, removeNoShow }} />}
        {view === "audit" && <Audit {...{ log }} />}
        {view === "help" && <Help />}
      </div>

      {denied && (
        <div onClick={() => setDenied(false)} style={{ position: "fixed", inset: 0,
          background: "rgba(49,33,34,.45)", zIndex: 120, display: "flex",
          alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.panel,
            border: `1px solid ${C.line2}`, borderTop: `4px solid ${C.orange}`, maxWidth: 440,
            boxShadow: "0 18px 50px rgba(49,33,34,.3)" }}>
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.line}`,
              fontFamily: disp, fontSize: 17, letterSpacing: ".1em", textTransform: "uppercase",
              color: C.orange, fontWeight: 700 }}>The office changes this</div>
            <div style={{ padding: "14px 18px", fontSize: 13.5, lineHeight: 1.6 }}>
              Personnel records, roster patterns and coverage minimums are kept by the
              administrators. Ask Jaki and she can make the change.
              <div style={{ marginTop: 8, color: C.dim }}>
                The roster itself, leave and travel requests are all still yours to change.
              </div>
            </div>
            <div style={{ padding: "12px 18px", borderTop: `1px solid ${C.line}` }}>
              <Btn onClick={() => setDenied(false)}>Close</Btn>
            </div>
          </div>
        </div>
      )}

      {blocked && (
        <div onClick={() => setBlocked(false)} style={{ position: "fixed", inset: 0,
          background: "rgba(49,33,34,.45)", zIndex: 120, display: "flex",
          alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.panel,
            border: `1px solid ${C.line2}`, borderTop: `4px solid ${C.red}`, maxWidth: 460,
            boxShadow: "0 18px 50px rgba(49,33,34,.3)" }}>
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.line}`,
              fontFamily: disp, fontSize: 17, letterSpacing: ".1em", textTransform: "uppercase",
              color: C.red, fontWeight: 700 }}>Select your name first</div>
            <div style={{ padding: "14px 18px", fontSize: 13.5, lineHeight: 1.55 }}>
              Nothing can be changed until the <strong>Working as</strong> field at the top has a
              name in it. Every change is recorded against whoever made it.
              {!profile && (
                <div style={{ marginTop: 12 }}>
                  <select value={user} onChange={(e) => { setUser(e.target.value); if (e.target.value) setBlocked(false); }}
                    style={{ width: "100%" }}>
                    <option value="">— select your name —</option>
                    {USERS.map((u) => <option key={u}>{u}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div style={{ padding: "12px 18px", borderTop: `1px solid ${C.line}` }}>
              <Btn onClick={() => setBlocked(false)}>Close</Btn>
            </div>
          </div>
        </div>
      )}

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
  upcomingAnomalies, jumpTo, toRequestCount, setView, dismissAnomaly, actions, markActionDone,
  employees, watchList }) {
  const railStart = Math.max(0, (dayIndex[focusDate] || 0) - 7);
  const rail = daily.slice(railStart, railStart + 90);
  const maxOps = Math.max(12, ...rail.map((d) => d.counts.ops));

  const watchCount = Object.keys(watchList || {}).length;
  const [alertFrom, setAlertFrom] = useState(focusDate);
  const [alertTo, setAlertTo] = useState(addDays(focusDate, 90));
  const [alertType, setAlertType] = useState("All");
  const openActions = actions.filter((a) => !a.done);

  const filteredAlerts = useMemo(() => {
    const rows = upcoming
      .filter((a) => a.iso >= alertFrom && a.iso <= alertTo && (alertType === "All" || a.metric === alertType))
      .sort((a, b) => (a.metric === b.metric ? (a.iso < b.iso ? -1 : 1) : a.metric < b.metric ? -1 : 1));
    /* consecutive days of the same shortfall read as one line */
    const out = [];
    rows.forEach((a) => {
      const last = out[out.length - 1];
      if (last && last.metric === a.metric && last.have === a.have && last.need === a.need
        && last.over === a.over
        && diffDays(a.iso, last.to) === 1) { last.to = a.iso; last.days++; return; }
      out.push({ ...a, to: a.iso, days: 1 });
    });
    return out.sort((a, b) => (a.iso < b.iso ? -1 : 1));
  }, [upcoming, alertFrom, alertTo, alertType]);

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(148px, 1fr))", gap: 10 }}>
        <Tile label="Total on site" value={today.total} sub="all categories" state="ok" />
        {METRICS.map((m) => {
          const have = today.counts[m.id], min = thresholds[m.id];
          const wrong = m.exact ? have !== min : have < min;
          const state = !min ? "" : wrong ? (have === 0 ? "bad" : "warn") : "ok";
          const sub = m.id === "ops"
            ? `${today.opsDay} DS · ${today.opsNight} NS${today.acting ? " · 1 acting §26" : ""}`
            : min ? (m.exact
                ? `should be ${min}${have > min ? ` · ${have - min} too many` : have < min ? ` · short ${min - have}` : ""}`
                : `min ${min}${have < min ? ` · short ${min - have}` : ""}`)
              : "no minimum";
          return <Tile key={m.id} label={m.name} value={have} sub={sub}
            state={state} onClick={() => jumpTo(focusDate)} />;
        })}
        <Tile label="Travel to request" value={toRequestCount} sub="next 90 days"
          state={toRequestCount ? "warn" : "ok"} onClick={() => setView("grid")} />
        <Tile label="Waitlisted seats" value={watchCount} sub="keep checking with FMG"
          state={watchCount ? "bad" : "ok"} onClick={() => setView("travel")} />
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
        <Panel title="Coverage alerts" note={`${filteredAlerts.length} in range`} pad={0}>
          <div style={{ padding: "9px 14px", borderBottom: `1px solid ${C.line}`, display: "flex",
            gap: 8, alignItems: "center", flexWrap: "wrap", background: C.panel2 }}>
            <input type="date" value={alertFrom} onChange={(e) => setAlertFrom(e.target.value)} />
            <span style={{ fontFamily: mono, fontSize: 11, color: C.dim }}>to</span>
            <input type="date" value={alertTo} onChange={(e) => setAlertTo(e.target.value)} />
            <select value={alertType} onChange={(e) => setAlertType(e.target.value)}>
              <option value="All">All types</option>
              {METRICS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {filteredAlerts.length === 0 && <div style={{ padding: 18, color: C.dim, fontFamily: mono, fontSize: 12 }}>
              No coverage breaches in that range.</div>}
            {filteredAlerts.map((a, i) => (
              <div key={i} onClick={() => jumpTo(a.iso)} style={{ display: "flex", alignItems: "center", gap: 12,
                padding: "8px 14px", borderBottom: `1px solid ${C.line}`, cursor: "pointer",
                borderLeft: `3px solid ${a.sev === "critical" ? C.red : C.orange}` }}>
                <div style={{ fontFamily: mono, fontSize: 11, color: C.dim, width: 128 }}>
                  {a.days > 1 ? `${fmtShort(a.iso)} – ${fmtShort(a.to)}` : `${DOW[dow(a.iso)]} ${fmtShort(a.iso)}`}
                </div>
                <div style={{ fontSize: 12.5, flex: 1 }}>{a.name}
                  {a.over && <span style={{ fontFamily: mono, fontSize: 10.5, color: C.orange,
                    marginLeft: 7 }}>more than needed</span>}
                  {a.days > 1 && <span style={{ fontFamily: mono, fontSize: 10.5, color: C.dim,
                    marginLeft: 7 }}>{a.days} days</span>}</div>
                <div style={{ fontFamily: mono, fontSize: 12, color: a.sev === "critical" ? C.red : C.dim }}>
                  {a.have} / {a.need}</div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Roster checks"
          note={`${upcomingAnomalies.length + openActions.length} open · click to go to the person and date`} pad={0}>
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {upcomingAnomalies.length === 0 && openActions.length === 0 && (
              <div style={{ padding: 18, color: C.dim, fontFamily: mono, fontSize: 12 }}>
                Nothing flagged. Every swing has travel in, work days, then travel out.</div>
            )}

            {upcomingAnomalies.map((a, i) => (
              <div key={"a" + i} style={{ padding: "8px 14px", borderBottom: `1px solid ${C.line}`,
                borderLeft: `3px solid ${a.sev === "critical" ? C.red : C.orange}`,
                display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{ flex: 1, cursor: "pointer" }} onClick={() => jumpTo(a.iso, a.empId)}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{a.name}
                    <span style={{ fontFamily: mono, fontSize: 10.5, color: C.dim, marginLeft: 8 }}>
                      {fmtShort(a.iso)}</span></div>
                  <div style={{ fontSize: 12, color: C.dim, marginTop: 1 }}>{a.msg}</div>
                </div>
                <Btn small onClick={() => dismissAnomaly(a)}>Checked</Btn>
              </div>
            ))}

            {openActions.map((a) => {
              const emp = employees.find((e) => a.subject.includes(e.name));
              return (
                <div key={a.id} style={{ padding: "8px 14px", borderBottom: `1px solid ${C.line}`,
                  borderLeft: `3px solid ${C.orange}`, display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <div style={{ flex: 1, cursor: emp ? "pointer" : "default" }}
                    onClick={() => emp && jumpTo(focusDate, emp.id)}>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>{a.subject}</div>
                    <div style={{ fontSize: 12, color: C.dim, marginTop: 1 }}>
                      {a.kind === "travel" ? "Travel action" : "Request"} · raised by {a.by}
                    </div>
                  </div>
                  <Btn small onClick={() => markActionDone(a.id)}>Requested</Btn>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
    </div>
  );
}

/* ============================================================
   ROSTER GRID
   ============================================================ */

function Grid({ watch, notes, setNote, leaveDays, visibleEmployees, employees, gridStart, setGridStart, gridDays, setGridDays, cellW,
  setCellW, codeFor, undo, undoStack,
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
          {(picked.length > 0 || search.trim() || crewFilter !== "All" || catFilter !== "All") && (
            <Btn small danger onClick={() => { setPicked([]); setSearch("");
              setCrewFilter("All"); setCatFilter("All"); }}>Show everyone</Btn>
          )}
          <span style={{ fontFamily: mono, fontSize: 11, color: C.dim, marginLeft: "auto" }}>
            showing {visibleEmployees.length} of {employees.length}</span>
          <Btn primary onClick={() => {
            const head = ["Employee", "SAP No", "Crew", "Pattern", "Category", "Position"]
              .concat(gridDates.map((d) => fmtShort(d)));
            const rows = [
              [`Syncline Haulage roster  ${fmtShort(gridDates[0])} to ${fmtShort(gridDates[gridDays - 1])}`],
              [], head,
            ];
            visibleEmployees.forEach((emp) => {
              const seg = segmentFor(emp, gridStart);
              rows.push([emp.name, emp.sap || "", emp.crew, seg ? seg.pattern : "", emp.category, emp.position]
                .concat(gridDates.map((d) => codeText(codeFor(emp, d)))));
            });
            rows.push([]);
            rows.push(["Operators on site", "", "", "", "", ""]
              .concat(gridDates.map((d) => (daily[dayIndex[d]] ? daily[dayIndex[d]].counts.ops : ""))));
            rows.push(["Section 26 on site", "", "", "", "", ""]
              .concat(gridDates.map((d) => (daily[dayIndex[d]] ? daily[dayIndex[d]].counts.s26 : ""))));
            downloadCsv(`syncline-roster-${gridDates[0]}.csv`, rows);
          }}>Export to Excel</Btn>
        </div>

        {showPicker && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.line}`,
            display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 4 }}>
            {employees.slice().sort(bySurname).map((e) => (
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
        <div style={{ width: 1, height: 22, background: C.line }} />
        <Btn small danger onClick={undo} disabled={!undoStack.length}>
          {undoStack.length ? `Undo — ${undoStack[0].label}` : "Undo"}
        </Btn>
        <Btn small onClick={() => setBrush("__clear")}>Clear cells</Btn>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontFamily: disp, fontSize: 11.5, letterSpacing: ".12em", color: C.dim }}>TRAVEL</span>
          {[["FIA", "to request"], ["FIA-TBC", "requested"], ["C-FIA", "confirmed"],
            ["FOP-WL", "waitlisted"]].map(([c, l]) => (
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
                    <span style={{ color: d.counts.ns !== thresholds.ns ? C.red : C.dimmer }}>{d.counts.ns}</span>
                    <span style={{ color: C.line2 }}>·</span>
                    <span style={{ color: d.counts.grader < thresholds.grader ? C.red : C.dimmer }}>{d.counts.grader}</span>
                  </> : ""}
                </div>
              );
            })}
          </div>

          {visibleEmployees.length === 0 && (
            <div style={{ padding: "22px 16px", borderTop: `1px solid ${C.line}` }}>
              <div style={{ fontSize: 13.5, marginBottom: 10 }}>
                <b>Nobody is showing</b> because of the filters above
                {picked.length ? " — people have been picked from the list" : ""}
                {search.trim() ? ` — the find box says "${search.trim()}"` : ""}
                {crewFilter !== "All" ? ` — crew ${crewFilter} only` : ""}
                {catFilter !== "All" ? ` — ${catFilter} only` : ""}.
              </div>
              <Btn primary onClick={() => { setPicked([]); setSearch("");
                setCrewFilter("All"); setCatFilter("All"); }}>Show everyone</Btn>
            </div>
          )}

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
                    {emp.sap ? emp.sap + " · " : ""}{emp.crew} · {seg ? seg.pattern : "—"}
                    {emp.grader && " · GRD"}{emp.leadingHand && " · LH"}
                  </div>
                </div>
                {gridDates.map((iso) => {
                  const code = codeFor(emp, iso);
                  /* A day set by hand shows even outside the mobilisation dates —
                     medicals, inductions and training all happen before someone
                     mobilises. Only untouched days are hatched. */
                  const outside = (emp.mobeDate && iso < emp.mobeDate)
                    || (emp.demobDate && iso > emp.demobDate);
                  const preMobe = outside && !code;
                  const postDemob = false;
                  const [bg, fg, br] = codeStyle(code);
                  const isOverride = (emp.id + "|" + iso) in overrides;
                  const st = travelState(code);
                  const anom = anomalyMap[emp.id + "|" + iso];
                  const wl = watch[emp.id + "|" + iso];
                  const note = notes[emp.id + "|" + iso];
                  /* the flight and the leave share the day, so show both */
                  const lv = leaveDays[emp.id + "|" + iso];
                  const both = lv && movementOf(code) ? lv : null;
                  const strip = wl ? { code: wl.code, kind: "wl" }
                    : both ? { code: both, kind: "leave" } : null;
                  return (
                    <div key={iso} className="cell"
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => {
                        if (brush === "__select") { openMenu(e, emp, iso); return; }
                        setPainting(true); setCell(emp.id, iso, brush);
                      }}
                      onMouseEnter={() => { if (painting && brush !== "__select") setCell(emp.id, iso, brush); }}
                      title={`${emp.name} · ${fmtLong(iso)} · ${preMobe ? "not yet mobilised"
                        : code ? (CODES[code] ? CODES[code].label : code)
                        : outside ? "outside the mobilisation dates" : "not rostered"}${
                        wl ? "\nAlso waitlisted: " + (CODES[wl.code] ? CODES[wl.code].label : wl.code) : ""}${
                        both ? "\nCounts as a leave day: " + (CODES[both] ? CODES[both].label : both) : ""}${
                        note ? "\nNote: " + note.text : ""}${
                        anom ? " — " + anom.msg : ""}`}
                      style={{ width: CW, flex: `0 0 ${CW}px`, height: 30, color: fg,
                        background: preMobe || postDemob
                          ? "repeating-linear-gradient(45deg, #F3EEEA, #F3EEEA 3px, #E5DED8 3px, #E5DED8 6px)" : bg,
                        borderRight: `1px solid ${C.line}`, display: "flex", alignItems: "center",
                        justifyContent: "center", fontFamily: mono, fontSize: CW >= 32 ? 9 : 7.5,
                        cursor: "cell", userSelect: "none", position: "relative",
                        boxShadow: st && st !== "confirmed" ? `inset 0 0 0 2px ${br}` : "none" }}>
                      {preMobe || postDemob ? "" : showText
                        ? (strip ? <span style={{ marginTop: -8 }}>{codeText(code)}</span> : codeText(code))
                        : ""}
                      {strip && !preMobe && !postDemob && (
                        <div title={strip.kind === "wl"
                          ? `Also waitlisted: ${CODES[strip.code] ? CODES[strip.code].label : strip.code}`
                          : `Counts as a leave day: ${CODES[strip.code] ? CODES[strip.code].label : strip.code}`}
                          style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 11,
                            background: strip.kind === "wl" ? "#FCE2DE" : codeStyle(strip.code)[0],
                            color: strip.kind === "wl" ? "#9B2B22" : codeStyle(strip.code)[1],
                            fontFamily: mono,
                            fontSize: CW >= 32 ? 7.5 : 6.5, lineHeight: "11px", textAlign: "center",
                            borderTop: `1px ${strip.kind === "wl" ? "dashed" : "solid"} ${
                              strip.kind === "wl" ? C.red : codeStyle(strip.code)[2]}`,
                            overflow: "hidden" }}>
                          {CW >= 26 ? strip.code : (strip.kind === "wl" ? "WL" : strip.code)}
                        </div>
                      )}
                      {isOverride && !preMobe && !postDemob && (
                        <div style={{ position: "absolute", top: 1, right: 1, width: 4, height: 4,
                          background: C.red, borderRadius: "50%" }} />
                      )}
                      {note && (
                        <div style={{ position: "absolute", top: 0, left: 0, width: 0, height: 0,
                          borderTop: `7px solid ${C.orange}`, borderRight: "7px solid transparent" }} />
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
        A pink strip along the bottom of a cell is a waitlisted seat running alongside — keep checking it.
        An orange corner at the top left means there is a note on that day; hover to read it.
        A coloured strip under a flight is leave running on the same day — the travel happens, and
        the day still counts as leave.
      </div>

      {menu && (
        <div onClick={(e) => e.stopPropagation()} style={{ position: "fixed", left: menu.x, top: menu.y,
          background: C.panel, border: `1px solid ${C.line2}`, zIndex: 50, minWidth: 248,
          boxShadow: "0 10px 30px rgba(49,33,34,.22)", maxHeight: 430, overflowY: "auto", borderRadius: 2 }}>
          <div style={{ padding: "8px 10px", borderBottom: `1px solid ${C.line}`, fontFamily: mono,
            fontSize: 10.5, color: C.dim, background: C.panel2 }}>
            {menu.emp.name}<br />{fmtLong(menu.iso)}
          </div>
          {[["1", "Day shift"], ["NS", "Night shift"], ["RR", "R & R"], ["SD", "Stand down"],
            ["AL", "Annual leave"], ["SL", "Sick leave"], ["TR", "Training course"],
            ["PEM", "Pre-employment medical"], ["F2F", "Face to face induction"],
            ["CRS", "Course"]].map(([code, label]) => (
            <MenuItem key={code} code={code} label={label}
              onClick={() => { setCell(menu.emp.id, menu.iso, code, "roster edit", { validate: true }); setMenu(null); }} />
          ))}
          <div style={{ padding: "6px 10px", fontFamily: disp, fontSize: 11.5, letterSpacing: ".12em",
            color: C.dim, background: C.panel2, borderTop: `1px solid ${C.line}` }}>
            TRAVEL — to request / TBC / waitlisted / confirmed
          </div>
          {["FIA", "FIP", "FOA", "FOP", "DT"].map((mv) => (
            <div key={mv} style={{ display: "flex", alignItems: "center", borderBottom: `1px solid ${C.line}` }}>
              <div style={{ width: 42, padding: "6px 8px", fontFamily: mono, fontSize: 11, color: C.dim }}>{mv}</div>
              {["toRequest", "requested", "waitlisted", "confirmed"].map((st) => {
                const code = travelCode(mv, st);
                const [bg, fg, br] = codeStyle(code);
                return (
                  <div key={st} onClick={() => { setCell(menu.emp.id, menu.iso, code, "travel edit", { validate: true }); setMenu(null); }}
                    title={CODES[code].label}
                    style={{ flex: 1, padding: "5px 4px", cursor: "pointer", textAlign: "center",
                      fontFamily: mono, fontSize: 9, background: bg, color: fg,
                      border: `1px solid ${br}`, borderStyle: st === "requested" ? "dashed" : "solid",
                      margin: 2 }}>
                    {st === "toRequest" ? "req" : st === "requested" ? "TBC"
                      : st === "waitlisted" ? "WL" : "C-"}
                  </div>
                );
              })}
            </div>
          ))}
          <MenuItem code="__clear" label="Back to pattern"
            onClick={() => { setCell(menu.emp.id, menu.iso, "__clear", "back to pattern", { validate: true }); setMenu(null); }} />
          <div style={{ padding: "8px 10px", borderTop: `1px solid ${C.line}`, background: C.panel2 }}>
            <div style={{ fontFamily: disp, fontSize: 11, letterSpacing: ".12em", color: C.dim,
              textTransform: "uppercase", marginBottom: 4 }}>Note for this day</div>
            <textarea rows={2} defaultValue={(notes[menu.emp.id + "|" + menu.iso] || {}).text || ""}
              placeholder="excess baggage, a phone call, anything worth recording"
              style={{ width: "100%" }}
              onBlur={(e) => setNote(menu.emp.id, menu.iso, e.target.value)} />
            {notes[menu.emp.id + "|" + menu.iso] && (
              <div style={{ fontFamily: mono, fontSize: 9.5, color: C.dimmer, marginTop: 3 }}>
                {notes[menu.emp.id + "|" + menu.iso].by} ·{" "}
                {fmtStamp(notes[menu.emp.id + "|" + menu.iso].at)}
              </div>
            )}
            <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
              <Btn small primary onClick={() => setMenu(null)}>Save and close</Btn>
            </div>
          </div>
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

function Leave({ employees, leaveRecords, addLeave, removeLeave, focusDate,
  missingLeave, reinstateLeave, unregisteredLeave, registerLeave }) {
  const [empId, setEmpId] = useState(employees[6] ? employees[6].id : 1);
  const [code, setCode] = useState("AL");
  const [from, setFrom] = useState(focusDate);
  const [to, setTo] = useState(addDays(focusDate, 6));
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");

  const submit = () => {
    if (to < from) { setErr("End date is before the start date."); return; }
    const res = addLeave({ empId: Number(empId), code, from, to, note });
    if (res && res.error) { setErr(res.error); return; }
    setErr("");
    setNote("");
  };

  /* ---- filters ---- */
  const [q, setQ] = useState("");
  const [fType, setFType] = useState("All");
  const [fBy, setFBy] = useState("All");
  const [fWhen, setFWhen] = useState("All");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");

  const today = toISO(new Date());
  const nameOf = (r) => {
    const e = employees.find((x) => x.id === r.empId);
    return e ? e.name : "";
  };

  const types = ["All", ...Array.from(new Set(leaveRecords.map((r) => r.code))).sort()];
  const enteredBy = ["All", ...Array.from(new Set(leaveRecords.map((r) => r.by).filter(Boolean))).sort()];

  const filtered = leaveRecords.filter((r) => {
    if (fType !== "All" && r.code !== fType) return false;
    if (fBy !== "All" && r.by !== fBy) return false;
    if (fWhen === "Current" && !(r.from <= today && r.to >= today)) return false;
    if (fWhen === "Upcoming" && !(r.from > today)) return false;
    if (fWhen === "Past" && !(r.to < today)) return false;
    /* a date range shows any leave that overlaps it */
    if (fFrom && r.to < fFrom) return false;
    if (fTo && r.from > fTo) return false;
    if (q.trim()) {
      const needle = q.toLowerCase();
      const hay = `${nameOf(r)} ${r.code} ${r.note || ""} ${r.by || ""}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  const totalDays = filtered.reduce((n, r) => n + diffDays(r.to, r.from) + 1, 0);
  const anyFilter = q || fType !== "All" || fBy !== "All" || fWhen !== "All" || fFrom || fTo;
  const clearAll = () => { setQ(""); setFType("All"); setFBy("All"); setFWhen("All");
    setFFrom(""); setFTo(""); };

  const sorted = filtered.slice().sort((a, b) => (a.from < b.from ? 1 : -1));
  const th = { textAlign: "left", padding: "7px 10px", fontFamily: disp, fontSize: 11.5,
    letterSpacing: ".12em", color: C.dim, textTransform: "uppercase", borderBottom: `1px solid ${C.line2}` };
  const td = { padding: "6px 10px", borderBottom: `1px solid ${C.line}`, fontSize: 12.5 };

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {missingLeave && missingLeave.length > 0 && (
        <Panel title="Leave not showing on the roster"
          note={`${missingLeave.length} day${missingLeave.length === 1 ? "" : "s"}`}>
          <div style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 10 }}>
            These days are on the leave register but the roster shows something else. Reinstating
            writes the leave back onto those days. Days where travel falls inside the leave are left
            alone — the flight still happens and shows the leave alongside it.
          </div>
          <div style={{ maxHeight: 150, overflowY: "auto", marginBottom: 10 }}>
            {missingLeave.slice(0, 60).map((x, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "center",
                fontFamily: mono, fontSize: 11, padding: "2px 0", color: C.dim }}>
                <span style={{ width: 108 }}>{fmtShort(x.iso)}</span>
                <span style={{ flex: 1, color: C.ink }}>{x.name}</span>
                <span>{codeText(x.now)} → {x.want}</span>
              </div>
            ))}
            {missingLeave.length > 60 && (
              <div style={{ fontFamily: mono, fontSize: 10.5, color: C.dimmer, marginTop: 4 }}>
                and {missingLeave.length - 60} more
              </div>
            )}
          </div>
          <Btn primary onClick={reinstateLeave}>
            Reinstate {missingLeave.length} leave day{missingLeave.length === 1 ? "" : "s"}
          </Btn>
        </Panel>
      )}

      {unregisteredLeave && unregisteredLeave.length > 0 && (
        <Panel title="Leave on the roster but not on the register"
          note={`${unregisteredLeave.length} block${unregisteredLeave.length === 1 ? "" : "s"}`}>
          <div style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 10 }}>
            These days are marked as leave on the roster but no record covers them — usually leave
            painted straight onto the grid rather than entered here. Adding them to the register
            means they show up in searches, totals and exports.
          </div>
          <div style={{ maxHeight: 160, overflowY: "auto", marginBottom: 10 }}>
            {unregisteredLeave.slice(0, 60).map((x, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "center",
                fontFamily: mono, fontSize: 11, padding: "2px 0", color: C.dim }}>
                <span style={{ flex: 1, color: C.ink }}>{x.name}</span>
                <span>{x.code}</span>
                <span style={{ width: 200 }}>{fmtShort(x.from)} – {fmtShort(x.to)}</span>
                <span style={{ width: 54 }}>{x.days}d</span>
              </div>
            ))}
            {unregisteredLeave.length > 60 && (
              <div style={{ fontFamily: mono, fontSize: 10.5, color: C.dimmer, marginTop: 4 }}>
                and {unregisteredLeave.length - 60} more
              </div>
            )}
          </div>
          <Btn primary onClick={registerLeave}>
            Add {unregisteredLeave.length} block{unregisteredLeave.length === 1 ? "" : "s"} to the register
          </Btn>
        </Panel>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 370px) 1fr", gap: 18 }}>
      <Panel title="Enter leave">
        <Field label="Employee">
          <select value={empId} onChange={(e) => setEmpId(e.target.value)} style={{ width: "100%" }}>
            {employees.slice().sort(bySurname).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
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

      <Panel title="Leave register"
        note={`${filtered.length} of ${leaveRecords.length} records · ${totalDays} days`} pad={0}>
        <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.line}`, background: C.panel2,
          display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontFamily: disp, fontSize: 12, letterSpacing: ".12em", color: C.dim }}>FIND</span>
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="name, note or who entered it" style={{ width: 220 }} />
          <select value={fType} onChange={(e) => setFType(e.target.value)}>
            {types.map((t) => <option key={t} value={t}>
              {t === "All" ? "All types" : `${t} · ${CODES[t] ? CODES[t].label : t}`}</option>)}
          </select>
          <select value={fWhen} onChange={(e) => setFWhen(e.target.value)}>
            <option value="All">Any time</option>
            <option value="Current">On leave now</option>
            <option value="Upcoming">Still to come</option>
            <option value="Past">Finished</option>
          </select>
          <span style={{ fontFamily: disp, fontSize: 12, letterSpacing: ".12em", color: C.dim }}>BETWEEN</span>
          <input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} />
          <input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} />
          <select value={fBy} onChange={(e) => setFBy(e.target.value)}>
            {enteredBy.map((b) => <option key={b} value={b}>{b === "All" ? "Anyone" : b}</option>)}
          </select>
          {anyFilter && <Btn small danger onClick={clearAll}>Clear filters</Btn>}
          <Btn small disabled={!filtered.length} onClick={() => downloadCsv("leave-register.csv", [
            ["Employee", "Type", "Description", "From", "To", "Days", "Note", "Entered by", "Entered at"],
            ...sorted.map((r) => [nameOf(r), r.code, CODES[r.code] ? CODES[r.code].label : "",
              r.from, r.to, diffDays(r.to, r.from) + 1, r.note || "", r.by || "", r.at || ""]),
          ])}>Export to Excel</Btn>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr>
              <th style={th}>Employee</th><th style={th}>Type</th><th style={th}>From</th>
              <th style={th}>To</th><th style={th}>Days</th><th style={th}>Note</th>
              <th style={th}>Entered by</th><th style={th}></th>
            </tr></thead>
            <tbody>
              {sorted.length === 0 && <tr><td style={{ ...td, color: C.dim, fontFamily: mono }} colSpan={8}>
                {leaveRecords.length ? "Nothing matches those filters." : "No leave recorded."}</td></tr>}
              {sorted.map((r) => {
                const emp = employees.find((e) => e.id === r.empId);
                const on = r.from <= today && r.to >= today;
                return (
                  <tr key={r.id} style={{ background: on ? "#FDF4EE" : "transparent" }}>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      {emp ? emp.name : "?"}
                      {on && <span style={{ fontFamily: mono, fontSize: 9.5, color: C.orange,
                        marginLeft: 6 }}>on leave now</span>}
                    </td>
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

function Travel({ employees, travel, setTravel, setCell, actions, user, applyTravelBatch,
  markActionDone, watch, confirmWatch, clearWatch, removeTravel }) {
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
      let mapped = parsed.map((m, i) => {
        const emp = matchEmployee(m.name, employees);
        const st = m.status || "";
        const state = /wait/i.test(st) ? "waitlisted"
          : m.confirmed === false ? "requested" : "confirmed";
        const mvf = movementFrom(m);
        return { key: i, raw: m.name, empId: emp ? emp.id : "", date: m.date || "",
          movement: mvf, state, flight: m.flight || "", status: st, use: !!emp,
          advice: m.date ? travelAdvice(m.date, travelCode(mvf, state)) : null };
      });

      /* FMG sometimes list two seats on the same leg — one held, one waitlisted.
         Keep the confirmed one and leave the other unticked with a note. */
      mapped.forEach((r) => {
        if (!r.empId) return;
        if (r.state === "waitlisted") return;
        const same = mapped.filter((x) => x.empId === r.empId && x.date === r.date
          && x.state !== "waitlisted"
          && MOVEMENTS[x.movement] && MOVEMENTS[r.movement]
          && MOVEMENTS[x.movement].dir === MOVEMENTS[r.movement].dir);
        if (same.length < 2) return;
        const best = same.find((x) => x.state === "confirmed") || same[0];
        same.forEach((x) => {
          if (x === best) return;
          x.use = false;
          x.dup = `duplicate leg — ${best.flight || best.movement} is the one held`;
        });
      });

      /* someone flying in and back out on the same day is a day trip */
      const collapsed = [];
      mapped.forEach((r) => {
        const twin = collapsed.find((x) => x.empId && x.empId === r.empId && x.date === r.date
          && MOVEMENTS[x.movement] && MOVEMENTS[r.movement]
          && MOVEMENTS[x.movement].dir !== MOVEMENTS[r.movement].dir
          && MOVEMENTS[x.movement].dir !== "DAY");
        if (twin) {
          twin.movement = "DT";
          twin.flight = [twin.flight, r.flight].filter(Boolean).join(" / ");
          if (r.state === "requested") twin.state = "requested";
          return;
        }
        collapsed.push(r);
      });
      setRows(collapsed);
    } catch {
      setErr("Could not reach the travel reader. Check the site is online, or use manual entry.");
    }
    setBusy(false);
  };

  const applyRows = () => {
    const chosen = rows.filter((r) => r.use && r.empId && r.date)
      .map((r) => ({ ...r, empId: Number(r.empId) }));
    applyTravelBatch(chosen);
    chosen.forEach((r) => {
      const emp = employees.find((e) => e.id === r.empId);
      setTravel((t) => [...t, { id: uid("T"), empId: r.empId,
        name: emp ? emp.name : r.raw, date: r.date, code: travelCode(r.movement, r.state),
        flight: r.flight, source: fileName || "pasted email", by: user || "unsigned" }]);
    });
    setRows([]); setText(""); setPdf(null); setFileName("");
  };

  const th = { textAlign: "left", padding: "6px 8px", fontFamily: disp, fontSize: 11.5,
    letterSpacing: ".1em", color: C.dim, textTransform: "uppercase", borderBottom: `1px solid ${C.line2}` };
  const td = { padding: "5px 8px", borderBottom: `1px solid ${C.line}`, fontSize: 12 };
  const [showDone, setShowDone] = useState(false);

  /* ---- filters for the applied travel list ---- */
  const [tq, setTq] = useState("");
  const [tCode, setTCode] = useState("All");
  const [tFrom, setTFrom] = useState("");
  const [tTo, setTTo] = useState("");
  const travelCodes = Array.from(new Set(travel.map((t) => t.code))).sort();
  const shownTravel = travel.slice().reverse().filter((t) => {
    if (tCode !== "All" && t.code !== tCode) return false;
    if (tFrom && t.date < tFrom) return false;
    if (tTo && t.date > tTo) return false;
    if (tq.trim()) {
      const q = tq.toLowerCase();
      const hay = `${t.name} ${t.flight || ""} ${t.source || ""} ${t.by || ""} ${t.code}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const todayIso = toISO(new Date());
  const watchList = Object.keys(watch || {}).map((k) => {
    const bar = k.indexOf("|");
    const empId = Number(k.slice(0, bar));
    const iso = k.slice(bar + 1);
    const emp = employees.find((e) => e.id === empId);
    const item = watch[k] || {};
    return { key: k, empId, iso, name: emp ? emp.name : "?", code: item.code,
      why: item.why || "", days: diffDays(todayIso, iso) };
  }).sort((a, b) => (a.iso < b.iso ? -1 : 1));

  const allTravelActions = actions.filter((a) => a.kind === "travel");
  const travelActions = showDone ? allTravelActions : allTravelActions.filter((a) => !a.done);
  const doneCount = allTravelActions.filter((a) => a.done).length;

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {allTravelActions.length > 0 && (
        <Panel title="Travel actions required"
          note={`${allTravelActions.filter((a) => !a.done).length} open · tick once requested with FMG`} pad={0}>
          <div style={{ padding: "8px 16px", borderBottom: `1px solid ${C.line}`, background: C.panel2 }}>
            <Btn small active={showDone} onClick={() => setShowDone(!showDone)}>
              {showDone ? "Hide completed" : `Show completed (${doneCount})`}
            </Btn>
          </div>
          {travelActions.slice(0, 20).map((a) => (
            <div key={a.id} style={{ padding: "10px 16px", borderBottom: `1px solid ${C.line}`,
              borderLeft: `3px solid ${a.done ? C.ok : C.orange}`, opacity: a.done ? 0.6 : 1 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{a.subject}</div>
                  <pre style={{ margin: "5px 0 0", fontFamily: mono, fontSize: 11, color: C.dim,
                    whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{a.body}</pre>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12,
                  cursor: a.done ? "default" : "pointer", whiteSpace: "nowrap" }}>
                  <input type="checkbox" checked={!!a.done} disabled={!!a.done}
                    onChange={() => markActionDone(a.id)}
                    style={{ width: 15, height: 15, accentColor: C.red }} />
                  Requested in FMG workflow
                </label>
              </div>
              <div style={{ fontFamily: mono, fontSize: 10, color: C.dimmer, marginTop: 5 }}>
                {fmtStamp(a.at)} · {a.by} · {a.emailed ? "emailed" : "not emailed — email not configured"}
                {a.done && ` · marked requested ${fmtStamp(a.doneAt)} by ${a.doneBy}`}
              </div>
            </div>
          ))}
        </Panel>
      )}

      {watchList.length > 0 && (
        <Panel title="Waitlisted — keep checking"
          note={`${watchList.length} seat${watchList.length === 1 ? "" : "s"} not yet held by FMG`} pad={0}>
          {watchList.map((w) => (
            <div key={w.key} style={{ display: "flex", gap: 12, alignItems: "center",
              padding: "9px 16px", borderBottom: `1px solid ${C.line}`,
              borderLeft: `3px solid ${C.red}` }}>
              <div style={{ fontFamily: mono, fontSize: 11, color: C.dim, width: 78 }}>
                {fmtShort(w.iso)}</div>
              <div style={{ fontSize: 13, flex: 1, fontWeight: 500 }}>{w.name}</div>
              <Chip code={w.code} />
              <div style={{ fontFamily: mono, fontSize: 10.5, color: C.dim, width: 210,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.why}</div>
              <div style={{ fontFamily: mono, fontSize: 10, color: w.days > 7 ? C.red : C.dimmer,
                width: 92 }}>
                {w.days < 0 ? `${-w.days}d away` : w.days === 0 ? "today" : `${w.days}d past`}
              </div>
              <Btn small primary onClick={() => confirmWatch(w.empId, w.iso)}>Confirmed</Btn>
              <Btn small danger onClick={() => clearWatch(w.empId, w.iso)}>Drop</Btn>
            </div>
          ))}
          <div style={{ padding: "9px 16px", fontFamily: mono, fontSize: 10.5, color: C.dim,
            lineHeight: 1.6 }}>
            These sit alongside the roster rather than on it — nobody is counted as travelling on a
            waitlisted seat. Press Confirmed once FMG hold it and it goes onto the roster as a C- code.
          </div>
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
        <div style={{ fontFamily: mono, fontSize: 10.5, color: C.dim, marginTop: 10, lineHeight: 1.6 }}>
          Anything FMG hold a seat for — Confirmed or OverBooked — comes back as a C- code. Only
          Requested, Waitlisted or TBC come back as -TBC. The FMG says column shows their exact
          wording, so watch for OverBooked: the seat is held but it is worth keeping an eye on.
          Nothing is written until you check the lines and apply.
        </div>
      </Panel>

      {rows.length > 0 && (
        <Panel title="Check before applying" note={`${rows.filter((r) => r.use).length} of ${rows.length} selected`} pad={0}>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr>
                <th style={th}>Apply</th><th style={th}>Name in email</th><th style={th}>Matched to</th>
                <th style={th}>Date</th><th style={th}>Movement</th><th style={th}>Set as</th>
                <th style={th}>Code</th><th style={th}>Flight</th><th style={th}>FMG says</th>
              </tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.key} style={{ background: !r.empId ? "#FCEAE7"
                    : r.dup ? "#FDF4EE" : "transparent" }}>
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
                        {employees.slice().sort(bySurname).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
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
                        <option value="waitlisted">Waitlisted — track alongside</option>
                        <option value="requested">Requested (TBC)</option>
                        <option value="toRequest">Still to request</option>
                      </select>
                    </td>
                    <td style={td}><Chip code={travelCode(r.movement, r.state)} /></td>
                    <td style={{ ...td, fontFamily: mono, fontSize: 11, color: C.dim }}>{r.flight || "—"}</td>
                    <td style={{ ...td, fontFamily: mono, fontSize: 10.5,
                      color: /over|wait|pend/i.test(r.status) ? C.orange : C.dim }}>
                      {r.status || "—"}
                      {r.dup && <div style={{ color: C.orange, fontSize: 10, marginTop: 2 }}>{r.dup}</div>}
                      {r.advice && <div style={{ color: C.red, fontSize: 10, marginTop: 2,
                        whiteSpace: "normal", maxWidth: 260, lineHeight: 1.4 }}>{r.advice}</div>}
                    </td>
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

      <Panel title="Applied travel"
        note={`${shownTravel.length} of ${travel.length} movements`} pad={0}>
        <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.line}`, background: C.panel2,
          display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontFamily: disp, fontSize: 12, letterSpacing: ".12em", color: C.dim }}>FIND</span>
          <input value={tq} onChange={(e) => setTq(e.target.value)}
            placeholder="name, flight number or source" style={{ width: 210 }} />
          <select value={tCode} onChange={(e) => setTCode(e.target.value)}>
            <option value="All">All statuses</option>
            {travelCodes.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <span style={{ fontFamily: disp, fontSize: 12, letterSpacing: ".12em", color: C.dim }}>BETWEEN</span>
          <input type="date" value={tFrom} onChange={(e) => setTFrom(e.target.value)} />
          <input type="date" value={tTo} onChange={(e) => setTTo(e.target.value)} />
          {(tq || tCode !== "All" || tFrom || tTo) && (
            <Btn small danger onClick={() => { setTq(""); setTCode("All"); setTFrom(""); setTTo(""); }}>
              Clear filters
            </Btn>
          )}
          <Btn small disabled={!shownTravel.length}
            onClick={() => downloadCsv("applied-travel.csv", [
              ["Employee", "Date", "Status", "Flight", "Source", "Applied by"],
              ...shownTravel.map((t) => [t.name, t.date, t.code, t.flight || "", t.source || "", t.by || ""]),
            ])}>Export to Excel</Btn>
        </div>
        {shownTravel.length === 0 && <div style={{ padding: 18, fontFamily: mono, fontSize: 12, color: C.dim }}>
          {travel.length ? "Nothing matches those filters." : "Nothing applied yet."}</div>}
        {shownTravel.map((t) => (
          <div key={t.id} style={{ display: "flex", gap: 14, alignItems: "center", padding: "8px 16px",
            borderBottom: `1px solid ${C.line}` }}>
            <div style={{ fontFamily: mono, fontSize: 11, color: C.dim, width: 78 }}>{fmtShort(t.date)}</div>
            <div style={{ fontSize: 13, flex: 1 }}>{t.name}</div>
            <Chip code={t.code} />
            <div style={{ fontFamily: mono, fontSize: 11, color: C.dim, width: 70 }}>{t.flight || "—"}</div>
            <div style={{ fontFamily: mono, fontSize: 10, color: C.dimmer, width: 120,
              overflow: "hidden", textOverflow: "ellipsis" }}>{t.source}</div>
            <Btn small danger onClick={() => removeTravel(t.id)}>Remove</Btn>
          </div>
        ))}
        {travel.length > 0 && (
          <div style={{ padding: "9px 16px", fontFamily: mono, fontSize: 10.5, color: C.dim }}>
            Remove puts that day back on the person's roster pattern and takes the movement off this
            list. It does not cancel anything with FMG.
          </div>
        )}
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
    setTravel((t) => [...t, { id: uid("T"), empId: Number(empId), name: emp ? emp.name : "?",
      date, code, flight, source: "manual entry", by: user || "unsigned" }]);
  };

  return (
    <Panel title="Manual travel entry">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <Field label="Employee">
          <select value={empId} onChange={(e) => setEmpId(e.target.value)} style={{ width: "100%" }}>
            {employees.slice().sort(bySurname).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
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
            <option value="waitlisted">Waitlisted</option>
            <option value="confirmed">Confirmed</option>
          </select>
        </Field>
        <Field label="Flight"><input value={flight} onChange={(e) => setFlight(e.target.value)} style={{ width: "100%" }} /></Field>
      </div>
      {(() => {
        const advice = travelAdvice(date, travelCode(mv, state));
        return advice ? (
          <div style={{ border: `1px solid ${C.red}`, background: "#FCEAE7", padding: "9px 12px",
            marginBottom: 12, fontSize: 12.5, lineHeight: 1.55 }}>
            <b style={{ color: C.red }}>No such flight.</b> {advice}
          </div>
        ) : null;
      })()}
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

function Requests({ employees, requests, submitRequest, markRequested, declineRequest,
  removeRequest, codeFor, focusDate, problemsFromChanges }) {
  const [empId, setEmpId] = useState(employees[6] ? employees[6].id : 1);
  const [kind, setKind] = useState("travel");
  const [reason, setReason] = useState("");
  const [siteShift, setSiteShift] = useState("1");
  const [changes, setChanges] = useState([{ date: focusDate, movement: "FOP" }]);
  const [err, setErr] = useState("");

  const emp = employees.find((e) => e.id === Number(empId));
  const setChange = (i, patch) => setChanges((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  /* the strip on the right follows the first day being changed, so what you
     are looking at is always the part of the roster you are altering */
  const anchorDate = changes.map((c) => c.date).filter(Boolean).sort()[0] || focusDate;

  const options = kind === "shift"
    ? [["1", "DS · day shift"], ["NS", "NS · night shift"]]
    : kind === "demob"
      ? [["__demob", "demobilise from this date"]]
      : [...Object.keys(MOVEMENTS).map((m) => [m, `${m} · ${MOVEMENTS[m].label}`]),
         ["__cancel", "cancel travel"]];

  /* travel that would sit badly with the shift being asked for */
  const shiftAdvice = useMemo(() => {
    if (kind !== "shift" || !emp) return [];
    const out = [];
    const days = changes.filter((c) => c.date).map((c) => c.date).sort();
    if (!days.length) return out;
    const last = days[days.length - 1];
    const wanted = changes.find((c) => c.date === last).movement;

    /* the next departure after the run being changed */
    let outDate = null, outCode = null;
    for (let i = 1; i <= 21 && !outDate; i++) {
      const d = addDays(last, i);
      const c = codeFor(emp, d);
      if (dirOf(c) === "OUT") { outDate = d; outCode = c; }
      else if (dirOf(c) === "IN") break;
    }
    if (!outDate) return out;
    const mv = movementOf(outCode);
    if (wanted === "NS" && mv && mv.endsWith("P")) {
      out.push(`Coming off night shift on the morning of ${fmtShort(outDate)}, they could fly out then. `
        + `The departure is ${outCode} — an AM flight would save a day in camp unpaid. `
        + `Consider changing it to ${mv.slice(0, 2)}A.`);
    }
    if (wanted === "1" && mv && mv.endsWith("A") && diffDays(outDate, last) > 0) {
      out.push(`Finishing day shift on ${fmtShort(last)} and flying out the morning of ${fmtShort(outDate)} `
        + `means a night in camp. A PM departure on ${fmtShort(last)} would avoid it — `
        + `consider ${mv.slice(0, 2)}P.`);
    }
    return out;
  }, [kind, emp, changes, codeFor]);

  const problems = useMemo(() => {
    if (kind !== "travel") return [];
    const rows = changes.filter((c) => c.date);
    const out = [];
    rows.forEach((c) => {
      if (c.movement === "__cancel") return;
      const advice = travelAdvice(c.date, travelCode(c.movement, "requested"));
      if (advice) out.push({ iso: c.date, msg: `${c.movement} on ${fmtShort(c.date)} — ${advice}` });
    });
    return out.concat(problemsFromChanges(Number(empId), rows));
  }, [kind, empId, changes, problemsFromChanges]);

  /* days that will be filled in between a requested fly-in and fly-out */
  const filledDays = useMemo(() => {
    if (kind !== "travel") return null;
    const rows = changes.filter((c) => c.date).sort((a, b) => (a.date < b.date ? -1 : 1));
    const inLeg = rows.find((c) => MOVEMENTS[c.movement] && MOVEMENTS[c.movement].dir === "IN");
    if (!inLeg) return null;
    const outLeg = rows.find((c) => c.date > inLeg.date
      && MOVEMENTS[c.movement] && MOVEMENTS[c.movement].dir === "OUT");
    if (!outLeg) return null;
    const n = diffDays(outLeg.date, inLeg.date) - 1;
    return n > 0 ? { n, from: addDays(inLeg.date, 1), to: addDays(outLeg.date, -1) } : null;
  }, [kind, changes]);

  const submit = () => {
    const clean = changes.filter((c) => c.date).sort((a, b) => (a.date < b.date ? -1 : 1));
    if (!clean.length) { setErr("Add at least one date."); return; }
    if (kind === "demob" && !reason.trim()) {
      setErr("A reason is needed for a demobilisation."); return;
    }
    const res = submitRequest({ empId: Number(empId), reason, changes: clean, kind,
      siteShift: kind === "travel" ? siteShift : undefined });
    if (res && res.error) { setErr(res.error); return; }
    setErr("");
    setReason(""); setChanges([{ date: focusDate, movement: kind === "shift" ? "1" : "FOP" }]);
  };

  const pending = requests.filter((r) => r.status === "pending");
  const done = requests.filter((r) => r.status !== "pending");

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 400px) 1fr", gap: 18 }}>
        <Panel title="Raise a request" note="site crew">
          <Field label="Employee">
            <select value={empId} onChange={(e) => setEmpId(e.target.value)} style={{ width: "100%" }}>
              {employees.slice().sort(bySurname).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
          <Field label="What kind of change">
            <select value={kind} style={{ width: "100%" }}
              onChange={(e) => {
                const k = e.target.value;
                setKind(k); setErr("");
                setChanges([{ date: anchorDate,
                  movement: k === "shift" ? "1" : k === "demob" ? "__demob" : "FOP" }]);
              }}>
              <option value="travel">Travel — flights in or out</option>
              <option value="shift">Shift — day shift or night shift</option>
              <option value="demob">Demobilise — the person is leaving</option>
            </select>
          </Field>
          <Field label={kind === "demob" ? "Demobilised from" : "Changes requested"}>
            {changes.map((c, i) => (
              <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <input type="date" value={c.date} onChange={(e) => setChange(i, { date: e.target.value })}
                  style={{ flex: 1 }} />
                <select value={c.movement} onChange={(e) => setChange(i, { movement: e.target.value })}
                  disabled={kind === "demob"}>
                  {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                {changes.length > 1 && kind !== "demob" && (
                  <Btn small danger onClick={() => setChanges((cs) => cs.filter((_, j) => j !== i))}>×</Btn>
                )}
              </div>
            ))}
            {kind !== "demob" && (
              <Btn small onClick={() => setChanges((cs) => [...cs,
                { date: anchorDate, movement: kind === "shift" ? "NS" : "FIA" }])}>
                Add another day
              </Btn>
            )}
          </Field>

          {kind === "demob" && (
            <div style={{ border: `1px solid ${C.orange}`, borderLeft: `4px solid ${C.orange}`,
              background: "#FDF4EE", padding: "10px 12px", marginBottom: 12, fontSize: 12.5,
              lineHeight: 1.55 }}>
              When the office actions this, everything on {emp ? emp.name : "their"} roster from{" "}
              <b>{fmtShort(anchorDate)}</b> is cleared, a <b>T</b> is put on that day, and the
              demobilisation date is set to their last departure before it.
            </div>
          )}

          {filledDays && (
            <div style={{ border: `1px solid ${C.line2}`, background: C.panel2, padding: "10px 12px",
              marginBottom: 12, fontSize: 12.5, lineHeight: 1.55 }}>
              The {filledDays.n} day{filledDays.n === 1 ? "" : "s"} between,{" "}
              {fmtShort(filledDays.from)} to {fmtShort(filledDays.to)}, will be filled as site days.
              <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontFamily: disp, fontSize: 11.5, letterSpacing: ".12em",
                  color: C.dim, textTransform: "uppercase" }}>as</span>
                <select value={siteShift} onChange={(e) => setSiteShift(e.target.value)}>
                  <option value="1">Day shift</option>
                  <option value="NS">Night shift</option>
                </select>
                <span style={{ fontFamily: mono, fontSize: 10.5, color: C.dim }}>
                  or add those days above to mix the two
                </span>
              </div>
            </div>
          )}

          {shiftAdvice.length > 0 && (
            <div style={{ border: `1px solid ${C.orange}`, borderLeft: `4px solid ${C.orange}`,
              background: "#FDF4EE", padding: "10px 12px", marginBottom: 12 }}>
              <div style={{ fontFamily: disp, fontSize: 12.5, letterSpacing: ".1em", color: C.red,
                textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>
                Worth changing the flight too
              </div>
              {shiftAdvice.map((m, i) => (
                <div key={i} style={{ fontSize: 12.5, marginBottom: 4, lineHeight: 1.55 }}>• {m}</div>
              ))}
            </div>
          )}
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
          {err && (
            <div style={{ border: `1px solid ${C.red}`, background: "#FCEAE7", padding: "10px 12px",
              marginBottom: 12, fontSize: 12.5, color: C.red, lineHeight: 1.55 }}>{err}</div>
          )}
          <Btn primary onClick={submit}>
            {problems.length ? "Send anyway" : "Send request"}
          </Btn>
          <div style={{ fontFamily: mono, fontSize: 10.5, color: C.dim, marginTop: 12, lineHeight: 1.55 }}>
            The request records who asked, when, and why. The administrator sees the roster before and
            after, then marks it once it has gone to the travel team — which puts TBC on the roster.
          </div>
        </Panel>

        <Panel title="Roster as it stands"
          note={`${emp ? emp.name : ""} · ${fmtShort(addDays(anchorDate, -5))} to ${fmtShort(addDays(anchorDate, 15))}`}>
          {emp && <StripCells
            marked={changes.map((c) => c.date).filter(Boolean)}
            cells={Array.from({ length: 21 }, (_, i) => addDays(anchorDate, i - 5))
              .map((d) => ({ iso: d, code: codeFor(emp, d) }))} />}
          <div style={{ fontFamily: mono, fontSize: 10.5, color: C.dim, marginTop: 10 }}>
            This follows the first date being changed, so it always shows the part of the roster
            the request affects. Days being changed are ringed.
          </div>
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
                <div style={{ fontFamily: mono, fontSize: 10.5, color: "#FFF", background: C.dim,
                  padding: "1px 6px", borderRadius: 2 }}>
                  {r.kind === "demob" ? "demobilise" : r.kind === "shift" ? "shift" : "travel"}
                </div>
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
                <Btn primary onClick={() => markRequested(r.id)}>
                  {r.kind === "demob" ? "Demobilise"
                    : r.kind === "shift" ? "Apply the shift change"
                    : "Mark as requested with travel team"}
                </Btn>
                <Btn danger onClick={() => declineRequest(r.id)}>Decline</Btn>
                <Btn danger onClick={() => removeRequest(r.id)}>Remove</Btn>
              </div>
            </div>
          );
        })}
      </Panel>

      {done.length > 0 && (
        <Panel title="Actioned" note={`${done.length} · reason and who raised it are kept`} pad={0}>
          {done.map((r) => (
            <div key={r.id} style={{ padding: "9px 16px", borderBottom: `1px solid ${C.line}` }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{r.name}</div>
                <div style={{ fontFamily: mono, fontSize: 10.5, color: "#FFF", background: C.dim,
                  padding: "1px 6px", borderRadius: 2 }}>
                  {r.kind === "demob" ? "demobilise" : r.kind === "shift" ? "shift" : "travel"}
                </div>
                <div style={{ fontFamily: mono, fontSize: 11,
                  color: r.status === "declined" ? C.red : C.ok }}>{r.status}</div>
                <div style={{ flex: 1 }} />
                <Btn small danger onClick={() => removeRequest(r.id)}>Remove</Btn>
              </div>
              <div style={{ fontFamily: mono, fontSize: 10.5, color: C.dim, marginTop: 3 }}>
                {(r.changes || []).map((c) => `${fmtShort(c.date)} ${
                  c.movement === "__cancel" ? "cancel travel"
                  : c.movement === "__demob" ? "demobilise"
                  : codeText(c.movement)}`).join(" · ")}
              </div>
              <div style={{ fontFamily: mono, fontSize: 10.5, color: C.dim, marginTop: 3 }}>
                raised by {r.by} {fmtStamp(r.at)} · actioned by {r.actionedBy || "—"}
                {r.actionedAt ? ` ${fmtStamp(r.actionedAt)}` : ""}
              </div>
              {r.reason && (
                <div style={{ fontSize: 12.5, color: C.ink, marginTop: 5, paddingLeft: 10,
                  borderLeft: `2px solid ${C.line2}` }}>{r.reason}</div>
              )}
            </div>
          ))}
        </Panel>
      )}
    </div>
  );
}

function StripCells({ cells, marked }) {
  const ring = new Set(marked || []);
  return (
    <div style={{ display: "flex", gap: 1, overflowX: "auto" }}>
      {cells.map((c, i) => {
        const first = i === 0 || parse(c.iso).getUTCDate() === 1;
        const [bg, fg, br] = codeStyle(c.code);
        const st = travelState(c.code);
        return (
          <div key={c.iso} title={`${fmtLong(c.iso)} — ${c.code ? (CODES[c.code] ? CODES[c.code].label : c.code) : "not rostered"}`}
            style={{ flex: "0 0 34px", textAlign: "center" }}>
            <div style={{ fontFamily: mono, fontSize: 8.5, color: C.dimmer }}>{DOW[dow(c.iso)][0]}</div>
            <div style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>{parse(c.iso).getUTCDate()}</div>
            <div style={{ fontFamily: mono, fontSize: 7.5, color: first ? C.red : C.dimmer,
              fontWeight: first ? 700 : 400, height: 10 }}>
              {MON[parse(c.iso).getUTCMonth()]}{first ? " " + String(parse(c.iso).getUTCFullYear()).slice(2) : ""}
            </div>
            <div style={{ height: 26, background: bg, color: fg, border: `1px solid ${br}`,
              borderStyle: st === "requested" ? "dashed" : "solid",
              outline: (c.changed || ring.has(c.iso)) ? `2px solid ${C.red}` : "none", outlineOffset: -1,
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
  setThresholds, focusDate, addPerson, customPatterns, savePattern, deletePattern, loadImported,
  isAdmin, requireAdmin, userName }) {
  const [confirmImport, setConfirmImport] = useState(false);
  const [pq, setPq] = useState("");
  const [pf, setPf] = useState({ category: "All", crew: "All", company: "All",
    contract: "All", poh: "All", atsi: "All", status: "Mobilised" });
  const setF2 = (k, v) => setPf((x) => ({ ...x, [k]: v }));

  const uniq = (key) => ["All", ...Array.from(new Set(employees
    .map((e) => (e[key] || "").trim()).filter(Boolean))).sort()];

  const shownPeople = employees.slice().sort(bySurname).filter((e) => {
    if (pf.status === "Mobilised" && e.demobDate) return false;
    if (pf.status === "Demobilised" && !e.demobDate) return false;
    for (const k of ["category", "crew", "company", "contract", "poh"]) {
      if (pf[k] !== "All" && (e[k] || "").trim() !== pf[k]) return false;
    }
    if (pf.atsi === "Yes" && !(e.atsi && e.atsi !== "N")) return false;
    if (pf.atsi === "No" && e.atsi && e.atsi !== "N") return false;
    if (pq.trim()) {
      const q = pq.toLowerCase();
      const hay = [e.name, e.alias, e.position, e.category, e.crew, e.company, e.poh,
        e.email, e.phone, e.sap, e.contract].map((x) => (x || "").toLowerCase()).join(" ");
      if (!hay.includes(q)) return false;
    }
    return true;
  });

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
              {employees.slice().sort(bySurname).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
          <Field label="New pattern">
            <select value={pPattern} onChange={(e) => setPPattern(e.target.value)} style={{ width: "100%" }}>
              {patternNames().map((p) => <option key={p} value={p}>{p} · {PATTERN_REGISTRY[p].label}</option>)}
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
              {(emp.patterns || []).map((s) => {
                const running = segmentFor(emp, focusDate);
                const isNow = running && running.from === s.from;
                const later = s.from > focusDate;
                return (
                <div key={s.from} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 12,
                  padding: "4px 0", borderBottom: `1px solid ${C.line}`,
                  background: isNow ? "#F5E3DA" : "transparent" }}>
                  <span style={{ fontFamily: mono, fontSize: 11, color: C.dim, width: 80 }}>
                    {s.from === "2000-01-01" ? "from start" : fmtShort(s.from)}</span>
                  <span style={{ flex: 1, fontWeight: isNow ? 600 : 400 }}>
                    {s.pattern}
                    {isNow && <span style={{ fontFamily: mono, fontSize: 10, color: C.red,
                      marginLeft: 7 }}>running now</span>}
                    {later && <span style={{ fontFamily: mono, fontSize: 10, color: C.orange,
                      marginLeft: 7 }}>starts later</span>}
                  </span>
                  <span style={{ fontFamily: mono, fontSize: 10.5, color: C.dimmer }}>
                    swing {fmtShort(s.anchor)}</span>
                  {(emp.patterns || []).length > 1 && s.from !== "2000-01-01" && (
                    <Btn small danger onClick={() => removePatternSegment(emp.id, s.from)}>×</Btn>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title="Coverage minimums" note="0 tracks the count without raising an alert">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 }}>
            {METRICS.map((m) => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, fontSize: 12.5 }}>{m.name}
                  {m.exact && <span style={{ fontFamily: mono, fontSize: 10, color: C.dim,
                    marginLeft: 6 }}>exactly</span>}</div>
                <input type="number" min="0" max="30" value={thresholds[m.id]} style={{ width: 62 }}
                  disabled={!isAdmin}
                  onChange={(e) => isAdmin && setThresholds((t) => ({ ...t, [m.id]: Number(e.target.value) || 0 }))} />
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {!isAdmin && (
        <div style={{ border: `1px solid ${C.orange}`, borderLeft: `4px solid ${C.orange}`,
          background: "#FDF4EE", padding: "11px 14px", borderRadius: 2, fontSize: 13,
          lineHeight: 1.55 }}>
          <b>Read only.</b> Personnel records, roster patterns and coverage minimums are changed by
          the office. You can still edit the roster, enter leave and raise travel requests.
        </div>
      )}

      {isAdmin && <Panel title="Imported roster" note="from Roster_20240409.xlsx — 26 mobilised, 1 Jan 2026 onward">
        {!confirmImport ? (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Btn onClick={() => setConfirmImport(true)}>Reload the imported roster</Btn>
            <span style={{ fontFamily: mono, fontSize: 10.5, color: C.dim }}>
              replaces the roster and personnel with the spreadsheet — use with care now you are live
            </span>
          </div>
        ) : (
          <div style={{ border: `1px solid ${C.red}`, background: "#FCEAE7", padding: "12px 14px" }}>
            <div style={{ fontSize: 13, marginBottom: 10, lineHeight: 1.55 }}>
              This replaces the roster and personnel register with the ones taken from the spreadsheet.
              Travel records, requests and dismissed checks made in here are cleared, and leave goes
              back to what the spreadsheet says. The change log is kept.
              <div style={{ marginTop: 8 }}>
                Anyone added here who is not in the spreadsheet is kept, along with their roster days.
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Btn primary onClick={() => { loadImported(); setConfirmImport(false); }}>
                Yes, replace what is here
              </Btn>
              <Btn onClick={() => setConfirmImport(false)}>Cancel</Btn>
            </div>
          </div>
        )}
      </Panel>}

      {isAdmin && <PatternBuilder {...{ customPatterns, savePattern, deletePattern }} />}

      {isAdmin && <EmailSetup user={userName} />}

      {isAdmin && <AddPerson employees={employees} addPerson={addPerson} focusDate={focusDate} />}

      <Panel title="Personnel"
        note={`${shownPeople.length} of ${employees.length} · pattern shown is the one in force on ${fmtShort(focusDate)}`} pad={0}>
        <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.line}`, background: C.panel2,
          display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontFamily: disp, fontSize: 12, letterSpacing: ".12em", color: C.dim }}>FIND</span>
          <input value={pq} onChange={(e) => setPq(e.target.value)}
            placeholder="any field — name, position, email, SAP" style={{ width: 250 }} />
          {[["category", "role"], ["crew", "crew"], ["company", "company"],
            ["contract", "contract"], ["poh", "point of hire"]].map(([k, label]) => (
            <select key={k} value={pf[k]} onChange={(e) => setF2(k, e.target.value)}>
              {uniq(k).map((x) => <option key={x} value={x}>{x === "All" ? `All ${label}s` : x}</option>)}
            </select>
          ))}
          <select value={pf.atsi} onChange={(e) => setF2("atsi", e.target.value)}>
            <option value="All">ATSI — all</option>
            <option value="Yes">ATSI — yes</option>
            <option value="No">ATSI — no</option>
          </select>
          <select value={pf.status} onChange={(e) => setF2("status", e.target.value)}>
            <option value="Mobilised">Mobilised</option>
            <option value="Demobilised">Demobilised</option>
            <option value="All">Everyone</option>
          </select>
          {(pq || Object.values(pf).some((v) => v !== "All" && v !== "Mobilised")) && (
            <Btn small danger onClick={() => { setPq(""); setPf({ category: "All", crew: "All",
              company: "All", contract: "All", poh: "All", atsi: "All", status: "Mobilised" }); }}>
              Clear filters
            </Btn>
          )}
        </div>
        <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.line}`, background: C.panel2 }}>
          <Btn primary onClick={() => downloadCsv("syncline-personnel.csv", [
            ["Name","Alias","SAP No","Category","Position","Crew","Pattern","Swing start",
             "Pattern change booked","Company","POH","Contract Type","Gender","ATSI","Email",
             "Mobile No","Mobe date","Demobe Date"],
            ...shownPeople.map((e) => {
              const sg = segmentFor(e, focusDate);
              const nx = (e.patterns || []).filter((x) => x.from > focusDate)
                .sort((a, b) => (a.from < b.from ? -1 : 1))[0];
              return [e.name, e.alias, e.sap, e.category, e.position, e.crew,
                sg ? sg.pattern : "", sg ? sg.anchor : "",
                nx ? `${nx.pattern} from ${nx.from}` : "",
                e.company, e.poh, e.contract, e.gender, e.atsi,
                e.email, e.phone, e.mobeDate, e.demobDate];
            }),
          ])}>Export register to Excel</Btn>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ minWidth: 1980 }}>
            <thead><tr>
              <th style={th}>Name</th><th style={th}>SAP No</th><th style={th}>Position</th><th style={th}>Category</th>
              <th style={th}>Crew</th><th style={th}>Pattern</th>
              <th style={th}>Company</th><th style={th}>POH</th><th style={th}>Contract</th>
              <th style={th}>Gender</th><th style={th}>ATSI</th>
              <th style={th}>Email</th><th style={th}>Phone</th>
              <th style={th}>Mobe</th><th style={th}>Demobe</th>
              <th style={th}>§26</th><th style={th}>LH</th><th style={th}>Grader</th>
            </tr></thead>
            <tbody>
              {shownPeople.length === 0 && (
                <tr><td colSpan={17} style={{ ...td, color: C.dim, fontFamily: mono }}>
                  Nobody matches those filters.</td></tr>
              )}
              {shownPeople.map((e) => {
                const seg = segmentFor(e, focusDate);
                /* a change set to start later is easy to miss, so show it here too */
                const next = (e.patterns || [])
                  .filter((x) => x.from > focusDate)
                  .sort((a, b) => (a.from < b.from ? -1 : 1))[0];
                return (
                  <tr key={e.id} style={{ opacity: e.demobDate ? 0.55 : 1 }}>
                    <td style={td}><input value={e.name} style={{ width: 180, fontWeight: 600 }}
                      onChange={(ev) => updateEmployee(e.id, { name: ev.target.value })} /></td>
                    <td style={td}><input value={e.sap || ""} style={{ width: 78 }}
                      onChange={(ev) => updateEmployee(e.id, { sap: ev.target.value })} /></td>
                    <td style={td}><input value={e.position || ""} style={{ width: 230 }}
                      onChange={(ev) => updateEmployee(e.id, { position: ev.target.value })} /></td>
                    <td style={td}>
                      <select value={e.category}
                        onChange={(ev) => updateEmployee(e.id, { category: ev.target.value })}>
                        {CATEGORIES.map((x) => <option key={x} value={x}>{x}</option>)}
                      </select>
                    </td>
                    <td style={td}><input value={e.crew || ""} style={{ width: 62 }}
                      onChange={(ev) => updateEmployee(e.id, { crew: ev.target.value })} /></td>
                    <td style={{ ...td, fontFamily: mono, fontSize: 11, whiteSpace: "nowrap" }}>
                      {seg ? seg.pattern : "—"}
                      <span style={{ color: C.dimmer }}> · swing {seg ? fmtShort(seg.anchor) : ""}</span>
                      {next && (
                        <div style={{ color: C.red, fontSize: 10.5, marginTop: 2 }}>
                          → {next.pattern} from {fmtShort(next.from)}
                        </div>
                      )}
                    </td>
                    <td style={td}><input value={e.company || ""} style={{ width: 96 }}
                      onChange={(ev) => updateEmployee(e.id, { company: ev.target.value })} /></td>
                    <td style={td}><input value={e.poh || ""} style={{ width: 88 }}
                      onChange={(ev) => updateEmployee(e.id, { poh: ev.target.value })} /></td>
                    <td style={td}>
                      <select value={e.contract || ""} onChange={(ev) => updateEmployee(e.id, { contract: ev.target.value })}>
                        {["", "Full Time", "Part Time", "Casual", "Contractor", "Labour Hire"]
                          .map((x) => <option key={x} value={x}>{x || "—"}</option>)}
                      </select>
                    </td>
                    <td style={td}>
                      <select value={e.gender || ""} onChange={(ev) => updateEmployee(e.id, { gender: ev.target.value })}>
                        {["", "M", "F", "X"].map((x) => <option key={x} value={x}>{x || "—"}</option>)}
                      </select>
                    </td>
                    <td style={{ ...td, textAlign: "center" }}>
                      <input type="checkbox" checked={!!(e.atsi && e.atsi !== "N")}
                        onChange={(ev) => updateEmployee(e.id, { atsi: ev.target.checked ? "Y" : "" })}
                        style={{ width: 15, height: 15, accentColor: C.red }} />
                    </td>
                    <td style={td}><input value={e.email || ""} style={{ width: 168 }}
                      onChange={(ev) => updateEmployee(e.id, { email: ev.target.value })} /></td>
                    <td style={td}><input value={e.phone || ""} style={{ width: 108 }}
                      onChange={(ev) => updateEmployee(e.id, { phone: ev.target.value })} /></td>
                    <td style={td}><input type="date" value={e.mobeDate || ""}
                      onChange={(ev) => updateEmployee(e.id, { mobeDate: ev.target.value })} /></td>
                    <td style={td}><input type="date" value={e.demobDate || ""}
                      onChange={(ev) => updateEmployee(e.id, { demobDate: ev.target.value })} /></td>
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

const SEQ_CODES = [
  ["FIA", "Fly in AM"], ["FIP", "Fly in PM"], ["DIA", "Drive in AM"],
  ["1", "Day shift"], ["NS", "Night shift"],
  ["FOA", "Fly out AM"], ["FOP", "Fly out PM"], ["DOP", "Drive out PM"],
  ["RR", "R & R"], ["RDO", "Rostered day off"],
];

function PatternBuilder({ customPatterns, savePattern, deletePattern }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [seq, setSeq] = useState([["FIA", 1], ["1", 6], ["NS", 7], ["FOA", 1], ["RR", 13]]);
  const [err, setErr] = useState("");

  const total = seq.reduce((n, x) => n + Number(x[1] || 0), 0);
  const setRow = (i, j, v) => setSeq((q) => q.map((r, k) => (k === i ? (j ? [r[0], v] : [v, r[1]]) : r)));

  const loadExisting = (n) => {
    setName(n);
    setSeq((PATTERN_REGISTRY[n] && PATTERN_REGISTRY[n].seq)
      ? PATTERN_REGISTRY[n].seq.map((x) => [x[0], x[1]])
      : [["FIA", 1], ["1", 6], ["RR", 7]]);
  };

  const submit = () => {
    if (!name.trim()) { setErr("Give the pattern a name, e.g. 7D/7N/14R."); return; }
    if (total < 2) { setErr("The cycle needs at least two days."); return; }
    if (seq.some((r) => !r[1] || Number(r[1]) < 1)) { setErr("Every block needs at least one day."); return; }
    setErr("");
    savePattern(name.trim(), seq.map((r) => [r[0], Number(r[1])]));
    setOpen(false);
  };

  const remove = (n) => {
    const res = deletePattern(n);
    if (res && res.error) setErr(res.error);
  };

  if (!open) {
    return (
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <Btn onClick={() => setOpen(true)}>Roster patterns</Btn>
        <span style={{ fontFamily: mono, fontSize: 11, color: C.dim }}>
          {patternNames().length} patterns · {Object.keys(customPatterns).length} built here
        </span>
      </div>
    );
  }

  return (
    <Panel title="Roster patterns" note="build a new one, or edit one you built">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20 }}>
        <div>
          <Field label="Pattern name">
            <input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="7D/7N/14R" style={{ width: "100%" }} />
          </Field>
          <Field label="The cycle, in order">
            {seq.map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                <select value={r[0]} onChange={(e) => setRow(i, 0, e.target.value)} style={{ flex: 1 }}>
                  {SEQ_CODES.map(([c, l]) => <option key={c} value={c}>{codeText(c)} — {l}</option>)}
                </select>
                <input type="number" min="1" max="60" value={r[1]}
                  onChange={(e) => setRow(i, 1, e.target.value)} style={{ width: 64 }} />
                <span style={{ fontFamily: mono, fontSize: 11, color: C.dim }}>days</span>
                {seq.length > 1 && (
                  <Btn small danger onClick={() => setSeq((q) => q.filter((_, k) => k !== i))}>×</Btn>
                )}
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Btn small onClick={() => setSeq((q) => [...q, ["1", 1]])}>Add a block</Btn>
              <span style={{ fontFamily: mono, fontSize: 11, color: total % 7 ? C.orange : C.ok }}>
                cycle = {total} days{total % 7 ? " — not a whole number of weeks" : ""}
              </span>
            </div>
          </Field>
          {err && <div style={{ color: C.red, fontFamily: mono, fontSize: 11.5, marginBottom: 8 }}>{err}</div>}
          <div style={{ display: "flex", gap: 10 }}>
            <Btn primary onClick={submit}>Save pattern</Btn>
            <Btn onClick={() => { setOpen(false); setErr(""); }}>Close</Btn>
          </div>
          <div style={{ fontFamily: mono, fontSize: 10.5, color: C.dim, marginTop: 12, lineHeight: 1.55 }}>
            Put the travel days in the cycle where they actually fall. 7D/7N/14R is fly in, 6 day
            shifts, 7 nights, fly out AM, then 13 off — 28 days all up. Saving under an existing name
            replaces it, and everyone on that pattern re-rolls.
          </div>
        </div>

        <div>
          <div style={{ fontFamily: disp, fontSize: 12, letterSpacing: ".12em", color: C.dim,
            textTransform: "uppercase", marginBottom: 6 }}>Existing patterns</div>
          {patternNames().map((n) => {
            const pt = PATTERN_REGISTRY[n];
            return (
              <div key={n} style={{ display: "flex", gap: 8, alignItems: "center", padding: "5px 0",
                borderBottom: `1px solid ${C.line}`, fontSize: 12.5 }}>
                <span style={{ fontWeight: 600, minWidth: 92 }}>{n}</span>
                <span style={{ flex: 1, color: C.dim, fontSize: 11.5 }}>{pt.label}</span>
                {pt.seq && <Btn small onClick={() => loadExisting(n)}>Edit</Btn>}
                {pt.custom && <Btn small danger onClick={() => remove(n)}>×</Btn>}
              </div>
            );
          })}
          <div style={{ fontFamily: mono, fontSize: 10.5, color: C.dim, marginTop: 10, lineHeight: 1.55 }}>
            Built-in patterns can be opened with Edit and saved under a new name. Patterns someone is
            working can't be deleted until they are moved off it.
          </div>
        </div>
      </div>
    </Panel>
  );
}

function EmailSetup({ user }) {
  const [state, setState] = useState({ loading: true });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    let live = true;
    fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ check: true }) })
      .then((r) => r.json())
      .then((d) => { if (live) setState({ loading: false, ...d }); })
      .catch(() => { if (live) setState({ loading: false, configured: false,
        missing: ["the function is not responding"] }); });
    return () => { live = false; };
  }, []);

  const sendTest = async () => {
    setBusy(true); setResult(null);
    try {
      const r = await fetch("/api/notify", { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: true, by: user }) });
      const d = await r.json();
      setResult(r.ok
        ? { ok: true, msg: `Sent to ${(d.to || []).join(", ")}. Check the inbox, and the junk folder.` }
        : { ok: false, msg: d.error || "It did not send." });
    } catch {
      setResult({ ok: false, msg: "Could not reach the email service." });
    }
    setBusy(false);
  };

  const on = state.configured;
  return (
    <Panel title="Email notifications"
      note={state.loading ? "checking…" : on ? "switched on" : "not switched on yet"}>
      {state.loading ? (
        <div style={{ fontFamily: mono, fontSize: 12, color: C.dim }}>checking…</div>
      ) : on ? (
        <>
          <div style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 10 }}>
            Travel actions and travel change requests are emailed to{" "}
            <b>{(state.to || []).join(", ")}</b>, sent from <b>{state.from}</b>.
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Btn onClick={sendTest} disabled={busy}>{busy ? "Sending…" : "Send a test email"}</Btn>
            {result && (
              <span style={{ fontFamily: mono, fontSize: 11.5, color: result.ok ? C.ok : C.red,
                maxWidth: 460, lineHeight: 1.5 }}>{result.msg}</span>
            )}
          </div>
        </>
      ) : (
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
          Travel actions and requests show on screen only. To have them emailed as well, three
          settings are needed in Netlify:
          <ul style={{ margin: "8px 0 8px", paddingLeft: 20 }}>
            <li style={{ marginBottom: 3 }}><b>RESEND_API_KEY</b> — a key from resend.com</li>
            <li style={{ marginBottom: 3 }}><b>NOTIFY_FROM</b> — the address they are sent from,
              on a domain verified with Resend</li>
            <li><b>NOTIFY_TO</b> — who receives them, separated by commas</li>
          </ul>
          {state.missing && state.missing.length > 0 && (
            <div style={{ fontFamily: mono, fontSize: 11.5, color: C.orange }}>
              Still missing: {state.missing.join(", ")}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

function AddPerson({ employees, addPerson, focusDate }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    name: "", alias: "", category: "Operator", position: "", poh: "Perth",
    crew: "A", pattern: "2:2", anchor: focusDate, mobeDate: focusDate,
    company: "Syncline", contract: "Full Time", gender: "", atsi: "", email: "", phone: "", sap: "",
  });
  const [err, setErr] = useState("");
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const crews = Array.from(new Set(employees.map((e) => e.crew)));
  const cats = Array.from(new Set([...CATEGORIES, ...employees.map((e) => e.category)]));

  const submit = () => {
    if (!f.name.trim()) { setErr("Enter a name."); return; }
    if (!f.position.trim()) { setErr("Enter a position — grader and leading hand are picked up from it."); return; }
    setErr("");
    addPerson(f);
    setF({ ...f, name: "", alias: "", position: "" });
    setOpen(false);
  };

  if (!open) {
    return (
      <div>
        <Btn primary onClick={() => setOpen(true)}>Add a person</Btn>
      </div>
    );
  }

  return (
    <Panel title="Add a person" note="they appear on the roster from their mobilisation date">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <Field label="Name — SURNAME, First">
          <input value={f.name} onChange={(e) => set("name", e.target.value)}
            placeholder="SMITH, John" style={{ width: "100%" }} />
        </Field>
        <Field label="Known as">
          <input value={f.alias} onChange={(e) => set("alias", e.target.value)}
            placeholder="optional" style={{ width: "100%" }} />
        </Field>
        <Field label="Category">
          <select value={f.category} onChange={(e) => set("category", e.target.value)} style={{ width: "100%" }}>
            {cats.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Position">
          <input value={f.position} onChange={(e) => set("position", e.target.value)}
            placeholder="HR WC / Roller / Grader" style={{ width: "100%" }} />
        </Field>
        <Field label="Point of hire">
          <input value={f.poh} onChange={(e) => set("poh", e.target.value)} style={{ width: "100%" }} />
        </Field>
        <Field label="Crew">
          <select value={f.crew} onChange={(e) => set("crew", e.target.value)} style={{ width: "100%" }}>
            {crews.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Roster pattern">
          <select value={f.pattern} onChange={(e) => set("pattern", e.target.value)} style={{ width: "100%" }}>
            {patternNames().map((x) => <option key={x} value={x}>{x} · {PATTERN_REGISTRY[x].label}</option>)}
          </select>
        </Field>
        <Field label="Mobilisation date">
          <input type="date" value={f.mobeDate}
            onChange={(e) => { set("mobeDate", e.target.value); set("anchor", e.target.value); }}
            style={{ width: "100%" }} />
        </Field>
        <Field label="First swing starts">
          <input type="date" value={f.anchor} onChange={(e) => set("anchor", e.target.value)} style={{ width: "100%" }} />
        </Field>
        <Field label="Company">
          <input value={f.company} onChange={(e) => set("company", e.target.value)} style={{ width: "100%" }} />
        </Field>
        <Field label="SAP number">
          <input value={f.sap} onChange={(e) => set("sap", e.target.value)} style={{ width: "100%" }} />
        </Field>
        <Field label="Contract type">
          <select value={f.contract} onChange={(e) => set("contract", e.target.value)} style={{ width: "100%" }}>
            {["Full Time", "Part Time", "Casual", "Contractor", "Labour Hire"].map((x) => <option key={x}>{x}</option>)}
          </select>
        </Field>
        <Field label="Gender">
          <select value={f.gender} onChange={(e) => set("gender", e.target.value)} style={{ width: "100%" }}>
            {["", "M", "F", "X"].map((x) => <option key={x} value={x}>{x || "—"}</option>)}
          </select>
        </Field>
        <Field label="ATSI">
          <select value={f.atsi} onChange={(e) => set("atsi", e.target.value)} style={{ width: "100%" }}>
            <option value="">Not stated</option><option value="Y">Yes</option><option value="N">No</option>
          </select>
        </Field>
        <Field label="Email">
          <input value={f.email} onChange={(e) => set("email", e.target.value)} style={{ width: "100%" }} />
        </Field>
        <Field label="Mobile">
          <input value={f.phone} onChange={(e) => set("phone", e.target.value)} style={{ width: "100%" }} />
        </Field>
      </div>
      {err && <div style={{ color: C.red, fontFamily: mono, fontSize: 11.5, marginBottom: 8 }}>{err}</div>}
      <div style={{ display: "flex", gap: 10 }}>
        <Btn primary onClick={submit}>Add to the roster</Btn>
        <Btn onClick={() => { setOpen(false); setErr(""); }}>Cancel</Btn>
      </div>
      <div style={{ fontFamily: mono, fontSize: 10.5, color: C.dim, marginTop: 12, lineHeight: 1.55 }}>
        Grader and leading hand are read from the position text. Section 26 is set automatically for
        supervisors and project managers. All three can be changed in the table below.
      </div>
    </Panel>
  );
}

/* ============================================================
   FLIGHT SCHEDULE
   ============================================================ */

function Flights() {
  const week = weeklySummary();
  const th = { textAlign: "left", padding: "7px 10px", fontFamily: disp, fontSize: 11.5,
    letterSpacing: ".1em", color: "#FFF", textTransform: "uppercase", background: C.red,
    whiteSpace: "nowrap" };
  const td = { padding: "7px 10px", borderBottom: `1px solid ${C.line}`, fontSize: 12.5,
    verticalAlign: "top", lineHeight: 1.5 };

  const cell = (list) => list.length
    ? list.map((f) => (
        <div key={f.flight + f.depart} style={{ fontFamily: mono, fontSize: 11, marginBottom: 2 }}>
          <span style={{ fontWeight: 600 }}>{f.flight}</span>{" "}
          <span style={{ color: C.dim }}>{f.from} {f.depart} → {f.to} {f.arrive}</span>
        </div>
      ))
    : <span style={{ fontFamily: mono, fontSize: 11, color: C.dimmer }}>—</span>;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Panel title="What runs when" note="the weekly pattern, in and out of Eliwana">
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 900 }}>
            <thead><tr>
              <th style={th}>Day</th>
              <th style={th}>In — morning</th><th style={th}>In — afternoon</th>
              <th style={th}>Out — morning</th><th style={th}>Out — afternoon</th>
            </tr></thead>
            <tbody>
              {week.map((d) => {
                const none = !d.inAM.length && !d.inPM.length && !d.outAM.length && !d.outPM.length;
                return (
                  <tr key={d.day} style={{ background: none ? "#F7F1EE" : (d.day % 2 ? C.panel2 : "#FFF") }}>
                    <td style={{ ...td, fontWeight: 600, whiteSpace: "nowrap",
                      color: none ? C.dimmer : C.ink }}>
                      {d.name}
                      {none && <div style={{ fontFamily: mono, fontSize: 10, color: C.red,
                        fontWeight: 400 }}>no flights</div>}
                    </td>
                    <td style={td}>{cell(d.inAM)}</td>
                    <td style={td}>{cell(d.inPM)}</td>
                    <td style={td}>{cell(d.outAM)}</td>
                    <td style={td}>{cell(d.outPM)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ fontFamily: mono, fontSize: 10.5, color: C.dim, marginTop: 12, lineHeight: 1.6 }}>
          A departure before midday counts as morning, from midday on as afternoon. The roster uses
          this to check every flight you enter — if you ask for a movement on a day it does not run,
          it says so and tells you when the next one is.
        </div>
      </Panel>

      <Panel title="Every leg" note="including the positioning legs that do not carry crew to site" pad={0}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 780 }}>
            <thead><tr>
              <th style={th}>Day</th><th style={th}>Flight</th><th style={th}>Aircraft</th>
              <th style={th}>Depart</th><th style={th}>Arrive</th><th style={th}>Check in</th>
              <th style={th}></th>
            </tr></thead>
            <tbody>
              {["IN", "OUT"].map((dir) => FLIGHTS.filter((f) => f.dir === dir)
                .map((f, i) => (
                  <tr key={dir + i} style={{ background: i % 2 ? C.panel2 : "#FFF",
                    opacity: f.positioning ? 0.6 : 1 }}>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{DAY_NAMES[f.day]}</td>
                    <td style={{ ...td, fontFamily: mono, fontSize: 11.5, fontWeight: 600 }}>{f.flight}</td>
                    <td style={{ ...td, fontFamily: mono, fontSize: 11, color: C.dim }}>{f.aircraft}</td>
                    <td style={{ ...td, fontFamily: mono, fontSize: 11 }}>{f.from} {f.depart}</td>
                    <td style={{ ...td, fontFamily: mono, fontSize: 11 }}>{f.to} {f.arrive}</td>
                    <td style={{ ...td, fontFamily: mono, fontSize: 11, color: C.dim }}>{f.checkIn}</td>
                    <td style={{ ...td, fontFamily: mono, fontSize: 10 }}>
                      <span style={{ color: dir === "IN" ? "#22447B" : "#8A4A1F" }}>
                        {dir === "IN" ? "IN" : "OUT"}</span>
                      {f.positioning && <span style={{ color: C.dimmer }}> · positioning</span>}
                    </td>
                  </tr>
                )))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "10px 14px", fontFamily: mono, fontSize: 10.5, color: C.dim,
          lineHeight: 1.6 }}>
          Positioning legs — Karratha to Port Hedland, Busselton to Solomon, Busselton to Perth —
          are shown for completeness. They do not put anyone on or off site, so the roster ignores them.
          <br />When FMG change the schedule, the file to update is src/flights.js.
        </div>
      </Panel>
    </div>
  );
}

/* ============================================================
   MANNING HISTOGRAM — the monthly report to FMG
   ============================================================ */

/* inTotal: false means the row is a subset of another row and must not be
   added again — leading hands are already counted among the operators. */
const HISTO_ROWS = [
  { label: "No Of Operators on Day Shift", cat: "Operator", key: "opsDay", inTotal: true },
  { label: "No of Operators on Night Shift", cat: "Operator", key: "opsNight", inTotal: true },
  { label: "No of Supervisors on Site", cat: "Supervisor", key: "sup", inTotal: true },
  { label: "Project Manager on Site", cat: "Project Manager", key: "pm", inTotal: true },
  { label: "HSE On Site", cat: "HSE Advisor", key: "hse", inTotal: true },
  { label: "   of which Leading Hands", cat: "Leading Hand", key: "lead", inTotal: false },
];

function Histogram({ daily, dayIndex, focusDate, thresholds }) {
  const monthStart = focusDate.slice(0, 8) + "01";
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(addDays(addDays(monthStart, 32).slice(0, 8) + "01", -1));
  const [target, setTarget] = useState(8);

  const days = useMemo(() => {
    const out = [];
    for (let d = from; d <= to && out.length < 200; d = addDays(d, 1)) {
      const row = daily[dayIndex[d]];
      if (row) out.push(row);
    }
    return out;
  }, [from, to, daily, dayIndex]);

  const val = (row, key) => (key === "opsDay" ? row.opsDay : key === "opsNight" ? row.opsNight : row.counts[key]);
  const totals = days.map((d) =>
    HISTO_ROWS.reduce((n, r) => n + (r.inTotal ? val(d, r.key) : 0), 0));
  const ratios = days.map((d) => (d.opsDay + d.opsNight) / (target || 8));
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const avg = mean(ratios);
  const avgOpsDay = mean(days.map((d) => d.opsDay));
  const avgOpsNight = mean(days.map((d) => d.opsNight));
  const avgOpsAll = avgOpsDay + avgOpsNight;
  const avgOnSite = mean(totals);
  const maxTotal = Math.max(1, ...totals);

  const exportCsv = () => {
    const rows = [
      ["From", from], ["To", to], [],
      ["Category", "Position", ...days.map((d) => fmtShort(d.iso))],
      ...HISTO_ROWS.map((r) => [r.label, r.cat, ...days.map((d) => val(d, r.key))]),
      ["Total", "Total", ...totals],
      [],
      ["", "Operator Manning", ...ratios.map((x) => x.toFixed(3))],
      [],
      ["Averages over the period"],
      ["Average operators - day shift", avgOpsDay.toFixed(4), "the day shift row, averaged"],
      ["Average operators - night shift", avgOpsNight.toFixed(4), "the night shift row, averaged"],
      ["Average operators - all shifts", avgOpsAll.toFixed(4), "day plus night"],
      ["Average total on site", avgOnSite.toFixed(4), "all categories"],
      ["Average manning ratio", avg.toFixed(4), `all operators divided by the target of ${target}`],
    ];
    downloadCsv(`manning-histogram-${from}-to-${to}.csv`, rows);
  };

  const th = { textAlign: "left", padding: "5px 7px", fontFamily: disp, fontSize: 11,
    letterSpacing: ".1em", color: C.dim, textTransform: "uppercase",
    borderBottom: `1px solid ${C.line2}`, whiteSpace: "nowrap" };
  const td = { padding: "4px 7px", borderBottom: `1px solid ${C.line}`, fontFamily: mono,
    fontSize: 11, textAlign: "center" };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Panel title="Manning histogram" note="the monthly report to FMG">
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontFamily: disp, fontSize: 12, letterSpacing: ".12em", color: C.dim }}>FROM</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span style={{ fontFamily: disp, fontSize: 12, letterSpacing: ".12em", color: C.dim }}>TO</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <Btn small onClick={() => {
            const ms = focusDate.slice(0, 8) + "01";
            setFrom(ms); setTo(addDays(addDays(ms, 32).slice(0, 8) + "01", -1));
          }}>This month</Btn>
          <div style={{ width: 1, height: 22, background: C.line }} />
          <span style={{ fontFamily: disp, fontSize: 12, letterSpacing: ".12em", color: C.dim }}>TARGET OPERATORS</span>
          <input type="number" min="1" max="40" value={target} style={{ width: 62 }}
            onChange={(e) => setTarget(Number(e.target.value) || 1)} />
          <div style={{ flex: 1 }} />
          <Btn primary onClick={exportCsv} disabled={!days.length}>Export to Excel</Btn>
        </div>
        <div style={{ fontFamily: mono, fontSize: 10.5, color: C.dim, marginTop: 10, lineHeight: 1.6 }}>
          Leading hands are counted inside the operator rows, so that line is shown for information
          only and is not added into the total.
        </div>
        <div style={{ display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(148px, 1fr))", gap: 10, marginTop: 12 }}>
          {[
            ["Avg operators — day shift", avgOpsDay.toFixed(2), "the day shift row, averaged"],
            ["Avg operators — night shift", avgOpsNight.toFixed(2), "the night shift row, averaged"],
            ["Avg operators — all shifts", avgOpsAll.toFixed(2), "day plus night"],
            ["Avg total on site", avgOnSite.toFixed(2), "all categories"],
            ["Avg manning ratio", avg.toFixed(3), `all operators ÷ target of ${target}`],
            ["Days in the period", String(days.length), `${fmtShort(from)} – ${fmtShort(to)}`],
          ].map(([l, v, sub]) => (
            <div key={l} style={{ background: C.panel2, border: `1px solid ${C.line}`,
              borderTop: `3px solid ${C.orange}`, padding: "8px 11px 10px", borderRadius: 2 }}>
              <div style={{ fontFamily: disp, fontSize: 11, letterSpacing: ".12em",
                textTransform: "uppercase", color: C.dim }}>{l}</div>
              <div style={{ fontFamily: mono, fontSize: 24, fontWeight: 600, color: C.ink,
                lineHeight: 1.15, marginTop: 3 }}>{v}</div>
              <div style={{ fontFamily: mono, fontSize: 10, color: C.dimmer, marginTop: 2 }}>{sub}</div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Daily manning" pad={0}>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr>
              <th style={th}>Category</th><th style={th}>Position</th>
              {days.map((d) => <th key={d.iso} style={{ ...th, textAlign: "center" }}>
                {parse(d.iso).getUTCDate()}<br />
                <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dimmer }}>
                  {MON[parse(d.iso).getUTCMonth()]}</span>
              </th>)}
            </tr></thead>
            <tbody>
              {HISTO_ROWS.map((r) => (
                <tr key={r.label}>
                  <td style={{ ...td, textAlign: "left", fontFamily: sans, fontSize: 12,
                    color: r.inTotal ? C.ink : C.dim,
                    fontStyle: r.inTotal ? "normal" : "italic" }}>{r.label.trim()}</td>
                  <td style={{ ...td, textAlign: "left", color: C.dim }}>{r.cat}</td>
                  {days.map((d) => <td key={d.iso} style={{ ...td,
                    color: r.inTotal ? C.ink : C.dim }}>{val(d, r.key)}</td>)}
                </tr>
              ))}
              <tr style={{ background: C.panel2 }}>
                <td style={{ ...td, textAlign: "left", fontWeight: 600, fontFamily: sans, fontSize: 12 }}>Total</td>
                <td style={{ ...td, textAlign: "left", color: C.dim }}>Total</td>
                {totals.map((t, i) => <td key={i} style={{ ...td, fontWeight: 600 }}>{t}</td>)}
              </tr>
              <tr>
                <td style={{ ...td, textAlign: "left", fontFamily: sans, fontSize: 12 }}>Operator Manning</td>
                <td style={td}></td>
                {ratios.map((x, i) => <td key={i} style={{ ...td, color: x < 1 ? C.red : C.ok }}>
                  {x.toFixed(2)}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Total on site by day">
        <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 150, overflowX: "auto" }}>
          {days.map((d, i) => (
            <div key={d.iso} title={`${fmtLong(d.iso)} — ${totals[i]} on site, ${d.opsDay + d.opsNight} operators`}
              style={{ flex: "0 0 16px", display: "flex", flexDirection: "column",
                justifyContent: "flex-end", height: "100%" }}>
              <div style={{ height: `${(d.opsNight / maxTotal) * 100}%`, background: "#2E3F66" }} />
              <div style={{ height: `${(d.opsDay / maxTotal) * 100}%`, background: C.orange }} />
              <div style={{ height: `${(Math.max(0, totals[i] - d.opsDay - d.opsNight) / maxTotal) * 100}%`,
                background: "#C8B8AE" }} />
              <div style={{ fontFamily: mono, fontSize: 7, color: C.dimmer, textAlign: "center", height: 10 }}>
                {parse(d.iso).getUTCDate()}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 8, fontFamily: mono, fontSize: 10, color: C.dim }}>
          <span><span style={{ color: C.orange }}>█</span> operators, day shift</span>
          <span><span style={{ color: "#2E3F66" }}>█</span> operators, night shift</span>
          <span><span style={{ color: "#C8B8AE" }}>█</span> supervision, PM and HSE</span>
        </div>
      </Panel>
    </div>
  );
}

/* ============================================================
   NO SHOW REGISTER
   ============================================================ */

function NoShow({ employees, noShows, addNoShow, removeNoShow }) {
  const [f, setF] = useState({ empId: employees[0] ? employees[0].id : 1, date: "",
    flight: "", time: "", route: "PER-WHB", reason: "", reported: "",
    rebookedDate: "", rebookedFlight: "", rebookedTime: "" });
  const [err, setErr] = useState("");
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const submit = () => {
    if (!f.date) { setErr("Enter the date of the missed flight."); return; }
    if (!f.reason.trim()) { setErr("A reason is needed — this register gets read by FMG."); return; }
    setErr("");
    addNoShow(f);
    setF({ ...f, date: "", flight: "", time: "", reason: "", reported: "",
      rebookedDate: "", rebookedFlight: "", rebookedTime: "" });
  };

  const th = { textAlign: "left", padding: "6px 8px", fontFamily: disp, fontSize: 11,
    letterSpacing: ".1em", color: C.dim, textTransform: "uppercase",
    borderBottom: `1px solid ${C.line2}`, whiteSpace: "nowrap" };
  const td = { padding: "5px 8px", borderBottom: `1px solid ${C.line}`, fontSize: 12 };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Panel title="Record a no show" note="marks the day on the roster as well">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
          <Field label="Employee">
            <select value={f.empId} onChange={(e) => set("empId", e.target.value)} style={{ width: "100%" }}>
              {employees.slice().sort(bySurname).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
          <Field label="Date"><input type="date" value={f.date}
            onChange={(e) => set("date", e.target.value)} style={{ width: "100%" }} /></Field>
          <Field label="Flight no"><input value={f.flight} placeholder="QF2920"
            onChange={(e) => set("flight", e.target.value)} style={{ width: "100%" }} /></Field>
          <Field label="Time"><input value={f.time} placeholder="06:00"
            onChange={(e) => set("time", e.target.value)} style={{ width: "100%" }} /></Field>
          <Field label="Route"><input value={f.route} placeholder="PER-WHB"
            onChange={(e) => set("route", e.target.value)} style={{ width: "100%" }} /></Field>
          <Field label="Reported to Eliwana Travel"><input value={f.reported}
            placeholder="date, or Not Reported"
            onChange={(e) => set("reported", e.target.value)} style={{ width: "100%" }} /></Field>
          <Field label="Rebooked date"><input type="date" value={f.rebookedDate}
            onChange={(e) => set("rebookedDate", e.target.value)} style={{ width: "100%" }} /></Field>
          <Field label="Rebooked flight"><input value={f.rebookedFlight}
            onChange={(e) => set("rebookedFlight", e.target.value)} style={{ width: "100%" }} /></Field>
          <Field label="Rebooked time"><input value={f.rebookedTime}
            onChange={(e) => set("rebookedTime", e.target.value)} style={{ width: "100%" }} /></Field>
        </div>
        <Field label="Reason">
          <textarea rows={2} value={f.reason} onChange={(e) => set("reason", e.target.value)}
            placeholder="what happened, and who it was reported to" style={{ width: "100%" }} />
        </Field>
        {err && <div style={{ color: C.red, fontFamily: mono, fontSize: 11.5, marginBottom: 8 }}>{err}</div>}
        <Btn primary onClick={submit}>Add to the register</Btn>
      </Panel>

      <Panel title="No show register" note={`${noShows.length} records`} pad={0}>
        <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.line}`, background: C.panel2 }}>
          <Btn small disabled={!noShows.length} onClick={() => downloadCsv("no-show-register.csv", [
            ["Name","Date","Flight No","Time","Route","Reason","Reported to Eliwana Travel",
             "Rebooked Date","Flight No","Time","Entered by","Entered at"],
            ...noShows.map((n) => [n.name, n.date, n.flight, n.time, n.route, n.reason,
              n.reported, n.rebookedDate || "N/A", n.rebookedFlight || "N/A",
              n.rebookedTime || "N/A", n.by, n.at]),
          ])}>Export to Excel</Btn>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ minWidth: 1180 }}>
            <thead><tr>
              <th style={th}>Name</th><th style={th}>Date</th><th style={th}>Flight</th>
              <th style={th}>Time</th><th style={th}>Route</th><th style={th}>Reason</th>
              <th style={th}>Reported</th><th style={th}>Rebooked</th><th style={th}>Flight</th>
              <th style={th}>Time</th><th style={th}></th>
            </tr></thead>
            <tbody>
              {noShows.length === 0 && <tr><td style={{ ...td, color: C.dim, fontFamily: mono }} colSpan={11}>
                Nothing recorded.</td></tr>}
              {noShows.map((n) => (
                <tr key={n.id}>
                  <td style={{ ...td, whiteSpace: "nowrap", fontWeight: 500 }}>{n.name}</td>
                  <td style={{ ...td, fontFamily: mono, fontSize: 11 }}>{n.date ? fmtShort(n.date) : ""}</td>
                  <td style={{ ...td, fontFamily: mono, fontSize: 11 }}>{n.flight}</td>
                  <td style={{ ...td, fontFamily: mono, fontSize: 11 }}>{n.time}</td>
                  <td style={{ ...td, fontFamily: mono, fontSize: 11 }}>{n.route}</td>
                  <td style={{ ...td, fontSize: 11.5, minWidth: 260 }}>{n.reason}</td>
                  <td style={{ ...td, fontFamily: mono, fontSize: 10.5, color: C.dim }}>{n.reported}</td>
                  <td style={{ ...td, fontFamily: mono, fontSize: 11 }}>
                    {n.rebookedDate ? fmtShort(n.rebookedDate) : "N/A"}</td>
                  <td style={{ ...td, fontFamily: mono, fontSize: 11 }}>{n.rebookedFlight || "N/A"}</td>
                  <td style={{ ...td, fontFamily: mono, fontSize: 11 }}>{n.rebookedTime || "N/A"}</td>
                  <td style={td}><Btn small danger onClick={() => removeNoShow(n.id)}>Remove</Btn></td>
                </tr>
              ))}
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
  const kinds = ["All", "cell", "leave", "person", "pattern", "request", "check", "noshow", "note"];
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
