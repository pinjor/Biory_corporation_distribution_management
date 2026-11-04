import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Section, EmptyState } from "@/components/app/page";
import { NativeSelect } from "@/components/app/select-native";
import { Badge } from "@/components/ui/badge";
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
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id, role"),
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
      const { error } = await supabase.rpc("set_user_role", { p_user: user, p_role: role, p_grant: grant });
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
      const { error } = await supabase.rpc("admin_update_profile", {
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
        description="People sign up themselves; nobody gets access until a Super Admin assigns a role. Sales Officers automatically get their own stock location and SO code."
      />
      {!s.isSuper && <p className="mb-4 rounded-lg bg-muted px-4 py-2 text-sm text-muted-foreground">Only a Super Admin can change roles.</p>}
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
