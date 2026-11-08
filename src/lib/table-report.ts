import { api } from "@/lib/api/client";
import { openPdfPreview } from "@/lib/pdf-preview";

export type TableSheet = { columns: string[]; rows: string[][] };

function pdfText(value: unknown): string {
  return String(value ?? "")
    .replace(/[−–—]/g, "-")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function assemblePdf(contents: string[], landscape: boolean): Uint8Array {
  const box = landscape ? "[0 0 842 595]" : "[0 0 595 842]";
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
      body: `<< /Type /Page /Parent ${pagesN} 0 R /MediaBox ${box} /Contents ${contentN} 0 R /Resources << /Font << /F1 ${fontN} 0 R /F2 ${boldN} 0 R >> >> >>`,
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

function build(title: string, from: string, to: string, sheet: TableSheet, company: string): Uint8Array {
  const W = 842;
  const H = 595;
  const L = 28;
  const R = W - 28;
  const cols = Math.max(sheet.columns.length, 1);
  const width = (R - L) / cols;
  const pages: string[][] = [];
  let ops: string[] = [];
  const text = (x: number, y: number, value: unknown, size = 8, bold = false) => {
    ops.push(`BT /${bold ? "F2" : "F1"} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${pdfText(String(value).slice(0, 42))}) Tj ET`);
  };
  const header = (top: number) => {
    ops.push(`0.051 0.361 0.290 rg 0 ${H - 8} ${W} 8 re f`);
    text(L, top, company, 14, true);
    text(L, top - 16, title, 11, true);
    text(L, top - 30, `${from} to ${to}`, 8);
    const y = top - 48;
    ops.push(`0.93 0.93 0.93 rg ${L} ${y - 4} ${R - L} 16 re f`);
    ops.push(`0.22 0.22 0.22 RG 0.6 w ${L} ${y + 12} m ${R} ${y + 12} l S`);
    ops.push(`0.22 0.22 0.22 RG 0.6 w ${L} ${y - 4} m ${R} ${y - 4} l S`);
    sheet.columns.forEach((label, i) => text(L + i * width + 3, y, label, 7, true));
    return y - 4;
  };
  let y = header(H - 36);
  const body = sheet.rows.length ? sheet.rows : [["Nothing to report for this selection"]];
  body.forEach((row, index) => {
    if (y < 48) {
      pages.push(ops);
      ops = [];
      y = header(H - 36);
    }
    const bottom = y - 16;
    if (index % 2 === 1) ops.push(`0.97 0.97 0.97 rg ${L} ${bottom} ${R - L} 16 re f`);
    ops.push(`0.75 0.78 0.76 RG 0.4 w ${L} ${bottom} m ${R} ${bottom} l S`);
    row.forEach((cell, i) => text(L + i * width + 3, bottom + 4, cell, 7));
    y = bottom;
  });
  ops.push(`0.38 0.43 0.41 rg`);
  ops.push(`BT /F1 8 Tf 1 0 0 1 ${L} 24 Tm (${pdfText("This is a system-generated report.")}) Tj ET`);
  pages.push(ops);
  return assemblePdf(pages.map((page) => page.join("\n")), true);
}

export async function downloadTableReport(title: string, from: string, to: string, sheet: TableSheet) {
  const settings = await api.from("app_settings").select("company_name").eq("id", 1).maybeSingle();
  const company = settings.data?.company_name || "BIORY Corporation";
  const bytes = build(title, from, to, sheet, company);
  const filename = `${title.replace(/[^\w.-]+/g, "_") || "report"}.pdf`;
  openPdfPreview({ title, filename, bytes });
}
