import { addDays, todayBD } from "@/lib/format";

/** How a punch pair is counted. Days with no punch are absent. */
export type AttendanceKind = "FULL" | "HALF" | "SHORT" | "ON_DUTY" | "MISSED" | "ABSENT";

export const ATTENDANCE_LABEL: Record<AttendanceKind, string> = {
  FULL: "Full day",
  HALF: "Half day",
  SHORT: "Short day",
  ON_DUTY: "On duty",
  MISSED: "Missed punch out",
  ABSENT: "Absent",
};

const FULL_HOURS = 6;
const HALF_HOURS = 3;
export const MAX_ATTENDANCE_DAYS = 92;

export type AttendancePerson = { id: string; name: string; code: string; photo?: string | null };

export type AttendancePunch = {
  soId: string;
  workDate: string;
  punchedIn: string;
  punchedOut: string | null;
};

export type AttendanceRow = {
  soId: string;
  name: string;
  code: string;
  photo: string | null;
  workDate: string;
  punchedIn: string | null;
  punchedOut: string | null;
  kind: AttendanceKind;
  hours: string;
};

function dayBD(ms: number): string {
  return new Date(ms).toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
}

export function attendanceKind(
  punchedIn: string | null,
  punchedOut: string | null,
  workDate: string,
  now = Date.now(),
): AttendanceKind {
  if (!punchedIn) return "ABSENT";
  const start = Date.parse(punchedIn);
  if (Number.isNaN(start)) return "ABSENT";
  if (!punchedOut) {
    if (workDate < dayBD(now)) return "MISSED";
    const openHours = (now - start) / 3_600_000;
    return openHours >= FULL_HOURS ? "FULL" : "ON_DUTY";
  }
  const end = Date.parse(punchedOut);
  if (Number.isNaN(end) || end < start) return "SHORT";
  const hours = (end - start) / 3_600_000;
  if (hours >= FULL_HOURS) return "FULL";
  if (hours <= HALF_HOURS) return "HALF";
  return "SHORT";
}

export function formatHours(startIso: string | null, endMs: number): string {
  if (!startIso) return "—";
  const start = Date.parse(startIso);
  if (Number.isNaN(start)) return "—";
  const minutes = Math.max(0, Math.floor((endMs - start) / 60_000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export function eachWorkDay(from: string, to: string, now = Date.now()): { days: string[]; trimmed: boolean } {
  const today = dayBD(now);
  const end = to < today ? to : today;
  if (!from || !end || from > end) return { days: [], trimmed: false };
  const days: string[] = [];
  let cursor = from;
  while (cursor <= end && days.length < MAX_ATTENDANCE_DAYS) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return { days, trimmed: cursor <= end };
}

export function monthStart(today = todayBD()): string {
  return `${today.slice(0, 8)}01`;
}

/** One row per officer per day in the range. Missing punches become absent. */
export function buildAttendance(
  people: readonly AttendancePerson[],
  punches: readonly AttendancePunch[],
  from: string,
  to: string,
  now = Date.now(),
): { rows: AttendanceRow[]; trimmed: boolean } {
  const { days, trimmed } = eachWorkDay(from, to, now);
  const byKey = new Map(punches.map((punch) => [`${punch.soId}|${punch.workDate}`, punch]));
  const rows: AttendanceRow[] = [];
  for (const day of days) {
    for (const person of people) {
      const punch = byKey.get(`${person.id}|${day}`);
      const punchedIn = punch?.punchedIn ?? null;
      const punchedOut = punch?.punchedOut ?? null;
      const kind = attendanceKind(punchedIn, punchedOut, day, now);
      const endMs = punchedOut ? Date.parse(punchedOut) : now;
      const hours = kind === "ABSENT" || kind === "MISSED" ? "—" : formatHours(punchedIn, endMs);
      rows.push({
        soId: person.id,
        name: person.name,
        code: person.code,
        photo: person.photo ?? null,
        workDate: day,
        punchedIn,
        punchedOut,
        kind,
        hours,
      });
    }
  }
  rows.sort((a, b) => b.workDate.localeCompare(a.workDate) || a.name.localeCompare(b.name));
  return { rows, trimmed };
}
