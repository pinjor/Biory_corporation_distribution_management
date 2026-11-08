import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { errorMessage } from "@/lib/format";

export function ConfirmDelete({
  title,
  note,
  onClose,
  run,
}: {
  title: string;
  note?: string;
  onClose: () => void;
  run: () => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{note ?? "This removes the row from the list."}</p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              try {
                await run();
                toast.success("Deleted");
                onClose();
              } catch (e) {
                toast.error(errorMessage(e));
                setPending(false);
              }
            }}
          >
            {pending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
