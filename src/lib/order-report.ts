import { api } from "@/lib/api/client";
import { formatPct, toNum } from "@/lib/format";
import { openPdfPreview } from "@/lib/pdf-preview";

export const ORDER_REPORT_SELECT =
  "*, chemists(*), profiles!orders_so_id_fkey(full_name, so_code), order_items(*, products(name, code, pack_size))";

type ReportLine = {
  qty: number;
  delivered_qty: number;
  mrp: unknown;
  base_trp: unknown;
  net_unit_price: unknown;
  line_net: unknown;
  products?: { name?: string | null; code?: string | null; pack_size?: string | null } | null;
};

export type OrderReport = {
  id: string;
  order_no: string;
  order_date: string;
  status: string;
  delivery_status: string;
  payment_status: string;
  total_mrp: unknown;
  total_base_trp: unknown;
  so_discount_pct: unknown;
  so_discount_amt: unknown;
  extra_discount_pct: unknown;
  extra_discount_amt: unknown;
  net_total: unknown;
  delivered_value: unknown;
  collected_value: unknown;
  due: unknown;
  remarks?: string | null;
  chemists?: {
    business_name?: string | null;
    code?: string | null;
    owner_name?: string | null;
    address?: string | null;
    upazila?: string | null;
    district?: string | null;
    mobile?: string | null;
    payment_terms_days?: number | null;
  } | null;
  profiles?: { full_name?: string | null; so_code?: string | null } | null;
  order_items: ReportLine[];
};

const GREEN = "0.051 0.361 0.290";
const INK = "0.10 0.14 0.13";
const MUTED = "0.38 0.43 0.41";
const RULE = "0.45 0.52 0.50";
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

function amount(value: unknown): string {
  return new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(toNum(value)));
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
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00+06:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", day: "2-digit", month: "long", year: "numeric" });
}

const REG_W: Record<string, number> = {
  " ": 278, ".": 278, ",": 278, "-": 333, "/": 278, ":": 278, "|": 260, "%": 889, "(": 333, ")": 333,
};
const BOLD_W: Record<string, number> = {
  " ": 278, ".": 278, ",": 278, "-": 333, "/": 278, ":": 333, "|": 280, "%": 1000, "(": 333, ")": 333,
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
  const payload = `*${plain(value).toUpperCase()}*`;
  let width = 0;
  for (const ch of payload) {
    const pat = CODE39[ch];
    if (!pat) continue;
    for (const bit of pat) width += bit === "1" ? wide : narrow;
    width += narrow;
  }
  return width;
}

