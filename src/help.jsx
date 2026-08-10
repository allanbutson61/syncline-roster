import React, { useState, useMemo } from "react";

/* ============================================================
   HELP — the user guide, inside the program
   ============================================================ */

const C = {
  panel: "#FFFFFF", panel2: "#FBF9F7", line: "#E5DED8", line2: "#CFC5BD",
  ink: "#312122", dim: "#7A6A64", dimmer: "#A2938C", red: "#B02423", orange: "#DC7A40",
};
const mono = "'IBM Plex Mono', ui-monospace, Menlo, monospace";
const sans = "'IBM Plex Sans', system-ui, sans-serif";
const disp = "'Barlow Condensed', 'IBM Plex Sans', sans-serif";

/* [background, text, border, dashed] */
const SW = {
  DS:        ["#DBE5F4", "#22447B", "#BCCCE6"],
  NS:        ["#2E3F66", "#EAF0FB", "#2E3F66"],
  RR:        ["#F2EDE8", "#A2938C", "#E5DED8"],
  GTN:       ["#EDE7E1", "#5E524C", "#DDD3CB"],
  AL:        ["#DCEFE3", "#1E6B4A", "#BEE0CD"],
  SL:        ["#FBE0DC", "#A02D24", "#F0C4BD"],
  LWOP:      ["#E9E0F4", "#5A3E86", "#D6C8EA"],
  PH:        ["#F8DEEE", "#8E3D6C", "#EFC6DF"],
  Nshow:     ["#B02423", "#FFFFFF", "#B02423"],
  FIA:       ["#FFFFFF", "#B02423", "#B02423"],
  "FIA-TBC": ["#FBE3CF", "#A8541B", "#DC7A40", true],
  "C-FIA":   ["#1E88A8", "#FFFFFF", "#1E88A8"],
  "FOP-WL":  ["#FCE2DE", "#9B2B22", "#B02423", true],
};

function Sw({ code }) {
  const [bg, fg, br, dash] = SW[code] || ["#EFE9E4", C.dim, C.line];
  return (
    <span style={{ background: bg, color: fg, border: `1px solid ${br}`,
      borderStyle: dash ? "dashed" : "solid", padding: "2px 8px", fontFamily: mono,
      fontSize: 11, borderRadius: 2, whiteSpace: "nowrap", display: "inline-block",
      minWidth: 56, textAlign: "center" }}>{code}</span>
  );
}

const P = ({ children }) => (
  <p style={{ margin: "0 0 10px", fontSize: 13.5, lineHeight: 1.6 }}>{children}</p>
);

const H = ({ children }) => (
  <div style={{ fontFamily: disp, fontSize: 15, letterSpacing: ".1em", textTransform: "uppercase",
    color: C.ink, fontWeight: 600, margin: "20px 0 8px" }}>{children}</div>
);

function Steps({ items }) {
  return (
    <ol style={{ margin: "0 0 12px", paddingLeft: 20 }}>
      {items.map((t, i) => (
        <li key={i} style={{ fontSize: 13.5, lineHeight: 1.6, marginBottom: 5 }}>{t}</li>
      ))}
    </ol>
  );
}

