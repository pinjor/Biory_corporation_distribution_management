import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { errorMessage } from "@/lib/format";
import { subscribePdfPreview, type PdfDocument } from "@/lib/pdf-preview";

export function PdfPreviewHost() {
  const [doc, setDoc] = useState<PdfDocument | null>(null);
  const [busy, setBusy] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => subscribePdfPreview(setDoc), []);

  const url = useMemo(() => {
    if (!doc) return "";
    const raw = doc.bytes;
    const copy = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
    return URL.createObjectURL(new Blob([copy], { type: "application/pdf" }));
  }, [doc]);

  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  function download() {
    if (!doc || !url) return;
    const link = document.createElement("a");
    link.href = url;
    link.download = doc.filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function print() {
    const win = frame.current?.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
  }

  async function openExtra() {
    if (!doc?.extra) return;
    setBusy(true);
    try {
      setDoc(await doc.extra.load());
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!doc} onOpenChange={(open) => { if (!open) setDoc(null); }}>
      <DialogContent className="flex h-[88vh] max-w-5xl flex-col gap-3 p-4 sm:p-5">
        <DialogHeader className="pr-8">
          <DialogTitle>{doc?.title ?? "Report"}</DialogTitle>
          <DialogDescription>Review the report, then print it or download the PDF.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={print} disabled={!url}>
            <Printer /> Print
          </Button>
          <Button type="button" variant="outline" onClick={download} disabled={!url}>
            <Download /> Download
          </Button>
          {doc?.extra && (
            <Button type="button" variant="outline" onClick={() => void openExtra()} disabled={busy}>
              {doc.extra.label}
            </Button>
          )}
        </div>
        <iframe
          ref={frame}
          title={doc?.title ?? "Report"}
          src={url || "about:blank"}
          className="min-h-0 w-full flex-1 rounded-lg border bg-muted"
        />
      </DialogContent>
    </Dialog>
  );
}
