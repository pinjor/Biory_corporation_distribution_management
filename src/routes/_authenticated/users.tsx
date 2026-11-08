import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { ListPager, usePagedRows } from "@/components/app/list-pager";
import { FilterClear, ListToolbar } from "@/components/app/list-toolbar";
import { PageHeader, Section, EmptyState } from "@/components/app/page";
import { NativeSelect } from "@/components/app/select-native";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ALL_ROLES, ROLE_LABELS, useSession, type AppRole } from "@/lib/session";
import { errorMessage } from "@/lib/format";
import { ProfilePhoto } from "@/components/app/profile-photo";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({ meta: [{ title: "Users — BIORY Corporation" }] }),
  component: UsersPage,
});

type Account = {
  id: string;
  email: string;
  full_name: string;
  password: string | null;
  role: AppRole | null;
  avatar_path: string | null;
  created_at: string;
};

function UsersPage() {
  const s = useSession();
  const router = useRouter();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const { data = [], isLoading } = useQuery({
    queryKey: ["user-accounts"],
    queryFn: async () => {
      const { data, error } = await api.rpc("list_user_accounts");
      if (error) throw error;
      return (data ?? []) as Account[];
    },
  });
  const setRole = useMutation({
    mutationFn: async ({ user, role }: { user: string; role: AppRole }) => {
      const { error } = await api.rpc("assign_user_role", { p_user: user, p_role: role });
      if (error) throw error;
    },
    onSuccess: async (_data, vars) => {
      toast.success("Role updated");
      await qc.invalidateQueries({ queryKey: ["user-accounts"] });
      if (vars.user === s.userId) await router.invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const rows = data.filter((u) => !q || `${u.full_name} ${u.email}`.toLowerCase().includes(q.toLowerCase()));
  const page = usePagedRows(rows, q);

  return (
    <div>
      <PageHeader
        title="Users"
        description="Every account, with the username, password and role. Switching a role changes which menus that person sees."
      />
      {!s.isSuper && <p className="mb-4 rounded-lg bg-muted px-4 py-2 text-sm text-muted-foreground">Only a Super Admin can change a role or password.</p>}
      <Section
        bodyClassName="p-0"
        title={`${rows.length} users`}
        actions={<ListToolbar query={q} onQuery={setQ} placeholder="Name / username…" ><FilterClear onClick={() => setQ("")} /></ListToolbar>}
      >
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-5"><EmptyState title="No users" /></div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Password</TableHead>
                  <TableHead>Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.pageRows.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <ProfilePhoto path={u.avatar_path} name={u.full_name || u.email} />
                        <div className="min-w-0">
                          <div className="truncate font-medium">{u.email}</div>
                          <div className="truncate text-xs text-muted-foreground">{u.full_name || "—"}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <PasswordCell key={`${u.id}:${u.password ?? ""}`} userId={u.id} password={u.password} canEdit={s.isSuper} onSaved={() => qc.invalidateQueries({ queryKey: ["user-accounts"] })} />
                    </TableCell>
                    <TableCell>
                      <NativeSelect
                        className="h-9 w-44"
                        aria-label={`Role for ${u.email}`}
                        disabled={!s.isSuper || setRole.isPending}
                        value={u.role ?? ""}
                        onChange={(e) => {
                          const role = e.target.value as AppRole;
                          if (role && role !== u.role) setRole.mutate({ user: u.id, role });
                        }}
                      >
                        {!u.role && <option value="">No role</option>}
                        {ALL_ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
                      </NativeSelect>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <ListPager page={page.page} pages={page.pages} total={page.total} pageSize={page.pageSize} noun="users" onPage={page.setPage} onSize={page.setPageSize} />
          </>
        )}
      </Section>
    </div>
  );
}

function PasswordCell({ userId, password, canEdit, onSaved }: { userId: string; password: string | null; canEdit: boolean; onSaved: () => void }) {
  const [value, setValue] = useState(password ?? "");
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(false);
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await api.staff.setUserPassword(userId, value);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Password saved");
      setEditing(false);
      onSaved();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const shown = editing ? value : (password ?? "");
  return (
    <div className="flex items-center gap-1">
      <Input
        type={show ? "text" : "password"}
        value={shown}
        readOnly={!canEdit}
        placeholder={password ? "" : "Not on file"}
        aria-label="Password"
        className="h-9 w-44"
        onChange={(e) => {
          setEditing(true);
          setValue(e.target.value);
        }}
      />
      <Button type="button" size="icon" variant="ghost" aria-label={show ? "Hide password" : "Show password"} className="size-8" onClick={() => setShow((v) => !v)}>
        {show ? <EyeOff /> : <Eye />}
      </Button>
      {canEdit && editing && (
        <Button type="button" className="h-9" disabled={save.isPending || value.length < 8} onClick={() => save.mutate()}>
          Save
        </Button>
      )}
    </div>
  );
}
