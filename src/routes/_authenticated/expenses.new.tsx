import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Camera, FileText, Send, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { PageHeader, Section, Field } from "@/components/app/page";
import { NativeSelect } from "@/components/app/select-native";
import { useOnline } from "@/components/app/offline-provider";
import { Button } from "@/components/ui/button";
import { IconTip } from "@/components/ui/icon-tip";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/lib/session";
import { errorMessage, todayBD } from "@/lib/format";
import { compressReceipt, EXPENSE_CATEGORIES, RECEIPT_MAX_FILES, RECEIPT_TYPES, receiptProblem } from "@/lib/expenses";

export const Route = createFileRoute("/_authenticated/expenses/new")({
  head: () => ({ meta: [{ title: "New expense — BIORY Corporation" }] }),
  component: NewExpense,
});

function NewExpense() {
  const s = useSession();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const online = useOnline();
  const [f, setF] = useState({ date: todayBD(), category: "TRAVEL", amount: "", description: "" });
  const [files, setFiles] = useState<File[]>([]);
  const [idem] = useState(() => crypto.randomUUID());
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const amt = Number(f.amount) || 0;

  const previews = useMemo(() => files.map((file) => (file.type.startsWith("image/") ? URL.createObjectURL(file) : null)), [files]);
  useEffect(() => () => previews.forEach((u) => u && URL.revokeObjectURL(u)), [previews]);

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const picked = await Promise.all(Array.from(list).map(compressReceipt));
    const next = [...files, ...picked];
    const problem = receiptProblem(next);
    if (problem) return void toast.error(problem);
    setFiles(next);
  }

  const m = useMutation({
    mutationFn: async () => {
      const problem = receiptProblem(files);
      if (problem) throw new Error(problem);
      const paths: string[] = [];
      for (const file of files) {
        const path = `${s.userId}/${crypto.randomUUID()}.${RECEIPT_TYPES[file.type]}`;
        const { error } = await api.storage.from("expense-receipts").upload(path, file, { contentType: file.type, upsert: false });
        if (error) throw new Error(`Couldn't upload ${file.name}: ${error.message}`);
        paths.push(path);
      }
      const { data, error } = await api.rpc("submit_expense", {
        p_date: f.date,
        p_category: f.category,
        p_amount: amt,
        p_description: f.description,
        p_receipt_paths: paths,
        p_idempotency_key: idem,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (id) => {
      toast.success("Expense submitted for Finance review");
      qc.invalidateQueries({ queryKey: ["expenses"] });
      navigate({ to: "/expenses/$id", params: { id } });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        eyebrow={<Link to="/expenses" className="hover:underline">Expenses</Link>}
        title="New expense"
        description="Add a photo of every receipt you have. Claims without a receipt are flagged for Finance."
      />
      <Section>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date spent">
            <Input type="date" max={todayBD()} value={f.date} onChange={(e) => set("date", e.target.value)} />
          </Field>
          <Field label="Category">
            <NativeSelect value={f.category} onChange={(e) => set("category", e.target.value)}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Amount (৳)">
            <Input type="number" inputMode="decimal" step="0.01" min={0.01} value={f.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0.00" />
          </Field>
        </div>
        <div className="mt-4">
          <Field label="What was it for?">
            <Textarea
              value={f.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="e.g. CNG fare Mirpur → Uttara for chemist visits"
            />
          </Field>
        </div>

        <div className="mt-5">
          <div className="mb-2 text-sm font-medium">
            Receipts <span className="text-muted-foreground">({files.length}/{RECEIPT_MAX_FILES})</span>
          </div>
          {files.length > 0 && (
            <ul className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {files.map((file, i) => (
                <li key={`${file.name}-${i}`} className="group relative overflow-hidden rounded-xl border bg-muted">
                  {previews[i] ? (
                    <img src={previews[i]!} alt={file.name} className="aspect-[4/3] w-full object-cover" />
                  ) : (
                    <div className="grid aspect-[4/3] place-items-center text-muted-foreground">
                      <FileText className="size-8" />
                    </div>
                  )}
                  <div className="truncate px-2 py-1 text-xs">{file.name}</div>
                  <button
                    type="button"
                    className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-background/90 text-foreground shadow"
                    onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}
                    aria-label={`Remove ${file.name}`}
                  >
                    <X className="size-4" />
                    <IconTip label={`Remove ${file.name}`} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {files.length < RECEIPT_MAX_FILES && (
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed p-4 hover:bg-muted">
              <Camera className="size-5 text-primary" />
              <div className="text-sm">
                <div className="font-medium">Take a photo or choose a file</div>
                <div className="text-xs text-muted-foreground">JPG, PNG, WEBP or PDF · up to 5 MB each · stored privately</div>
              </div>
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="sr-only"
                onChange={(e) => {
                  void addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>

        {!online && (
          <p className="mt-4 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning-foreground">
            You're offline. Receipts need a connection to upload — submit when you're back online.
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" asChild>
            <Link to="/expenses">Cancel</Link>
          </Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending || !online || amt <= 0 || !f.description.trim()}>
            <Send /> {m.isPending ? "Submitting…" : "Submit expense"}
          </Button>
        </div>
      </Section>
    </div>
  );
}
