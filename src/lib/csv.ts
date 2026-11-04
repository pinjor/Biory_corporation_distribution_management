/** Minimal RFC-4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let i = 0;
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");
  while (i < src.length) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\n" || c === "\r") {
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      if (c === "\r" && src[i + 1] === "\n") i++;
      i++;
      continue;
    }
    field += c;
    i++;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((r) =>
      r
        .map((v) => {
          const s = v === null || v === undefined ? "" : String(v);
          return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\n");
}

export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const blob = new Blob(["\uFEFF" + toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const OPENING_STOCK_HEADERS = ["product_code", "batch_no", "mfg_date", "expiry_date", "qty", "remarks"] as const;

export interface OpeningRow {
  line: number;
  product_code: string;
  product_name?: string;
  batch_no: string;
  mfg_date: string;
  expiry_date: string;
  qty: number;
  remarks: string;
}

export interface RowIssue {
  line: number;
  message: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates a bulk opening-stock CSV before it is sent for atomic import.
 * Returns valid rows plus a per-line issue report (unknown product, bad dates,
 * expired batch, non-positive qty, duplicate product+batch in the file).
 */
export function validateOpeningStock(
  table: string[][],
  products: Map<string, string>,
  today: string,
): { rows: OpeningRow[]; issues: RowIssue[] } {
  const issues: RowIssue[] = [];
  const rows: OpeningRow[] = [];
  if (table.length === 0) return { rows, issues: [{ line: 0, message: "The file is empty" }] };
  const header = table[0].map((h) => h.trim().toLowerCase());
  const idx = Object.fromEntries(OPENING_STOCK_HEADERS.map((h) => [h, header.indexOf(h)]));
  for (const required of ["product_code", "batch_no", "expiry_date", "qty"]) {
    if (idx[required] < 0) issues.push({ line: 1, message: `Missing column "${required}"` });
  }
  if (issues.length) return { rows, issues };
  const seen = new Set<string>();
  table.slice(1).forEach((r, k) => {
    const line = k + 2;
    const get = (h: string) => (idx[h] >= 0 ? (r[idx[h]] ?? "").trim() : "");
    const code = get("product_code");
    const batch = get("batch_no");
    const mfg = get("mfg_date");
    const exp = get("expiry_date");
    const qtyRaw = get("qty");
    const qty = Number(qtyRaw);
    const problems: string[] = [];
    if (!products.has(code)) problems.push(`unknown product code "${code}"`);
    if (!batch) problems.push("batch number is required");
    if (!ISO.test(exp)) problems.push("expiry_date must be YYYY-MM-DD");
    else if (exp <= today) problems.push("batch is already expired");
    if (mfg && !ISO.test(mfg)) problems.push("mfg_date must be YYYY-MM-DD");
    if (mfg && ISO.test(mfg) && ISO.test(exp) && mfg >= exp) problems.push("mfg_date must be before expiry_date");
    if (!Number.isInteger(qty) || qty <= 0) problems.push("qty must be a whole number above zero");
    const key = `${code}::${batch}`.toLowerCase();
    if (seen.has(key)) problems.push("duplicate product + batch in this file");
    seen.add(key);
    if (problems.length) issues.push({ line, message: problems.join("; ") });
    else
      rows.push({
        line,
        product_code: code,
        product_name: products.get(code),
        batch_no: batch,
        mfg_date: mfg,
        expiry_date: exp,
        qty,
        remarks: get("remarks"),
      });
  });
  return { rows, issues };
}
