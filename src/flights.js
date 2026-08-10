/* ============================================================
   FMG FLIGHT SCHEDULE

   The weekly pattern of flights in and out of Eliwana, taken
   from the schedule FMG issue.

   Only legs that arrive at or depart from ELIWANA count as
   getting somebody to or from site. The positioning legs
   (Karratha to Port Hedland, Busselton to Solomon, and so on)
   are listed for completeness but are not site movements.

   WHEN THE SCHEDULE CHANGES this is the only file to edit.
   day: 0 Sunday, 1 Monday ... 6 Saturday.
   A departure before 1200 is AM, from 1200 on is PM.
   ============================================================ */

export const SITE = "ELIWANA";

export const FLIGHTS = [
  /* ---------- fly in ---------- */
  { day: 1, dir: "IN",  flight: "QF2920", aircraft: "F100", from: "PERTH",        depart: "0625", to: "ELIWANA",      arrive: "0820", checkIn: "0455 - 0555" },

  { day: 2, dir: "IN",  flight: "QF2920", aircraft: "A320", from: "PERTH",        depart: "0500", to: "ELIWANA",      arrive: "0655", checkIn: "0330 - 0430" },
  { day: 2, dir: "IN",  flight: "QF2922", aircraft: "F100", from: "PERTH",        depart: "0525", to: "ELIWANA",      arrive: "0720", checkIn: "0355 - 0455" },

  { day: 3, dir: "IN",  flight: "QF2920", aircraft: "A319", from: "PERTH",        depart: "0600", to: "ELIWANA",      arrive: "0755", checkIn: "0430 - 0530" },
  { day: 3, dir: "IN",  flight: "QF2928", aircraft: "F100", from: "PERTH",        depart: "1400", to: "ELIWANA",      arrive: "1555", checkIn: "1230 - 1330" },

  { day: 4, dir: "IN",  flight: "AVIAIR", aircraft: "AVIAIR", from: "KARRATHA",   depart: "0530", to: "PORT HEDLAND", arrive: "0605", checkIn: "0430 - 0500", positioning: true },
  { day: 4, dir: "IN",  flight: "AVIAIR", aircraft: "AVIAIR", from: "PORT HEDLAND", depart: "0630", to: "ELIWANA",    arrive: "0725", checkIn: "0530 - 0600" },
  { day: 4, dir: "IN",  flight: "QF2916", aircraft: "F100", from: "BUSSELTON",    depart: "0600", to: "SOLOMON",      arrive: "0805", checkIn: "0430 - 0530", positioning: true },
  { day: 4, dir: "IN",  flight: "QF2916", aircraft: "F100", from: "SOLOMON",      depart: "0845", to: "ELIWANA",      arrive: "0915", checkIn: "0715 - 0815" },
  { day: 4, dir: "IN",  flight: "QF2920", aircraft: "A320", from: "PERTH",        depart: "0525", to: "ELIWANA",      arrive: "0720", checkIn: "0355 - 0455" },
  { day: 4, dir: "IN",  flight: "QF2917", aircraft: "F100", from: "BUSSELTON",    depart: "1240", to: "PERTH",        arrive: "1320", checkIn: "1110 - 1210", positioning: true },
  { day: 4, dir: "IN",  flight: "QF2928", aircraft: "F100", from: "PERTH",        depart: "1250", to: "ELIWANA",      arrive: "1445", checkIn: "1120 - 1220" },

  { day: 5, dir: "IN",  flight: "QF2928", aircraft: "F100", from: "PERTH",        depart: "1355", to: "ELIWANA",      arrive: "1550", checkIn: "1225 - 1325" },

  /* ---------- fly out ---------- */
  { day: 1, dir: "OUT", flight: "QF2921", aircraft: "F100", from: "ELIWANA",      depart: "0900", to: "PERTH",        arrive: "1050", checkIn: "0730 - 0830" },

  { day: 2, dir: "OUT", flight: "QF2921", aircraft: "A320", from: "ELIWANA",      depart: "0735", to: "PERTH",        arrive: "0925", checkIn: "0605 - 0705" },
  { day: 2, dir: "OUT", flight: "QF2923", aircraft: "F100", from: "ELIWANA",      depart: "1505", to: "PERTH",        arrive: "1655", checkIn: "1335 - 1435" },

  { day: 3, dir: "OUT", flight: "QF2921", aircraft: "A319", from: "ELIWANA",      depart: "0940", to: "PERTH",        arrive: "1130", checkIn: "0810 - 0910" },
  { day: 3, dir: "OUT", flight: "QF2929", aircraft: "F100", from: "ELIWANA",      depart: "1630", to: "PERTH",        arrive: "1820", checkIn: "1500 - 1600" },

  { day: 4, dir: "OUT", flight: "QF2921", aircraft: "A320", from: "ELIWANA",      depart: "0825", to: "PERTH",        arrive: "1015", checkIn: "0655 - 0755" },
  { day: 4, dir: "OUT", flight: "AVIAIR", aircraft: "AVIAIR", from: "ELIWANA",    depart: "0750", to: "PORT HEDLAND", arrive: "0845", checkIn: "0620 - 0720" },
  { day: 4, dir: "OUT", flight: "QF2917", aircraft: "F100", from: "ELIWANA",      depart: "0955", to: "BUSSELTON",    arrive: "1200", checkIn: "0855 - 0925" },
  { day: 4, dir: "OUT", flight: "QF2929", aircraft: "F100", from: "ELIWANA",      depart: "1520", to: "PERTH",        arrive: "1710", checkIn: "1350 - 1450" },

  { day: 5, dir: "OUT", flight: "QF2929", aircraft: "F100", from: "ELIWANA",      depart: "1630", to: "PERTH",        arrive: "1820", checkIn: "1500 - 1600" },
];

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const periodOf = (hhmm) => (Number(String(hhmm).slice(0, 2)) < 12 ? "AM" : "PM");

/* the legs that actually get somebody to or from site */
export const siteFlights = () => FLIGHTS.filter((f) => !f.positioning
  && (f.dir === "IN" ? f.to === SITE : f.from === SITE));

export function flightsOn(dayOfWeek, dir, period) {
  return siteFlights().filter((f) => f.day === dayOfWeek && f.dir === dir
    && (!period || periodOf(f.depart) === period));
}

export const flightPeriod = (f) => periodOf(f.depart);

export function describeFlight(f) {
  return `${f.flight} ${f.from} ${f.depart} → ${f.to} ${f.arrive}`;
}

/* Which days of the week have anything at all, for the summary table */
export function weeklySummary() {
  return DAY_NAMES.map((name, day) => ({
    day, name,
    inAM: flightsOn(day, "IN", "AM"), inPM: flightsOn(day, "IN", "PM"),
    outAM: flightsOn(day, "OUT", "AM"), outPM: flightsOn(day, "OUT", "PM"),
  }));
}
