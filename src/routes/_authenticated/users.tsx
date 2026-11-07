import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Copy, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { PageHeader, Section, EmptyState, Field } from "@/components/app/page";
import { NativeSelect } from "@/components/app/select-native";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconTip } from "@/components/ui/icon-tip";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { territoriesQuery } from "@/lib/queries";
import { ALL_ROLES, ROLE_LABELS, useSession, type AppRole } from "@/lib/session";
import { errorMessage, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({ meta: [{ title: "Users & roles — BIORY Corporation" }] }),
  component: UsersPage,
});

function UsersPage() {
  const s = useSession();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const { data: territories = [] } = useQuery(territoriesQuery);
  const { data, isLoading } = useQuery({
    queryKey: ["users-admin"],
    queryFn: async () => {
      const [p, r] = await Promise.all([
        api.from("profiles").select("*").order("created_at", { ascending: false }),
        api.from("user_roles").select("user_id, role"),
      ]);
      if (p.error) throw p.error;
      if (r.error) throw r.error;
      const roles = new Map<string, AppRole[]>();
      for (const x of r.data) roles.set(x.user_id, [...(roles.get(x.user_id) ?? []), x.role]);
      return p.data.map((u) => ({ ...u, roles: roles.get(u.id) ?? [] }));
    },
  });
  const setRole = useMutation({
    mutationFn: async ({ user, role, grant }: { user: string; role: AppRole; grant: boolean }) => {
      const { error } = await api.rpc("set_user_role", { p_user: user, p_role: role, p_grant: grant });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users-admin"] });
      qc.invalidateQueries({ queryKey: ["sales-officers"] });
      qc.invalidateQueries({ queryKey: ["locations"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const setTerritory = useMutation({
    mutationFn: async ({ user, territory, name, phone, active }: { user: string; territory: string | null; name: string; phone: string | null; active: boolean }) => {
      const { error } = await api.rpc("admin_update_profile", {
        p_user: user,
        p_full_name: name,
        p_phone: phone as string,
        p_territory: territory as string,
        p_active: active,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["users-admin"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const rows = (data ?? []).filter((u) => !q || `${u.full_name} ${u.email} ${u.so_code ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const pending = rows.filter((u) => u.roles.length === 0).length;

  return (
    <div>
      <PageHeader
        title="Users & roles"
        description="Super Admin adds each Sales Officer here. The email is their username. A new officer gets a stock location and an SO code."
      />
      {s.isSuper && <SalesOfficerAdmin territories={territories} />}
      {!s.isSuper && <p className="mb-4 rounded-lg bg-muted px-4 py-2 text-sm text-muted-foreground">Only a Super Admin can add Sales Officers or change roles.</p>}
      <Section
        bodyClassName="p-0"
        title={<span>{rows.length} users {pending > 0 && <Badge variant="warning" className="ml-2">{pending} awaiting role</Badge>}</span>}
        actions={<Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 w-52" />}
      >
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-5"><EmptyState title="No users" /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Territory</TableHead>
                {ALL_ROLES.map((r) => <TableHead key={r} className="text-center text-xs">{ROLE_LABELS[r]}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="font-medium">{u.full_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                    <div className="text-xs text-muted-foreground">
                      {u.so_code && <span className="num mr-2">{u.so_code}</span>}joined {formatDate(u.created_at)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <NativeSelect
                      className="h-8 w-36"
                      disabled={!s.isAdmin}
                      value={u.territory_id ?? ""}
                      onChange={(e) => setTerritory.mutate({ user: u.id, territory: e.target.value || null, name: u.full_name, phone: u.phone, active: u.active })}
                    >
                      <option value="">—</option>
                      {territories.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </NativeSelect>
                  </TableCell>
                  {ALL_ROLES.map((r) => (
                    <TableCell key={r} className="text-center">
                      <Checkbox
                        aria-label={`${ROLE_LABELS[r]} for ${u.full_name}`}
                        disabled={!s.isSuper || setRole.isPending || (u.id === s.userId && r === "super_admin")}
                        checked={u.roles.includes(r)}
                        onCheckedChange={(v) => setRole.mutate({ user: u.id, role: r, grant: v === true })}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
    </div>
  );
}

interface OfficerLogin {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  territory_id: string | null;
  so_code: string | null;
  active: boolean;
  login_password: string | null;
}

function SalesOfficerAdmin({ territories }: { territories: { id: string; name: string }[] }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [territory, setTerritory] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [resetId, setResetId] = useState<string | null>(null);
  const [nextPassword, setNextPassword] = useState("");

  const officers = useQuery({
    queryKey: ["sales-officer-logins"],
    queryFn: async () => {
      const { data, error } = await api.rpc("list_sales_officers");
      if (error) throw error;
      return (data ?? []) as OfficerLogin[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["sales-officer-logins"] });
    qc.invalidateQueries({ queryKey: ["users-admin"] });
    qc.invalidateQueries({ queryKey: ["sales-officers"] });
  };

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await api.staff.createSalesOfficer({
        email: email.trim(),
        password,
        full_name: name.trim(),
        phone: phone.trim() || null,
        territory_id: territory || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Sales Officer added");
      setName("");
      setEmail("");
      setPassword("");
      setPhone("");
      setTerritory("");
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const reset = useMutation({
    mutationFn: async () => {
      if (!resetId) return;
      const { error } = await api.staff.resetSalesOfficerPassword(resetId, nextPassword);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Password updated");
      setResetId(null);
      setNextPassword("");
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied");
    } catch {
      toast.error("Could not copy");
    }
  }

  return (
    <div className="mb-8 flex flex-col gap-6">
      <Section title="Add sales officer">
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (password.length < 8) {
              toast.error("Password must be at least 8 characters");
              return;
            }
            create.mutate();
          }}
        >
          <Field label="Full name">
            <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Field officer name" />
          </Field>
          <Field label="Username (email)">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="officer@biory.local" autoComplete="off" />
          </Field>
          <Field label="Password">
            <div className="relative">
              <Input
                type={showNew ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="pr-10"
              />
              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowNew((v) => !v)} aria-label={showNew ? "Hide password" : "Show password"}>
                {showNew ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                <IconTip label={showNew ? "Hide password" : "Show password"} />
              </button>
            </div>
          </Field>
          <Field label="Phone">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" />
          </Field>
          <Field label="Territory">
            <NativeSelect value={territory} onChange={(e) => setTerritory(e.target.value)}>
              <option value="">—</option>
              {territories.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </NativeSelect>
          </Field>
          <div className="flex items-end">
            <Button type="submit" disabled={create.isPending}>{create.isPending ? "Adding…" : "Add sales officer"}</Button>
          </div>
        </form>
      </Section>

      <Section title="Sales officer logins" bodyClassName="p-0">
        {officers.isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : (officers.data ?? []).length === 0 ? (
          <div className="p-5"><EmptyState title="No Sales Officers yet" description="Add one above. They can sign in with the email and password you type." /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Officer</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Password</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(officers.data ?? []).map((o) => {
                const open = visible[o.id];
                const editing = resetId === o.id;
                return (
                  <TableRow key={o.id}>
                    <TableCell>
                      <div className="font-medium">{o.full_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {o.so_code && <span className="num mr-2">{o.so_code}</span>}
                        {o.active ? "Active" : "Inactive"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span className="num text-sm">{o.email}</span>
                        <Button type="button" variant="ghost" size="icon" aria-label="Copy username" onClick={() => copy(o.email)}>
                          <Copy />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      {editing ? (
                        <Input
                          type="text"
                          value={nextPassword}
                          onChange={(e) => setNextPassword(e.target.value)}
                          placeholder="New password"
                          autoComplete="new-password"
                          className="h-8 w-44"
                        />
                      ) : o.login_password ? (
                        <div className="flex items-center gap-1">
                          <span className="num text-sm">{open ? o.login_password : "••••••••"}</span>
                          <Button type="button" variant="ghost" size="icon" aria-label={open ? "Hide password" : "Show password"} onClick={() => setVisible((v) => ({ ...v, [o.id]: !v[o.id] }))}>
                            {open ? <EyeOff /> : <Eye />}
                          </Button>
                          <Button type="button" variant="ghost" size="icon" aria-label="Copy password" onClick={() => copy(o.login_password!)}>
                            <Copy />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Not saved — reset it to store one you can see</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {editing ? (
                        <div className="flex justify-end gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => { setResetId(null); setNextPassword(""); }}>Cancel</Button>
                          <Button
                            type="button"
                            size="sm"
                            disabled={reset.isPending || nextPassword.length < 8}
                            onClick={() => reset.mutate()}
                          >
                            Save password
                          </Button>
                        </div>
                      ) : (
                        <Button type="button" size="sm" variant="outline" onClick={() => { setResetId(o.id); setNextPassword(""); }}>
                          Reset password
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Section>
    </div>
  );
}
