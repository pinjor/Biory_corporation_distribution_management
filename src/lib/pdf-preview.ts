export type PdfDocument = {
  title: string;
  filename: string;
  bytes: Uint8Array;
  extra?: { label: string; load: () => Promise<PdfDocument> };
};

type Listener = (doc: PdfDocument | null) => void;
const listeners = new Set<Listener>();

export function openPdfPreview(doc: PdfDocument) {
  listeners.forEach((listener) => listener(doc));
}

export function subscribePdfPreview(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