function Note({ title, children }) {
  return (
    <div style={{ border: `1px solid ${C.orange}`, borderLeft: `4px solid ${C.orange}`,
      background: "#FDF4EE", padding: "11px 14px", margin: "0 0 14px", borderRadius: 2 }}>
      <div style={{ fontFamily: disp, fontSize: 13, letterSpacing: ".08em", textTransform: "uppercase",
        color: C.red, fontWeight: 700, marginBottom: 5 }}>{title}</div>
      <div style={{ fontSize: 13, lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

function Rows({ head, rows }) {
  const th = { textAlign: "left", padding: "7px 10px", fontFamily: disp, fontSize: 11.5,
    letterSpacing: ".1em", color: "#FFF", textTransform: "uppercase", background: C.red };
  const td = { padding: "7px 10px", borderBottom: `1px solid ${C.line}`, fontSize: 13,
    verticalAlign: "top", lineHeight: 1.5 };
  return (
    <table style={{ borderCollapse: "collapse", width: "100%", margin: "0 0 14px",
      border: `1px solid ${C.line}` }}>
      <thead><tr>{head.map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} style={{ background: i % 2 ? C.panel2 : "#FFF" }}>
            {r.map((c, j) => <td key={j} style={td}>{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ---------- the sections ---------- */

const SECTIONS = [
  {
    id: "start", title: "Getting started",
    body: (
      <>
        <H>Sign in with your name</H>
        <P>Along the top there is a box marked <b>WORKING AS</b>. Pick your name from it before you do
          anything else.</P>
        <P>Nothing can be changed until you do. If you try, the system stops you and asks. Every change
          is recorded against whoever made it, so the roster can be traced back afterwards.</P>
        <Note title="Your name resets each time you open it">
          There are no proper logins yet, so the system cannot remember who you are between visits.
          Pick your name again each time. It also means anyone can select any name — treat the change
          log as a working record rather than proof.
        </Note>
        <H>The date you are looking at</H>
        <P>Under the tabs is a date with arrows either side. That is the day the Dashboard is reporting
          on. Most screens follow it.</P>
      </>
    ),
  },
  {
    id: "screens", title: "The screens",
    body: (
      <Rows head={["Tab", "What it is for"]} rows={[
        ["Dashboard", "How many people are on site today, where the gaps are, what needs attention"],
        ["Roster", "The grid. Every person, every day. This is where you make changes"],
        ["Leave", "Enter and remove leave, and see the whole leave register"],
        ["Travel", "Read travel emails from FMG, apply flights, work through travel actions"],
        ["Requests", "Site crew ask for travel changes here; the office actions them"],
        ["People", "Personnel details, roster patterns, mobilisation dates, coverage minimums"],
        ["Histogram", "The monthly manning report for FMG"],
        ["No shows", "The no show register"],
        ["Change log", "Every change made, by whom, and when"],
      ]} />
    ),
  },
  {
    id: "codes", title: "Reading the roster",
    body: (
      <>
        <P>One row per person, one column per day. The month band runs across the top so you always
          know where you are.</P>

        <H>Working days and leave</H>
        <Rows head={["Code", "Means"]} rows={[
          [<Sw code="DS" />, "Day shift on site"],
          [<Sw code="NS" />, "Night shift on site"],
          [<Sw code="RR" />, "R & R at home"],
          [<Sw code="GTN" />, "Working in the Geraldton office"],
          [<Sw code="AL" />, "Annual leave"],
          [<Sw code="SL" />, "Sick leave"],
          [<Sw code="LWOP" />, "Leave without pay"],
          [<Sw code="PH" />, "Public holiday"],
          [<Sw code="Nshow" />, "No show"],
        ]} />

        <H>Travel — the three states</H>
        <P>This is the part worth learning properly. Every flight has three stages, and the colour
          tells you which one it is at.</P>
        <Rows head={["Looks like", "Means", "What to do"]} rows={[
          [<Sw code="FIA" />, "Still to request", "Put it into the FMG workflow"],
          [<Sw code="FIA-TBC" />, "Requested, waiting on the travel team", "Wait, then confirm"],
          [<Sw code="C-FIA" />, "Confirmed by FMG", "Nothing — it is booked"],
          [<Sw code="FOP-WL" />, "Waitlisted — the seat is not held", "Keep checking until FMG confirm it"],
        ]} />
        <P>A waitlisted seat sits <b>alongside</b> the roster rather than on it, so nobody is counted
          as travelling on a seat that is not held. It shows as a pink strip along the bottom of the
          cell, and every one of them is listed on the Travel tab under <b>Waitlisted — keep checking</b>.
          Press <b>Confirmed</b> there once FMG hold it and it goes onto the roster as a C- code.</P>
        <P>The letters say what the movement is: <b>FIA / FIP</b> fly in morning or afternoon,
          <b> FOA / FOP</b> fly out morning or afternoon, <b>DIA / DOP</b> drive in or out, and
          <b> DT</b> a day trip — in and back out the same day.</P>
        <P>The Dashboard carries a running count called <b>Travel to request</b>. If it is not zero,
          somebody has flights that have not been asked for yet.</P>

        <H>Other markers on a cell</H>
        <Rows head={["Marker", "Means"]} rows={[
          ["Small red dot, top right", "Changed by hand, sitting over the pattern"],
          ["Red bar along the bottom", "The roster checks have flagged this day"],
          ["Grey diagonal stripes", "Outside this person's mobilisation dates"],
        ]} />
      </>
    ),
  },
  {
    id: "daily", title: "Changing the roster",
    body: (
      <>
        <H>Change one day for one person</H>
        <Steps items={[
          "Go to the Roster tab.",
          "Leave MODE on 'Click a cell to choose'.",
          "Click the day. A menu opens.",
          "Pick a status — day shift, night shift, R&R, leave, or a travel state.",
          "If the change does not make sense, a warning explains why. You can still apply it, but read it first.",
        ]} />
        <P>To change a run of days, set <b>MODE</b> to the status you want and drag across the cells.
          Dragging does not warn you, so use it for bulk work you are sure about.</P>
        <P>Made a mistake? <b>Undo</b> on the Roster toolbar goes back up to forty steps and tells you
          what it is about to reverse.</P>

        <H>Move someone from days to nights</H>
        <P>Click the day, choose Night shift. Or set MODE to NS and drag across the swing.</P>
        <P>Night shift is not a property of a person — it comes from the roster pattern or from you
          setting it by hand. Nobody is on permanent nights.</P>

        <H>Filters and the date range</H>
        <P>Find someone by name or position, filter by crew or role, or use <b>Pick people</b> to
          choose a handful. <b>Show</b> sets how many weeks you see and <b>Size</b> sets how big the
          cells are — they are separate, so twelve weeks at Normal size keeps every status readable
          and you scroll sideways.</P>
      </>
    ),
  },
  {
    id: "leave", title: "Leave",
    body: (
      <>
        <Steps items={[
          "Leave tab.",
          "Pick the person, the leave type, and the dates.",
          "Add a note if there is something worth recording.",
          "Add leave.",
        ]} />
        <P>The roster updates across the whole range. If the leave covers days with flights booked or
          rostered work, a travel action is raised on the Travel tab listing exactly which flights need
          cancelling or moving.</P>
        <P>Leave that overlaps leave already entered for that person is refused, and the system tells
          you which entry it clashes with.</P>
        <P>Removing a leave record puts those days back on the pattern.</P>
      </>
    ),
  },
  {
    id: "travel", title: "Travel from FMG",
    body: (
      <>
        <Steps items={[
          "Travel tab.",
          "Paste the email into the box, or use Attach file for the PDF.",
          "Read travel.",
          "A checking table appears — the name from the email, who it matched, the date, the movement, the status.",
          "Fix anything wrong. Lines it could not match are shaded red; pick the person from the dropdown.",
          "Untick anything you do not want.",
          "Apply to roster.",
        ]} />
        <Note title="Always check before you apply">
          The email reader is very good but not perfect. It will misread a date or a name eventually.
          The checking table is not a formality — it is the control that stops a bad read going into
          the roster. Never skip it.
        </Note>
        <P>The <b>FMG says</b> column shows their exact booking wording. Anything they hold a seat for
          — Confirmed or OverBooked — comes in as a C- code. Only Requested, Waitlisted or TBC come in
          as -TBC. Watch the OverBooked ones: the seat is held, but it is worth keeping an eye on.</P>
        <P>When you apply a fly-in and a fly-out together, the system fills the days between with the
          work days from that person's pattern. If only the inbound leg is confirmed, it fills the
          swing and puts a still-to-request fly-out on the last day, so it shows up in the count.</P>
        <P>A flight in and a flight out on the same date for the same person becomes a single day trip
          automatically.</P>

        <H>Travel actions</H>
        <P>Actions raised by leave entries appear at the top of the Travel tab. Once you have put the
          change through FMG's workflow, tick <b>Requested in FMG workflow</b>. That records your name
          and the time and takes it off the open list.</P>
      </>
    ),
  },
  {
    id: "requests", title: "Travel change requests",
    body: (
      <>
        <H>Asking for a change — site crew</H>
        <Steps items={[
          "Requests tab.",
          "Pick the person and add the days and movements you need.",
          "Write the reason — this is what the office reads first.",
          "Send request.",
        ]} />
        <P>If what you have asked for does not add up, a warning appears as you fill it in. You can
          still send it; the office sees the same warning.</P>

        <H>Actioning one — office</H>
        <Steps items={[
          "Requests tab. Pending requests show who asked and why.",
          "Look at the before and after roster side by side. Changed days are ringed in red.",
          "Put the change through FMG's workflow.",
          "Mark as requested with travel team. This puts TBC on the roster.",
          "When FMG confirm it, the confirmation email turns it into a C- code.",
        ]} />
      </>
    ),
  },
  {
    id: "people", title: "People and patterns",
    body: (
      <>
        <H>Change someone's roster pattern</H>
        <Steps items={[
          "People tab, Change a roster pattern.",
          "Pick the person and the new pattern.",
          "Set the date it takes effect, and the date their first swing on the new pattern starts.",
          "Apply pattern change.",
        ]} />
        <P>Everything from that date forward is rebuilt on the new pattern. Approved leave and confirmed
          travel in that period are kept. Other manual changes after that date are cleared — so change
          the pattern first, then enter travel and leave.</P>

        <H>Build a new roster pattern</H>
        <Steps items={[
          "People tab, Roster patterns.",
          "Give it a name, e.g. 7D/7N/14R.",
          "Build the cycle in order, block by block, with the travel days where they actually fall.",
          "Save pattern.",
        ]} />
        <P>7D/7N/14R is: fly in AM (1 day), day shift (6), night shift (7), fly out AM (1), R&R (13) —
          twenty-eight days all up.</P>
        <P>The system warns if a cycle is not a whole number of weeks. Any existing pattern can be
          opened with Edit and saved under a new name. A pattern somebody is working cannot be deleted
          until they are moved off it.</P>

        <H>Add a new person</H>
        <Steps items={[
          "People tab, Add a person.",
          "Enter the name as SURNAME, First — the same way the register does it.",
          "Set the position, category, crew, pattern and mobilisation date.",
          "Add to the roster.",
        ]} />
        <P>Grader and leading hand are read from the position text. Section 26 is set automatically for
          supervisors and project managers. All three can be changed in the table underneath.</P>
        <P>When someone leaves, set their <b>demobilisation date</b> rather than deleting them. Their
          history stays and they drop off the roster from that date.</P>
      </>
    ),
  },
  {
    id: "checks", title: "Roster checks and alerts",
    body: (
      <>
        <P>The system reads every person's roster in order and flags sequences that cannot be right.
          They appear on the Dashboard under Roster checks, and as a red bar under the cell.</P>
        <Rows head={["The warning", "What it usually means"]} rows={[
          ["Travels in and out with no rostered work days in between",
           "Someone was put on R&R or leave across a swing but the flights are still there"],
          ["Travels in but is already on site",
           "A second fly-in with no departure between the two"],
          ["Travels out but is still rostered on site afterwards",
           "The fly-out moved earlier but the work days after it were not changed"],
          ["Rostered on site with no inbound travel booked",
           "Work days with no flight in — either the flight is missing or the days are wrong"],
          ["R & R immediately after travelling in",
           "Flew someone in and then gave them the swing off"],
        ]} />
        <Steps items={[
          "Click the warning on the Dashboard. It takes you to that person and that date.",
          "Fix whichever end is wrong — the travel or the work days.",
          "A warning that is genuinely fixed disappears on its own.",
          "If it is correct as it stands, press Checked. That clears it and records who cleared it.",
        ]} />

        <H>Coverage alerts</H>
        <P>Separately, the Dashboard lists days below the minimums — fewer than eight operators, no
          Section 26 supervision, and so on. Filter by date range and type. Runs of consecutive days
          show as one line.</P>
        <P>The minimums are set on the People tab. Setting one to zero tracks the number without
          raising an alert.</P>
        <Note title="Section 26 and the operator count">
          If there is no supervisor and no project manager on site, a leading hand steps into the
          Section 26 role. The system then stops counting them as an operator and the tile shows
          "1 acting §26". A leading hand working nights does not count towards the leading hand total.
        </Note>
      </>
    ),
  },
  {
    id: "reports", title: "Monthly reporting",
    body: (
      <>
        <H>The manning histogram</H>
        <Steps items={[
          "Histogram tab.",
          "Set the From and To dates, or press This month.",
          "Check the target operator number is right — it is 8 by default.",
          "Export to Excel.",
        ]} />
        <P>The export uses the same layout as the old spreadsheet: a row per category, a column per
          day, totals, the operator manning ratio for each day, and the average across the period.</P>
        <P>Operators are split into day shift and night shift on separate rows. The old spreadsheet
          combined them. The totals are the same either way.</P>

        <H>The no show register</H>
        <Steps items={[
          "No shows tab.",
          "Fill in the person, date, flight, time and route.",
          "Write what happened and who it was reported to — FMG read this register.",
          "Add the rebooking details if there are any.",
          "Add to the register.",
        ]} />
        <P>The day is marked on the roster as a no show at the same time.</P>

        <H>Exporting</H>
        <P>There is an export button on the Roster tab, the personnel register, the histogram and the
          no show register. Each downloads a file that opens straight in Excel. The roster export
          covers whatever range and people you are looking at — filter first, then export.</P>
      </>
    ),
  },
  {
    id: "limits", title: "Signing in, and what it still cannot do",
    body: (
      <>
        <H>Signing in</H>
        <P>You sign in with your own email and password. Everyone is working on the same roster, so a
          change you make appears on everyone else's screen within a second or two, recorded against
          your name.</P>
        <P>If someone else changes something while you have it open, a green <b>updated by someone
          else</b> tag appears at the top and the screen refreshes itself. You do not need to do
          anything.</P>
        <P>Forgotten your password? Use the link on the sign-in page. Need an account, or a change of
          access? Ask Jaki.</P>

        <H>Who can change what</H>
        <Rows head={["", "Administrators", "Site supervision"]} rows={[
          ["The roster, day to day", "Yes", "Yes"],
          ["Leave", "Yes", "Yes"],
          ["Travel and requests", "Yes", "Yes"],
          ["No show register", "Yes", "Yes"],
          ["Personnel records", "Yes", "Read only"],
          ["Roster patterns", "Yes", "Read only"],
          ["Coverage minimums", "Yes", "Read only"],
        ]} />
        <P>If you try to change something that isn't yours to change, the system says so and points
          you at the office. It is enforced by the database as well, not just the screen.</P>

        <H>What it still cannot do</H>
        <ul style={{ margin: "0 0 14px", paddingLeft: 20 }}>
          {[
            "If two people change the same person on the same day within a second of each other, the later one wins. Everything else merges cleanly.",
            "It needs an internet connection. There is no offline mode.",
            "Emails to the administrator are built but may not be switched on yet — check whether travel actions say emailed or not.",
          ].map((t, i) => (
            <li key={i} style={{ fontSize: 13.5, lineHeight: 1.6, marginBottom: 6 }}>{t}</li>
          ))}
        </ul>

        <H>During the parallel run</H>
        <P>Keep doing the spreadsheet as normal and enter the same things here. Where the two disagree,
          work out which is right and why — a difference is either a fault in the system or something
          missed in one of them, and both are worth knowing.</P>
        <P>Send anything that looks wrong, with the person and the date it happened on. A screenshot is
          worth ten sentences.</P>
      </>
    ),
  },
];

/* ---------- the tab ---------- */


export default function Help() {
  const [open, setOpen] = useState("start");
  const [q, setQ] = useState("");

  const text = (n) => {
    if (n == null || typeof n === "boolean") return "";
    if (typeof n === "string" || typeof n === "number") return String(n);
    if (Array.isArray(n)) return n.map(text).join(" ");
    if (n.props && n.props.children) return text(n.props.children);
    if (n.props && n.props.rows) return text(n.props.rows);
    return "";
  };

  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return null;
    return SECTIONS.filter((s) =>
      (s.title + " " + text(s.body)).toLowerCase().includes(needle)).map((s) => s.id);
  }, [q]);

  const shown = hits ? SECTIONS.filter((s) => hits.includes(s.id)) : SECTIONS;

  return (
    <div style={{ fontFamily: sans, color: C.ink, display: "grid",
      gridTemplateColumns: "minmax(190px, 230px) 1fr", gap: 18, alignItems: "start" }}>

      <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 2,
        position: "sticky", top: 12 }}>
        <div style={{ padding: "11px 14px", borderBottom: `1px solid ${C.line}`,
          fontFamily: disp, fontSize: 15.5, letterSpacing: ".12em", textTransform: "uppercase" }}>
          User guide
        </div>
        <div style={{ padding: 10, borderBottom: `1px solid ${C.line}` }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search the guide"
            style={{ width: "100%", background: "#FFF", color: C.ink, border: `1px solid ${C.line2}`,
              padding: "6px 8px", fontFamily: mono, fontSize: 12, borderRadius: 2 }} />
        </div>
        {SECTIONS.map((s) => {
          const dimmed = hits && !hits.includes(s.id);
          return (
            <div key={s.id} onClick={() => { setOpen(s.id); setQ(""); }}
              style={{ padding: "8px 14px", cursor: "pointer", fontSize: 13,
                borderBottom: `1px solid ${C.line}`, opacity: dimmed ? 0.35 : 1,
                background: open === s.id && !hits ? "#F5E3DA" : "transparent",
                borderLeft: open === s.id && !hits ? `3px solid ${C.red}` : "3px solid transparent",
                fontWeight: open === s.id && !hits ? 600 : 400 }}>
              {s.title}
            </div>
          );
        })}
        <div style={{ padding: "10px 14px", fontFamily: mono, fontSize: 10, color: C.dimmer,
          lineHeight: 1.5 }}>
          Faults and questions to Jaki Soutar, admin@synclinehaulage.com.au
        </div>
      </div>

      <div style={{ display: "grid", gap: 14 }}>
        {hits && (
          <div style={{ fontFamily: mono, fontSize: 11.5, color: C.dim }}>
            {shown.length === 0 ? "Nothing found — try a different word."
              : `${shown.length} section${shown.length === 1 ? "" : "s"} mention "${q.trim()}"`}
          </div>
        )}
        {shown.map((s) => {
          const showBody = !!hits || open === s.id;
          return (
            <div key={s.id} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 2 }}>
              <div onClick={() => setOpen(open === s.id ? "" : s.id)}
                style={{ padding: "11px 16px", borderBottom: showBody ? `1px solid ${C.line}` : "none",
                  cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
                  background: C.panel2 }}>
                <span style={{ fontFamily: disp, fontSize: 15.5, letterSpacing: ".12em",
                  textTransform: "uppercase", flex: 1 }}>{s.title}</span>
                <span style={{ fontFamily: mono, fontSize: 14, color: C.dim }}>
                  {showBody ? "\u2212" : "+"}</span>
              </div>
              {showBody && <div style={{ padding: "14px 18px", maxWidth: 780 }}>{s.body}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
