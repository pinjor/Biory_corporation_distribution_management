import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { errorMessage } from "@/lib/format";

export function ReasonDialog({
  title,
  confirm,
  note,
  onClose,
  run,
}: {
  title: string;
  confirm: string;
  note?: string | undefined;
  onClose: () => void;
  run: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const m = useMutation({
    mutationFn: () => run(reason),
    onSuccess: () => {
      toast.success("Done");
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {note && <p className="text-sm text-muted-foreground">{note}</p>}
        <Field label="Reason (required)"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Back</Button>
          <Button variant="destructive" onClick={() => m.mutate()} disabled={m.isPending || !reason.trim()}>{confirm}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
