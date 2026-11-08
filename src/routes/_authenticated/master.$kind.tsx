import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { PageHeader, Section, StatusBadge, Field, EmptyState } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDelete } from "@/components/app/confirm-delete";
import { ListPager, usePagedRows } from "@/components/app/list-pager";
import { FilterClear, ListToolbar, useListRange } from "@/components/app/list-toolbar";
import { masterValuesQuery, type MasterValue } from "@/lib/queries";
import { errorMessage, inDateRange } from "@/lib/format";

const LISTS = {
  "pack-size": { kind: "pack_size", title: "Pack size", description: "Pack sizes that can be chosen on a product." },
  "expense-categories": { kind: "expense_category", title: "Expense categories", description: "Categories staff can choose when they submit an expense.", coded: true },
  uom: { kind: "uom", title: "Product UOM", description: "Units of measure that can be chosen on a product." },
  strength: { kind: "strength", title: "Strength", description: "Strengths that can be chosen on a product." },
  "generic-name": { kind: "generic_name", title: "Generic name", description: "Generic names that can be chosen on a product." },
} as const;

type ListKey = keyof typeof LISTS;

export const Route = createFileRoute("/_authenticated/master/$kind")({
  beforeLoad: ({ params }) => {
    if (!(params.kind in LISTS)) throw redirect({ to: "/dashboard" });
  },
  head: ({ params }) => ({ meta: [{ title: `${LISTS[params.kind as ListKey].title} — BIORY Corporation` }] }),
  component: MasterListPage,
});

function codeFromName(name: string) {
  const base = name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 24);
  return base || "CATEGORY";
}

function MasterListPage() {
  const { kind } = Route.useParams();
  const list = LISTS[kind as ListKey];
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery(masterValuesQuery);
  const [q, setQ] = useState("");
  const { from, to, setFrom, setTo, reset } = useListRange();
  const rows = data.filter((row) => row.kind === list.kind && inDateRange(row.created_at, from, to) && (!q || `${row.name} ${row.code ?? ""}`.toLowerCase().includes(q.toLowerCase())));
  const page = usePagedRows(rows, `${kind}|${q}|${from}|${to}`);
  const [edit, setEdit] = useState<Partial<MasterValue> | null>(null);
  const [remove, setRemove] = useState<MasterValue | null>(null);

  return (
    <div>
      <PageHeader
        title={list.title}
        description={list.description}
        actions={
          <Button onClick={() => setEdit({ kind: list.kind, active: true, name: "", code: "" })}>
            <Plus /> Add
          </Button>
        }
      />
      <Section
        bodyClassName="p-0"
        title={`${rows.length} ${rows.length === 1 ? "entry" : "entries"}`}
        actions={<ListToolbar query={q} onQuery={setQ} placeholder="Search…" from={from} to={to} onFrom={setFrom} onTo={setTo}><FilterClear onClick={() => { setQ(""); reset(); }} /></ListToolbar>}
      >
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-5">
            <EmptyState title={`No ${list.title.toLowerCase()} yet`} description="Add the first one so it can be chosen on a form." />
          </div>
        ) : (
          <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                {"coded" in list ? <TableHead>Code</TableHead> : null}
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.pageRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  {"coded" in list ? <TableCell className="num text-xs">{row.code}</TableCell> : null}
                  <TableCell><StatusBadge status={row.active ? "active" : "inactive"} /></TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Button variant="ghost" size="icon" onClick={() => setEdit(row)} aria-label={`Edit ${row.name}`}>
                      <Pencil />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setRemove(row)} aria-label={`Delete ${row.name}`}>
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <ListPager page={page.page} pages={page.pages} total={page.total} pageSize={page.pageSize} noun="entries" onPage={page.setPage} onSize={page.setPageSize} />
          </>
        )}
      </Section>
      {edit && (
        <ValueDialog
          row={edit}
          coded={"coded" in list}
          taken={rows.map((row) => row.code).filter((code): code is string => !!code)}
          onClose={() => setEdit(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["master-values"] })}
        />
      )}
      {remove && (
        <ConfirmDelete
          title={`Delete ${remove.name}?`}
          onClose={() => setRemove(null)}
          run={async () => {
            const { error } = await api.from("master_values").delete().eq("id", remove.id);
            if (error) throw error;
            qc.invalidateQueries({ queryKey: ["master-values"] });
          }}
        />
      )}
    </div>
  );
}

function ValueDialog({
  row,
  coded,
  taken,
  onClose,
  onSaved,
}: {
  row: Partial<MasterValue>;
  coded: boolean;
  taken: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(row.name ?? "");
  const [code, setCode] = useState(row.code ?? "");
  const [active, setActive] = useState(row.active ?? true);
  const save = useMutation({
    mutationFn: async () => {
      const clean = name.trim();
      if (!clean) throw new Error("Name is required");
      let nextCode = code.trim().toUpperCase();
      if (coded && !row.id && !nextCode) nextCode = codeFromName(clean);
      if (coded && !row.id && taken.includes(nextCode)) throw new Error("That code is already used");
      const payload = {
        kind: row.kind,
        name: clean,
        active,
        ...(coded ? { code: row.id ? row.code : nextCode } : {}),
      };
      const { error } = row.id
        ? await api.from("master_values").update(payload).eq("id", row.id)
        : await api.from("master_values").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Saved");
      onSaved();
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{row.id ? "Edit" : "Add"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          {coded && (
            <Field label="Code">
              <Input
                value={row.id ? (row.code ?? "") : code}
                onChange={(e) => setCode(e.target.value)}
                disabled={!!row.id}
                placeholder={row.id ? "" : "Leave blank to build from the name"}
              />
            </Field>
          )}
          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
            <span className="text-sm font-medium">Active</span>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
