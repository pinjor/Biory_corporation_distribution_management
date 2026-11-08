import { api } from "@/lib/api/client";
import { formatDate } from "@/lib/format";
import { openPdfPreview, type PdfDocument } from "@/lib/pdf-preview";

type DocLine = { product: string; code: string; batch: string; expiry: string; qty: number };

type StockDocument = {
  kind: "issue" | "receive" | "opening" | "adjustment";
  number: string;
  status: string;
  when: string;
  officer: string;
  officerCode: string;
  place?: string;
  remarks: string;
  lines: DocLine[];
};

const GREEN = "0.051 0.361 0.290";
const MUTED = "0.38 0.43 0.41";
const RULE = "0.45 0.52 0.50";
const STROKE = "0.22 0.22 0.22";
const BAND = "0.93 0.93 0.93";
const SOFT = "0.90 0.96 0.93";

function pdfText(value: unknown): string {
  return String(value ?? "")
    .replace(/[−–—]/g, "-")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function plain(value: unknown): string {
  return String(value ?? "").replace(/[−–—]/g, "-").replace(/[^\x20-\x7E]/g, "");
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function longDate(value: string): string {
  if (!value) return "—";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00+06:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", day: "2-digit", month: "long", year: "numeric" });
}

const REG_W: Record<string, number> = { " ": 278, ".": 278, ",": 278, "-": 333, "/": 278, ":": 278 };
const BOLD_W: Record<string, number> = {
  " ": 278, ".": 278, ",": 278, "-": 333, "/": 278, ":": 333,
  A: 722, B: 722, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 556, K: 722, L: 611, M: 833,
  N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
};

function glyphWidth(ch: string, bold: boolean): number {
  const table = bold ? BOLD_W : REG_W;
  if (table[ch]) return table[ch];
  if (ch >= "0" && ch <= "9") return 556;
  if (bold && ch >= "A" && ch <= "Z") return 700;
  if (ch === "i" || ch === "l" || ch === "I" || ch === "j") return 278;
  if ("mwMW".includes(ch)) return bold ? 860 : 780;
  return bold ? 620 : 520;
}

function textWidth(value: string, size: number, bold = false): number {
  let units = 0;
  for (const ch of value) units += glyphWidth(ch, bold);
  return (units / 1000) * size;
}

const CODE39: Record<string, string> = {
  "0": "000110100", "1": "100100001", "2": "001100001", "3": "101100000", "4": "000110001",
  "5": "100110000", "6": "001110000", "7": "000100101", "8": "100100100", "9": "001100100",
  A: "100001001", B: "001001001", C: "101001000", D: "000011001", E: "100011000",
  F: "001011000", G: "000001101", H: "100001100", I: "001001100", J: "000011100",
  K: "100000011", L: "001000011", M: "101000010", N: "000010011", O: "100010010",
  P: "001010010", Q: "000000111", R: "100000110", S: "001000110", T: "000010110",
  U: "110000001", V: "011000001", W: "111000000", X: "010010001", Y: "110010000",
  Z: "011010000", "-": "010000101", ".": "110000100", " ": "011000100", "*": "010010100",
};

function barcodeWidth(value: string): number {
  const narrow = 0.72;
  const wide = 1.7;
  let width = 0;
  for (const ch of `*${plain(value).toUpperCase()}*`) {
    const pat = CODE39[ch];
    if (!pat) continue;
    for (const bit of pat) width += bit === "1" ? wide : narrow;
    width += narrow;
  }
  return width;
}

function assemblePdf(contents: string[]): Uint8Array {
  const objects: { n: number; body: string }[] = [];
  const fontN = 3;
  const boldN = 4;
  const pagesN = 2;
  const pageRefs: number[] = [];
  let n = 5;
  for (const content of contents) {
    const contentN = n++;
    const pageN = n++;
    pageRefs.push(pageN);
    objects.push({ n: contentN, body: `<< /Length ${content.length} >>\nstream\n${content}endstream` });
    objects.push({
      n: pageN,
      body: `<< /Type /Page /Parent ${pagesN} 0 R /MediaBox [0 0 595 842] /Contents ${contentN} 0 R /Resources << /Font << /F1 ${fontN} 0 R /F2 ${boldN} 0 R >> >> >>`,
    });
  }
  objects.unshift(
    { n: 1, body: `<< /Type /Catalog /Pages ${pagesN} 0 R >>` },
    { n: pagesN, body: `<< /Type /Pages /Kids [${pageRefs.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageRefs.length} >>` },
    { n: fontN, body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>" },
    { n: boldN, body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>" },
  );
  objects.sort((a, b) => a.n - b.n);
  let out = "%PDF-1.4\n";
  const offsets = new Array<number>(objects.length + 1).fill(0);
  for (const obj of objects) {
    offsets[obj.n] = new TextEncoder().encode(out).length;
    out += `${obj.n} 0 obj\n${obj.body}\nendobj\n`;
  }
  const xref = new TextEncoder().encode(out).length;
  out += `xref\n0 ${objects.length + 1}\n`;
  out += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i++) out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(out);
}

function buildDocument(
  doc: StockDocument,
  company: { company_name?: string | null; company_address?: string | null; company_phone?: string | null },
): Uint8Array {
  const L = 36;
  const R = 559;
  const companyName = company.company_name || "BIORY Corporation";
  const title = doc.kind === "issue" ? "Issue Report" : doc.kind === "receive" ? "Receive Report" : doc.kind === "opening" ? "Opening Stock Report" : "Stock Adjustment Report";
  const edges = [L, 58, 118, 300, 400, 490, R];
  let ops = "";
  const text = (x: number, y: number, value: unknown, size = 8, bold = false) => {
    ops += `BT /${bold ? "F2" : "F1"} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${pdfText(value)}) Tj ET\n`;
  };
  const rightText = (edge: number, y: number, value: unknown, size = 8, bold = false) => {
    const shown = plain(value);
    text(edge - textWidth(shown, size, bold), y, shown, size, bold);
  };
  const clipTo = (value: unknown, width: number, size: number, bold = false) => {
    let shown = plain(value);
    while (shown.length > 1 && textWidth(shown, size, bold) > width) shown = shown.slice(0, -1);
    return shown;
  };
  const ink = (color: string) => {
    ops += `${color} rg\n`;
  };
  const hline = (y: number, x1: number, x2: number) => {
    ops += `${STROKE} RG 0.8 w ${x1.toFixed(2)} ${y.toFixed(2)} m ${x2.toFixed(2)} ${y.toFixed(2)} l S\n`;
  };
  const vline = (x: number, y1: number, y2: number) => {
    ops += `${STROKE} RG 0.8 w ${x.toFixed(2)} ${y1.toFixed(2)} m ${x.toFixed(2)} ${y2.toFixed(2)} l S\n`;
  };
  const fillRect = (x: number, y: number, w: number, h: number, color: string) => {
    ops += `${color} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f\n`;
  };
  const barcode = (x: number, y: number, value: string, height = 26) => {
    const narrow = 0.72;
    const wide = 1.7;
    const payload = `*${plain(value).toUpperCase().replace(/[^0-9A-Z\-.]/g, "-")}*`;
    let cx = x;
    ink("0 0 0");
    for (const ch of payload) {
      const pat = CODE39[ch];
      if (!pat) continue;
      for (let i = 0; i < pat.length; i++) {
        const w = pat[i] === "1" ? wide : narrow;
        if (i % 2 === 0) ops += `${cx.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${height} re f\n`;
        cx += w;
      }
      cx += narrow;
    }
  };
  const drawHeader = (top: number) => {
    const bottom = top - 18;
    fillRect(L, bottom, R - L, 18, BAND);
    hline(top, L, R);
    hline(bottom, L, R);
    for (const x of edges) vline(x, bottom, top);
    ink("0 0 0");
    const labels = ["#", "Code", "Product", "Batch", "Expiry", "Qty"];
    const aligns = ["left", "left", "left", "left", "left", "right"] as const;
    labels.forEach((label, i) => {
      if (aligns[i] === "right") rightText(edges[i + 1]! - 4, bottom + 5, label, 8, true);
      else text(edges[i]! + 4, bottom + 5, label, 8, true);
    });
    return bottom;
  };

  ops += `${GREEN} rg 0 834 595 8 re f\n`;
  ink(GREEN);
  text(L, 792, companyName, 15, true);
  ink(MUTED);
  text(L, 776, company.company_address || "Dhaka, Bangladesh", 8);
  if (company.company_phone) text(L, 764, `Phone: ${company.company_phone}`, 8);
  const barW = barcodeWidth(doc.number);
  barcode(R - barW, 786, doc.number, 26);
  ink("0 0 0");
  rightText(R, 770, title, 16, true);
  ink(MUTED);
  rightText(R, 756, titleCase(doc.status), 9);

  let y = 738;
  const metaH = 34;
  const metaCols = [L, L + (R - L) / 3, L + (2 * (R - L)) / 3, R];
  fillRect(L, y - 16, R - L, 16, BAND);
  hline(y, L, R);
  hline(y - 16, L, R);
  hline(y - metaH, L, R);
  for (const x of metaCols) vline(x, y - metaH, y);
  ink("0 0 0");
  [
    doc.kind === "opening" || doc.kind === "adjustment" ? "Entry #" : "Requisition #",
    doc.kind === "issue" ? "Issued" : doc.kind === "receive" ? "Received" : "Entry date",
    "Status",
  ].forEach((label, i) => text(metaCols[i]! + 6, y - 12, label, 8, true));
  [doc.number, doc.when ? longDate(doc.when) : "Not recorded", titleCase(doc.status)].forEach((value, i) => {
    text(metaCols[i]! + 6, y - 28, clipTo(value, (R - L) / 3 - 12, 9, true), 9, true);
  });

  y -= metaH + 22;
  const mid = L + (R - L) / 2 + 8;
  ink("0 0 0");
  text(L, y, doc.kind === "opening" || doc.kind === "adjustment" ? "Prepared by:" : "Sales officer:", 9, true);
  text(mid, y, doc.kind === "issue" ? "Issued from:" : doc.kind === "receive" ? "Received into:" : "Store:", 9, true);
  hline(y - 4, L, mid - 16);
  hline(y - 4, mid, R);
  y -= 18;
  text(L, y, clipTo(doc.officer || "—", 240, 10, true), 10, true);
  text(mid, y, doc.place ?? (doc.kind === "receive" ? "Sales Officer stock" : "Central warehouse"), 10, true);
  y -= 13;
  ink(MUTED);
  text(L, y, doc.officerCode || "", 8);
  text(mid, y, companyName, 8);

  y -= 22;
  ink("0 0 0");
  text(L, y, "Notes", 9, true);
  y -= 14;
  ink(MUTED);
  const remark = plain(doc.remarks.trim() ? doc.remarks.trim() : "No remarks provided.");
  const noteRows: string[] = [];
  let pending = "";
  for (const word of remark.split(/\s+/)) {
    const next = pending ? `${pending} ${word}` : word;
    if (pending && textWidth(next, 8) > R - L) {
      noteRows.push(pending);
      pending = word;
    } else pending = next;
  }
  if (pending) noteRows.push(pending);
  noteRows.slice(0, 2).forEach((row) => {
    text(L, y, row, 8);
    y -= 12;
  });

  y -= 10;
  let rowBottom = drawHeader(y);
  const lines = doc.lines.length ? doc.lines : [{ product: "No lines", code: "", batch: "", expiry: "", qty: 0 }];
  lines.forEach((line, index) => {
    const bottom = rowBottom - 26;
    if (index % 2 === 1) fillRect(L, bottom, R - L, 26, "0.97 0.97 0.97");
    hline(bottom, L, R);
    for (const x of edges) vline(x, bottom, rowBottom);
    ink("0 0 0");
    text(edges[0]! + 4, bottom + 10, String(index + 1), 8);
    text(edges[1]! + 4, bottom + 10, clipTo(line.code || "—", 52, 8, true), 8, true);
    text(edges[2]! + 4, bottom + 10, clipTo(line.product || "Product", 170, 8, true), 8, true);
    text(edges[3]! + 4, bottom + 10, clipTo(line.batch || "—", 90, 8), 8);
    text(edges[4]! + 4, bottom + 10, clipTo(line.expiry || "—", 80, 8), 8);
    rightText(R - 4, bottom + 10, String(line.qty), 8, true);
    rowBottom = bottom;
  });

  const total = lines.reduce((sum, line) => sum + line.qty, 0);
  const boxTop = rowBottom - 18;
  const boxBottom = boxTop - 18;
  fillRect(360, boxBottom, R - 360, 18, SOFT);
  hline(boxTop, 360, R);
  hline(boxBottom, 360, R);
  vline(360, boxBottom, boxTop);
  vline(R, boxBottom, boxTop);
  ink(GREEN);
  rightText(470, boxBottom + 5, "Total qty:", 8, true);
  rightText(R - 6, boxBottom + 5, String(total), 8, true);

  ops += `${RULE} RG 1 w 40 48 m 555 48 l S\n`;
  ops += `${MUTED} rg\n`;
  const note = doc.kind === "issue"
    ? "This is a system-generated issue report. Stock leaves the central warehouse on issue."
    : doc.kind === "receive"
      ? "This is a system-generated receive report. Stock is added to the Sales Officer on receipt."
      : doc.kind === "opening"
        ? "This is a system-generated opening stock report. Stock is added to the central warehouse when the entry is approved."
        : "This is a system-generated adjustment report. Stock changes when the entry is approved.";
  ops += `BT /F1 8 Tf 1 0 0 1 40 34 Tm (${pdfText(note)}) Tj ET\n`;
  ops += `${RULE} RG 0.8 w 40 16 m 555 16 l S\n`;
  ops += `${MUTED} rg\n`;
  ops += `BT /F1 7 Tf 1 0 0 1 36 6 Tm (${pdfText(`${companyName} | Stock`)}) Tj ET\n`;
  const pageLabel = "Page 1 of 1";
  ops += `BT /F1 7 Tf 1 0 0 1 ${(559 - textWidth(pageLabel, 7)).toFixed(2)} 6 Tm (${pdfText(pageLabel)}) Tj ET\n`;
  return assemblePdf([ops]);
}


async function companySettings() {
  const settings = await api.from("app_settings").select("company_name, company_address, company_phone").eq("id", 1).maybeSingle();
  return settings.data ?? { company_name: "BIORY Corporation" };
}

async function loadDocument(id: string, kind: "issue" | "receive"): Promise<StockDocument> {
  const { data: req, error } = await api
    .from("requisitions")
    .select("req_no, status, issued_at, received_at, remarks, profiles!requisitions_so_id_fkey(full_name, so_code), requisition_items(requested_qty, approved_qty, issued_qty, products(name, code))")
    .eq("id", id)
    .single();
  if (error) throw error;
  const types = kind === "issue" ? ["REQUISITION_ISSUE", "CENTRAL_TO_SO_TRANSFER"] : ["REQUISITION_RECEIPT"];
  const { data: moves, error: moveError } = await api
    .from("stock_movements")
    .select("qty, movement_type, products(name, code), batches(batch_no, expiry_date)")
    .eq("reference_id", id)
    .in("movement_type", types);
  if (moveError) throw moveError;
  const lines: DocLine[] = (moves ?? []).map((move) => ({
    product: move.products?.name ?? "Product",
    code: move.products?.code ?? "",
    batch: move.batches?.batch_no ?? "",
    expiry: move.batches?.expiry_date ? formatDate(move.batches.expiry_date) : "",
    qty: move.qty ?? 0,
  }));
  const fallback = (req.requisition_items ?? []).map((item) => ({
    product: item.products?.name ?? "Product",
    code: item.products?.code ?? "",
    batch: "",
    expiry: "",
    qty: kind === "issue" ? item.issued_qty || item.approved_qty || item.requested_qty : item.issued_qty || item.requested_qty,
  }));
  return {
    kind,
    number: req.req_no,
    status: req.status,
    when: (kind === "issue" ? req.issued_at : req.received_at) ?? "",
    officer: req.profiles?.full_name ?? "",
    officerCode: req.profiles?.so_code ?? "",
    remarks: req.remarks ?? "",
    lines: lines.length ? lines : fallback,
  };
}

async function issueDocument(id: string): Promise<PdfDocument> {
  const [doc, company] = await Promise.all([loadDocument(id, "issue"), companySettings()]);
  const safe = doc.number.replace(/[^\w.-]+/g, "_") || "issue";
  return { title: `Issue report ${doc.number}`, filename: `${safe}-issue.pdf`, bytes: buildDocument(doc, company) };
}

export async function downloadIssueReport(id: string) {
  openPdfPreview(await issueDocument(id));
}

export async function downloadOpeningReport(id: string) {
  const [row, company] = await Promise.all([
    api
      .from("opening_entries")
      .select("entry_no, status, entry_date, remarks, profiles!opening_entries_created_by_fkey(full_name), opening_entry_items(qty, batch_no, expiry_date, remarks, products(name, code))")
      .eq("id", id)
      .single(),
    companySettings(),
  ]);
  if (row.error) throw row.error;
  const entry = row.data;
  const doc: StockDocument = {
    kind: "opening",
    number: entry.entry_no,
    status: entry.status,
    when: entry.entry_date ?? "",
    officer: entry.profiles?.full_name ?? "",
    officerCode: "",
    remarks: entry.remarks?.trim()
      ? entry.remarks
      : (entry.opening_entry_items ?? []).map((item) => item.remarks).filter(Boolean).join(" · "),
    lines: (entry.opening_entry_items ?? []).map((item) => ({
      product: item.products?.name ?? "Product",
      code: item.products?.code ?? "",
      batch: item.batch_no ?? "",
      expiry: item.expiry_date ? formatDate(item.expiry_date) : "",
      qty: item.qty ?? 0,
    })),
  };
  const safe = doc.number.replace(/[^\w.-]+/g, "_") || "opening";
  openPdfPreview({
    title: `Opening stock ${doc.number}`,
    filename: `${safe}-opening.pdf`,
    bytes: buildDocument(doc, company),
  });
}

export async function downloadAdjustmentReport(id: string) {
  const [row, company] = await Promise.all([
    api
      .from("adjustment_entries")
      .select("entry_no, status, entry_date, remarks, locations(name), profiles!adjustment_entries_created_by_fkey(full_name), adjustment_entry_items(qty, movement_type, reason, remarks, products(name, code), batches(batch_no, expiry_date))")
      .eq("id", id)
      .single(),
    companySettings(),
  ]);
  if (row.error) throw row.error;
  const entry = row.data;
  const lines = entry.adjustment_entry_items ?? [];
  const doc: StockDocument = {
    kind: "adjustment",
    number: entry.entry_no,
    status: entry.status,
    when: entry.entry_date ?? "",
    officer: entry.profiles?.full_name ?? "",
    officerCode: "",
    place: entry.locations?.name ?? "Store",
    remarks: entry.remarks?.trim()
      ? entry.remarks
      : lines.map((item: { reason?: string | null; remarks?: string | null }) => [item.reason, item.remarks].filter(Boolean).join(" · ")).filter(Boolean).join("; "),
    lines: lines.map((item: { qty?: number; movement_type?: string; products?: { name?: string; code?: string } | null; batches?: { batch_no?: string; expiry_date?: string } | null }) => {
      const increase = item.movement_type === "MANUAL_ADJUSTMENT_IN" || item.movement_type === "CUSTOMER_RETURN";
      return {
        product: item.products?.name ?? "Product",
        code: item.products?.code ?? "",
        batch: item.batches?.batch_no ?? "",
        expiry: item.batches?.expiry_date ? formatDate(item.batches.expiry_date) : "",
        qty: (increase ? 1 : -1) * (item.qty ?? 0),
      };
    }),
  };
  const safe = doc.number.replace(/[^\w.-]+/g, "_") || "adjustment";
  openPdfPreview({
    title: `Stock adjustment ${doc.number}`,
    filename: `${safe}-adjustment.pdf`,
    bytes: buildDocument(doc, company),
  });
}

export async function downloadReceiveReport(id: string) {
  const [doc, company] = await Promise.all([loadDocument(id, "receive"), companySettings()]);
  const safe = doc.number.replace(/[^\w.-]+/g, "_") || "receive";
  openPdfPreview({
    title: `Receive report ${doc.number}`,
    filename: `${safe}-receive.pdf`,
    bytes: buildDocument(doc, company),
    extra: { label: "Issue report", load: () => issueDocument(id) },
  });
}
