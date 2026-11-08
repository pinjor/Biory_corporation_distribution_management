export const EXPENSE_CATEGORIES = [
  { value: "TRAVEL", label: "Travel / conveyance" },
  { value: "FUEL", label: "Fuel" },
  { value: "FOOD", label: "Food / daily allowance" },
  { value: "ACCOMMODATION", label: "Accommodation" },
  { value: "COMMUNICATION", label: "Mobile / internet" },
  { value: "ENTERTAINMENT", label: "Client entertainment" },
  { value: "OFFICE", label: "Office supplies" },
  { value: "OTHER", label: "Other" },
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]["value"];

export const categoryLabel = (v: string, rows?: { code: string | null; name: string }[]) =>
  rows?.find((row) => row.code === v)?.name ?? EXPENSE_CATEGORIES.find((c) => c.value === v)?.label ?? v;

export const RECEIPT_MAX_FILES = 5;
export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;
export const RECEIPT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** Returns a user-facing problem with the chosen receipts, or null when they're fine. */
export function receiptProblem(files: { name: string; type: string; size: number }[]): string | null {
  if (files.length > RECEIPT_MAX_FILES) return `Attach at most ${RECEIPT_MAX_FILES} receipts`;
  for (const f of files) {
    if (!RECEIPT_TYPES[f.type]) return `${f.name}: receipts must be JPG, PNG, WEBP or PDF`;
    if (f.size > RECEIPT_MAX_BYTES) return `${f.name}: each receipt must be 5 MB or smaller`;
  }
  return null;
}

/** Shrink large phone photos before upload so they go through on slow mobile data. */
export async function compressReceipt(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < 800 * 1024 || typeof createImageBitmap === "undefined") return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
