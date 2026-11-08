const TZ = "Asia/Dhaka";

const bdt = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const bdtCompact = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });
const int = new Intl.NumberFormat("en-IN");

export function toNum(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** ৳1,23,456.00 — Bangladeshi/Indian digit grouping */
export function formatBDT(v: unknown): string {
  const n = toNum(v);
  return `${n < 0 ? "−" : ""}৳${bdt.format(Math.abs(n))}`;
}

/** ৳8.4L / ৳1.2Cr for dashboards */
export function formatBDTCompact(v: unknown): string {
  const n = toNum(v);
  const a = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (a >= 1e7) return `${sign}৳${bdtCompact.format(a / 1e7)}Cr`;
  if (a >= 1e5) return `${sign}৳${bdtCompact.format(a / 1e5)}L`;
  if (a >= 1e3) return `${sign}৳${bdtCompact.format(a / 1e3)}k`;
  return `${sign}৳${bdtCompact.format(a)}`;
}

export function formatInt(v: unknown): string {
  return int.format(toNum(v));
}

export function formatPct(v: unknown): string {
  return `${toNum(v).toFixed(2).replace(/\.?0+$/, "")}%`;
}

export function formatDate(v: string | Date | null | undefined): string {
  if (!v) return "—";
  const d = typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00+06:00`) : new Date(v);
  return d.toLocaleDateString("en-GB", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(v: string | Date | null | undefined): string {
  if (!v) return "—";
  return new Date(v).toLocaleString("en-GB", {
    timeZone: TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Today's date in Dhaka as YYYY-MM-DD */
export function todayBD(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

/** Calendar day in Dhaka for a date or timestamp. */
export function dayBD(value: string | null | undefined): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Date(value).toLocaleDateString("en-CA", { timeZone: TZ });
}

/** True when the value's Dhaka day falls inside from/to. Blank ends are open. */
export function inDateRange(value: string | null | undefined, from: string, to: string): boolean {
  if (!from && !to) return true;
  const day = dayBD(value);
  if (!day) return false;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86400000);
}

export type RangeKey = "today" | "yesterday" | "week" | "month" | "last_month" | "custom";

export function rangeFor(key: RangeKey, today = todayBD()): { from: string; to: string } {
  const [y = 2026, m = 1] = today.split("-").map(Number);
  switch (key) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const d = addDays(today, -1);
      return { from: d, to: d };
    }
    case "week": {
      // Bangladesh work week starts Saturday
      const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 Sun .. 6 Sat
      const sinceSat = (dow + 1) % 7;
      return { from: addDays(today, -sinceSat), to: today };
    }
    case "month":
      return { from: `${y}-${String(m).padStart(2, "0")}-01`, to: today };
    case "last_month": {
      const lm = m === 1 ? 12 : m - 1;
      const ly = m === 1 ? y - 1 : y;
      const last = new Date(Date.UTC(ly, lm, 0)).getUTCDate();
      return {
        from: `${ly}-${String(lm).padStart(2, "0")}-01`,
        to: `${ly}-${String(lm).padStart(2, "0")}-${String(last).padStart(2, "0")}`,
      };
    }
    default:
      return { from: today, to: today };
  }
}

export function humanize(s: string | null | undefined): string {
  if (!s) return "—";
  return s
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function errorMessage(e: unknown): string {
  if (!e) return "Something went wrong";
  if (typeof e === "string") return e;
  if (typeof e === "object" && e && "message" in e) return String((e as { message: unknown }).message);
  return "Something went wrong";
}
