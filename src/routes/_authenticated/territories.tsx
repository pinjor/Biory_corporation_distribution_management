import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { PageHeader, Section, Field, EmptyState } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDelete } from "@/components/app/confirm-delete";
import { ListPager, usePagedRows } from "@/components/app/list-pager";
import { FilterClear, ListToolbar, useListRange } from "@/components/app/list-toolbar";
import { territoriesQuery } from "@/lib/queries";
import { errorMessage, inDateRange } from "@/lib/format";

type Territory = { id: string; name: string; area: string | null; zone: string | null };

export const Route = createFileRoute("/_authenticated/territories")({
  head: () => ({ meta: [{ title: "Territories — BIORY Corporation" }] }),
  component: TerritoriesPage,
});

function TerritoriesPage() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery(territoriesQuery);
  const [edit, setEdit] = useState<Partial<Territory> | null>(null);
  const [remove, setRemove] = useState<Territory | null>(null);
  const [q, setQ] = useState("");
  const { from, to, setFrom, setTo, reset } = useListRange();
  const rows = data.filter((row) => inDateRange(row.created_at, from, to) && (!q || `${row.name} ${row.area ?? ""} ${row.zone ?? ""}`.toLowerCase().includes(q.toLowerCase())));
  const page = usePagedRows(rows, `${q}|${from}|${to}`);
  return (
    <div>
      <PageHeader
        title="Territories"
        description="Areas used for chemists, doctors, and Sales Officers."
        actions={<Button onClick={() => setEdit({ name: "", area: "", zone: "" })}><Plus /> Add territory</Button>}
      />
      <Section bodyClassName="p-0" title={`${rows.length} territories`} actions={<ListToolbar query={q} onQuery={setQ} placeholder="Territory…" from={from} to={to} onFrom={setFrom} onTo={setTo}><FilterClear onClick={() => { setQ(""); reset(); }} /></ListToolbar>}>
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-5"><EmptyState title="No territories yet" /></div>
        ) : (
          <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>District</TableHead>
                <TableHead>Zone</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.pageRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>{row.area || "—"}</TableCell>
                  <TableCell>{row.zone || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Button variant="ghost" size="icon" aria-label={`Edit ${row.name}`} onClick={() => setEdit(row)}>
                      <Pencil />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label={`Delete ${row.name}`} onClick={() => setRemove(row)}>
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <ListPager page={page.page} pages={page.pages} total={page.total} pageSize={page.pageSize} noun="territories" onPage={page.setPage} onSize={page.setPageSize} />
          </>
        )}
      </Section>
      {edit && (
        <TerritoryDialog
          row={edit}
          onClose={() => setEdit(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["territories"] })}
        />
      )}
      {remove && (
        <ConfirmDelete
          title={`Delete ${remove.name}?`}
          onClose={() => setRemove(null)}
          run={async () => {
            const { error } = await api.from("territories").delete().eq("id", remove.id);
            if (error) throw error;
            qc.invalidateQueries({ queryKey: ["territories"] });
          }}
        />
      )}
    </div>
  );
}

function TerritoryDialog({ row, onClose, onSaved }: { row: Partial<Territory>; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(row.name ?? "");
  const [area, setArea] = useState(row.area ?? "");
  const [zone, setZone] = useState(row.zone ?? "");
  const save = useMutation({
    mutationFn: async () => {
      const clean = name.trim();
      if (!clean) throw new Error("Name is required");
      const payload = { name: clean, area: area.trim() || null, zone: zone.trim() || null };
      const { error } = row.id
        ? await api.from("territories").update(payload).eq("id", row.id)
        : await api.from("territories").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Territory saved");
      onSaved();
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{row.id ? "Edit territory" : "Add territory"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dohar" /></Field>
          <Field label="District"><Input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Dhaka" /></Field>
          <Field label="Zone"><Input value={zone} onChange={(e) => setZone(e.target.value)} placeholder="Dhaka" /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
