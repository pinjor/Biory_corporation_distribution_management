import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { ConfirmDelete } from "@/components/app/confirm-delete";
import { ListPager, usePagedRows } from "@/components/app/list-pager";
import { FilterClear, ListToolbar, useListRange } from "@/components/app/list-toolbar";
import { PageHeader, Section, Field, EmptyState, StatusBadge } from "@/components/app/page";
import { NativeSelect } from "@/components/app/select-native";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { territoriesQuery } from "@/lib/queries";
import { errorMessage, inDateRange } from "@/lib/format";

interface Officer {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  territory_id: string | null;
  so_code: string | null;
  active: boolean;
  login_password: string | null;
  created_at?: string;
}

export const Route = createFileRoute("/_authenticated/sales-officers")({
  head: () => ({ meta: [{ title: "Sales officers — BIORY Corporation" }] }),
  component: SalesOfficersPage,
});

function SalesOfficersPage() {
  const qc = useQueryClient();
  const { data: territories = [] } = useQuery(territoriesQuery);
  const { data = [], isLoading } = useQuery({
    queryKey: ["sales-officer-logins"],
    queryFn: async () => {
      const { data, error } = await api.rpc("list_sales_officers");
      if (error) throw error;
      return (data ?? []) as Officer[];
    },
  });
  const [edit, setEdit] = useState<Partial<Officer> | null>(null);
  const [remove, setRemove] = useState<Officer | null>(null);
  const [q, setQ] = useState("");
  const { from, to, setFrom, setTo, reset } = useListRange();
  const territoryName = new Map(territories.map((t) => [t.id, t.name]));
  const rows = data.filter((row) => inDateRange(row.created_at, from, to) && (!q || `${row.full_name ?? ""} ${row.email ?? ""} ${row.phone ?? ""} ${row.so_code ?? ""}`.toLowerCase().includes(q.toLowerCase())));
  const page = usePagedRows(rows, `${q}|${from}|${to}`);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["sales-officer-logins"] });
    qc.invalidateQueries({ queryKey: ["users-admin"] });
    qc.invalidateQueries({ queryKey: ["sales-officers"] });
  };

  return (
    <div>
      <PageHeader
        title="Sales officers"
        description="The email is the username. A new officer gets a stock location and an SO code."
        actions={<Button onClick={() => setEdit({ full_name: "", email: "", phone: "", territory_id: "", active: true })}><Plus /> Add</Button>}
      />
      <Section bodyClassName="p-0" title={`${rows.length} ${rows.length === 1 ? "officer" : "officers"}`} actions={<ListToolbar query={q} onQuery={setQ} placeholder="Name / username…" from={from} to={to} onFrom={setFrom} onTo={setTo}><FilterClear onClick={() => { setQ(""); reset(); }} /></ListToolbar>}>
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-5"><EmptyState title="No Sales Officers yet" description="Add the first officer so they can sign in." /></div>
        ) : (
          <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Territory</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.pageRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="font-medium">{row.full_name || "—"}</div>
                    {row.so_code && <div className="num text-xs text-muted-foreground">{row.so_code}</div>}
                  </TableCell>
                  <TableCell className="num text-sm">{row.email}</TableCell>
                  <TableCell className="text-sm">{row.phone || "—"}</TableCell>
                  <TableCell className="text-sm">{row.territory_id ? territoryName.get(row.territory_id) ?? "—" : "—"}</TableCell>
                  <TableCell><StatusBadge status={row.active ? "active" : "inactive"} /></TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Button variant="ghost" size="icon" aria-label={`Edit ${row.full_name}`} onClick={() => setEdit(row)}>
                      <Pencil />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label={`Delete ${row.full_name}`} onClick={() => setRemove(row)}>
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <ListPager page={page.page} pages={page.pages} total={page.total} pageSize={page.pageSize} noun="officers" onPage={page.setPage} onSize={page.setPageSize} />
          </>
        )}
      </Section>
      {edit && <OfficerDialog row={edit} territories={territories} onClose={() => setEdit(null)} onSaved={refresh} />}
      {remove && (
        <ConfirmDelete
          title={`Delete ${remove.full_name || remove.email}?`}
          note="An officer who already has orders, stock, or money records cannot be deleted."
          onClose={() => setRemove(null)}
          run={async () => {
            const { error } = await api.rpc("delete_sales_officer", { p_user: remove.id });
            if (error) throw error;
            refresh();
          }}
        />
      )}
    </div>
  );
}

function OfficerDialog({
  row,
  territories,
  onClose,
  onSaved,
}: {
  row: Partial<Officer>;
  territories: { id: string; name: string; area?: string | null }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(row.full_name ?? "");
  const [email, setEmail] = useState(row.email ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState(row.phone ?? "");
  const [territory, setTerritory] = useState(row.territory_id ?? "");
  const [active, setActive] = useState(row.active ?? true);
  const [pending, setPending] = useState(false);

  async function save() {
    const cleanName = name.trim();
    const cleanEmail = email.trim();
    if (!cleanName) {
      toast.error("Name is required");
      return;
    }
    if (!cleanEmail.includes("@")) {
      toast.error("Enter a valid email");
      return;
    }
    if (!row.id && password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (row.id && password && password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setPending(true);
    try {
      if (row.id) {
        const { error } = await api.rpc("update_sales_officer", {
          p_user: row.id,
          p_full_name: cleanName,
          p_email: cleanEmail,
          p_phone: phone.trim(),
          p_territory: territory || null,
          p_active: active,
        });
        if (error) throw error;
        if (password) {
          const reset = await api.staff.resetSalesOfficerPassword(row.id, password);
          if (reset.error) throw reset.error;
        }
      } else {
        const { error } = await api.staff.createSalesOfficer({
          email: cleanEmail,
          password,
          full_name: cleanName,
          phone: phone.trim() || null,
          territory_id: territory || null,
        });
        if (error) throw error;
      }
      toast.success("Saved");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{row.id ? "Edit sales officer" : "Add sales officer"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Username (email)"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" /></Field>
          <Field label="Password">
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder={row.id ? "Leave blank to keep the current password" : "At least 8 characters"}
                className="pr-10"
              />
              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Hide password" : "Show password"}>
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </Field>
          <Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
          <Field label="Territory">
            <NativeSelect value={territory ?? ""} onChange={(e) => setTerritory(e.target.value)}>
              <option value="">—</option>
              {territories.map((t) => (
                <option key={t.id} value={t.id}>{t.name}{t.area ? ` · ${t.area}` : ""}</option>
              ))}
            </NativeSelect>
          </Field>
          {row.id && (
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <span className="text-sm font-medium">Active</span>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