function reportPdf(
  order: OrderReport,
  company: { company_name?: string | null; company_address?: string | null; company_phone?: string | null },
): Uint8Array {
  const chemist = order.chemists;
  const lines = [...order.order_items].sort((a, b) => String(a.products?.name ?? "").localeCompare(String(b.products?.name ?? "")));
  const companyName = company.company_name || "BIORY Corporation";
  const place = [chemist?.address, chemist?.upazila, chemist?.district].filter(Boolean).join(", ");
  const pages: string[] = [];
  let ops = "";

  const STROKE = "0.22 0.22 0.22";
  const BAND = "0.93 0.93 0.93";
  const L = 36;
  const R = 559;
  const text = (x: number, yy: number, value: unknown, size = 8, bold = false) => {
    ops += `BT /${bold ? "F2" : "F1"} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${yy.toFixed(2)} Tm (${pdfText(value)}) Tj ET\n`;
  };
  const rightText = (edge: number, yy: number, value: unknown, size = 8, bold = false) => {
    const shown = plain(value);
    text(edge - textWidth(shown, size, bold), yy, shown, size, bold);
  };
  const ink = (color = INK) => {
    ops += `${color} rg\n`;
  };
  const clipTo = (value: unknown, width: number, size: number, bold = false) => {
    let shown = plain(value);
    while (shown.length > 1 && textWidth(shown, size, bold) > width) shown = shown.slice(0, -1);
    return shown;
  };
  const hline = (yy: number, x1: number, x2: number) => {
    ops += `${STROKE} RG 0.8 w ${x1.toFixed(2)} ${yy.toFixed(2)} m ${x2.toFixed(2)} ${yy.toFixed(2)} l S\n`;
  };
  const vline = (x: number, y1: number, y2: number) => {
    ops += `${STROKE} RG 0.8 w ${x.toFixed(2)} ${y1.toFixed(2)} m ${x.toFixed(2)} ${y2.toFixed(2)} l S\n`;
  };
  const fillRect = (x: number, yy: number, w: number, h: number, color: string) => {
    ops += `${color} rg ${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f\n`;
  };
  const barcode = (x: number, yy: number, value: string, height = 28) => {
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
        if (i % 2 === 0) ops += `${cx.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${height} re f\n`;
        cx += w;
      }
      cx += narrow;
    }
  };

  const edges = [L, 58, 112, 292, 348, 392, 436, 498, R];
  const drawItemHeader = (top: number) => {
    const bottom = top - 18;
    fillRect(L, bottom, R - L, 18, BAND);
    hline(top, L, R);
    hline(bottom, L, R);
    for (const x of edges) vline(x, bottom, top);
    ink("0 0 0");
    const labels = ["#", "Item", "Description", "MRP", "Qty", "Deliv.", "Net unit", "Line total"];
    const aligns = ["left", "left", "left", "right", "right", "right", "right", "right"] as const;
    labels.forEach((label, i) => {
      const baseline = bottom + 5;
      if (aligns[i] === "right") rightText(edges[i + 1]! - 4, baseline, label, 8, true);
      else text(edges[i]! + 4, baseline, label, 8, true);
    });
    return bottom;
  };

  ops += `${GREEN} rg 0 834 595 8 re f\n`;
  ink(GREEN);
  text(L, 792, companyName, 15, true);
  ink(MUTED);
  text(L, 776, company.company_address || "Dhaka, Bangladesh", 8);
  if (company.company_phone) text(L, 764, `Phone: ${company.company_phone}`, 8);
  const code = plain(order.order_no);
  const barW = barcodeWidth(code);
  barcode(R - barW, 786, code, 26);
  ink("0 0 0");
  rightText(R, 770, "Sales Order", 16, true);
  ink(MUTED);
  rightText(R, 756, titleCase(order.status), 9);

  let y = 738;
  const metaH = 34;
  const metaCols = [L, L + (R - L) / 3, L + (2 * (R - L)) / 3, R];
  fillRect(L, y - 16, R - L, 16, BAND);
  hline(y, L, R);
  hline(y - 16, L, R);
  hline(y - metaH, L, R);
  for (const x of metaCols) vline(x, y - metaH, y);
  ink("0 0 0");
  ["Order #", "Date", "Fulfilment / Payment"].forEach((label, i) => text(metaCols[i]! + 6, y - 12, label, 8, true));
  const metaValues = [order.order_no, longDate(order.order_date), `${titleCase(order.delivery_status)} / ${titleCase(order.payment_status)}`];
  metaValues.forEach((value, i) => text(metaCols[i]! + 6, y - 28, clipTo(value, (R - L) / 3 - 12, 9, true), 9, true));

  y -= metaH + 22;
  const mid = L + (R - L) / 2 + 8;
  ink("0 0 0");
  text(L, y, "Bill to:", 9, true);
  text(mid, y, "Sales officer:", 9, true);
  hline(y - 4, L, mid - 16);
  hline(y - 4, mid, R);
  y -= 18;
  ink("0 0 0");
  text(L, y, clipTo(chemist?.business_name || "-", 240, 10, true), 10, true);
  text(mid, y, clipTo(order.profiles?.full_name || "-", 220, 10, true), 10, true);
  y -= 13;
  ink(MUTED);
  text(L, y, clipTo(place || chemist?.owner_name || "", 240, 8), 8);
  text(mid, y, order.profiles?.so_code || "", 8);
  y -= 12;
  text(L, y, clipTo([chemist?.code ? `Shop ID: ${chemist.code}` : "", chemist?.mobile || ""].filter(Boolean).join("   "), 240, 8), 8);
  text(mid, y, `Payment terms: ${chemist?.payment_terms_days ?? 30} days`, 8);

  y -= 22;
  ink("0 0 0");
  text(L, y, "Notes", 9, true);
  y -= 14;
  ink(MUTED);
  const remark = plain(order.remarks?.trim() ? order.remarks.trim() : "No remarks provided.");
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

  y -= 8;
  const termTop = y;
  const termBottom = y - 32;
  const termCols = [L, 170, 300, 430, R];
  fillRect(L, termBottom + 16, R - L, 16, BAND);
  hline(termTop, L, R);
  hline(termBottom + 16, L, R);
  hline(termBottom, L, R);
  for (const x of termCols) vline(x, termBottom, termTop);
  ink("0 0 0");
  ["Sales officer", "Payment terms", "Delivery", "Payment"].forEach((label, i) => text(termCols[i]! + 5, termBottom + 20, label, 8, true));
  const termValues = [
    order.profiles?.full_name || "-",
    `${chemist?.payment_terms_days ?? 30} days`,
    titleCase(order.delivery_status),
    titleCase(order.payment_status),
  ];
  termValues.forEach((value, i) => text(termCols[i]! + 5, termBottom + 5, clipTo(value, termCols[i + 1]! - termCols[i]! - 10, 8), 8));

  y = termBottom - 16;
  let rowBottom = drawItemHeader(y);
  if (lines.length === 0) {
    const bottom = rowBottom - 22;
    hline(bottom, L, R);
    for (const x of edges) vline(x, bottom, rowBottom);
    ink(MUTED);
    text(edges[2]! + 4, bottom + 7, "No lines", 8);
    rowBottom = bottom;
  }
  lines.forEach((line, index) => {
    if (rowBottom < 210) {
      pages.push(ops);
      ops = `${GREEN} rg 0 834 595 8 re f\n`;
      rowBottom = drawItemHeader(790);
    }
    const bottom = rowBottom - 26;
    if (index % 2 === 1) fillRect(L, bottom, R - L, 26, "0.97 0.97 0.97");
    hline(bottom, L, R);
    for (const x of edges) vline(x, bottom, rowBottom);
    const product = line.products;
    const pack = [product?.pack_size].filter(Boolean).join("");
    ink("0 0 0");
    text(edges[0]! + 4, bottom + 10, String(index + 1), 8);
    text(edges[1]! + 4, bottom + 10, clipTo(product?.code || "-", 48, 8, true), 8, true);
    text(edges[2]! + 4, bottom + 14, clipTo(product?.name || "Product", 170, 8, true), 8, true);
    ink(MUTED);
    if (pack) text(edges[2]! + 4, bottom + 4, clipTo(pack, 170, 7), 7);
    ink("0 0 0");
    rightText(edges[4]! - 4, bottom + 10, amount(line.mrp), 8);
    rightText(edges[5]! - 4, bottom + 10, String(line.qty), 8);
    rightText(edges[6]! - 4, bottom + 10, String(line.delivered_qty), 8);
    rightText(edges[7]! - 4, bottom + 10, amount(line.net_unit_price), 8);
    rightText(edges[8]! - 4, bottom + 10, amount(line.line_net), 8, true);
    rowBottom = bottom;
  });

  y = rowBottom - 28;
  ink(MUTED);
  rightText(R, y + 8, "BDT", 8, true);
  const totals: [string, string, boolean][] = [
    ["Total MRP:", amount(order.total_mrp), false],
    ["Base TRP:", amount(order.total_base_trp), false],
    [`SO discount (${formatPct(order.so_discount_pct)}):`, amount(order.so_discount_amt), false],
    [`Extra discount (${formatPct(order.extra_discount_pct)}):`, amount(order.extra_discount_amt), false],
    ["Net order value:", amount(order.net_total), true],
    ["Delivered:", amount(order.delivered_value), false],
    ["Collected:", amount(order.collected_value), false],
    ["Balance due:", amount(order.due), true],
  ];
  const boxL = 330;
  totals.forEach(([label, value, strong], index) => {
    const bottom = y - 16;
    if (index % 2 === 0) fillRect(boxL, bottom, R - boxL, 16, strong ? SOFT : BAND);
    ink(strong ? GREEN : "0 0 0");
    rightText(boxL + 150, bottom + 4, label, 8, strong);
    rightText(R - 6, bottom + 4, value, 8, strong);
    y = bottom;
  });
  pages.push(ops);
  const total = pages.length;
  const finished = pages.map((body, index) => {
    let foot = body;
    foot += `${RULE} RG 1 w 40 48 m 555 48 l S\n`;
    foot += `${MUTED} rg\n`;
    foot += `BT /F1 8 Tf 1 0 0 1 40 34 Tm (${pdfText("This is a system-generated order report.")}) Tj ET\n`;
    foot += `BT /F1 8 Tf 1 0 0 1 40 22 Tm (${pdfText("Order confirmation does not indicate delivery or payment.")}) Tj ET\n`;
    foot += `${RULE} RG 0.8 w 40 16 m 555 16 l S\n`;
    foot += `${MUTED} rg\n`;
    foot += `BT /F1 7 Tf 1 0 0 1 36 6 Tm (${pdfText(`${companyName} | Order Management`)}) Tj ET\n`;
    const pageLabel = `Page ${index + 1} of ${total}`;
    foot += `BT /F1 7 Tf 1 0 0 1 ${(559 - textWidth(pageLabel, 7)).toFixed(2)} 6 Tm (${pdfText(pageLabel)}) Tj ET\n`;
    return foot;
  });
  return assemblePdf(finished);
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

export async function downloadOrderReport(order: OrderReport) {
  let company: { company_name?: string | null; company_address?: string | null; company_phone?: string | null } = {
    company_name: "BIORY Corporation",
  };
  const settings = await api.from("app_settings").select("company_name, company_address, company_phone").eq("id", 1).maybeSingle();
  if (settings.data) company = settings.data;
  const safe = order.order_no.replace(/[^\w.-]+/g, "_") || "order";
  openPdfPreview({
    title: `Order ${order.order_no}`,
    filename: `${safe}.pdf`,
    bytes: reportPdf(order, company),
  });
}

export async function downloadOrderById(id: string) {
  const { data, error } = await api.from("orders").select(ORDER_REPORT_SELECT).eq("id", id).single();
  if (error) throw error;
  await downloadOrderReport(data as OrderReport);
}
