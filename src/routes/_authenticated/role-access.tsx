import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { PageHeader, Section, EmptyState } from "@/components/app/page";
import { Checkbox } from "@/components/ui/checkbox";
import { MENU_CATALOG } from "@/lib/access";
import { ALL_ROLES, ROLE_LABELS, useSession, type AppRole } from "@/lib/session";
import { errorMessage } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/role-access")({
  head: () => ({ meta: [{ title: "Role access — BIORY Corporation" }] }),
  component: RoleAccessPage,
});

const LOCKED = new Set(["/dashboard", "/users", "/role-access"]);

function RoleAccessPage() {
  const s = useSession();
  const router = useRouter();
  const qc = useQueryClient();
  const { data = [], isLoading, isError, error } = useQuery({
    queryKey: ["role-menus"],
    queryFn: async () => {
      const { data, error } = await api.rpc("list_role_menus");
      if (error) throw error;
      return (data ?? []) as { role: AppRole; menu_key: string }[];
    },
  });
  const granted = new Set(data.map((row) => `${row.role}:${row.menu_key}`));
  const save = useMutation({
    mutationFn: async ({ role, key, allow }: { role: AppRole; key: string; allow: boolean }) => {
      const { error } = await api.rpc("set_role_menu", { p_role: role, p_menu_key: key, p_allow: allow });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Menu access saved");
      await qc.invalidateQueries({ queryKey: ["role-menus"] });
      await router.invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const groups = [...new Set(MENU_CATALOG.map((item) => item.group))];

  return (
    <div>
      <PageHeader
        title="Role access"
        description="Tick the menus each role may open. A person sees those menus after their role is set on Users."
      />
      {!s.isSuper && <p className="mb-4 rounded-lg bg-muted px-4 py-2 text-sm text-muted-foreground">Only a Super Admin can change this.</p>}
      <Section bodyClassName="p-0" title="Menus by role">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : isError ? (
          <div className="p-6 text-sm text-destructive">{errorMessage(error)}</div>
        ) : data.length === 0 ? (
          <div className="p-5"><EmptyState title="No menu access saved yet" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Menu</th>
                  {ALL_ROLES.map((role) => <th key={role} className="px-3 py-3 text-center font-medium">{ROLE_LABELS[role]}</th>)}
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <Fragment key={group}>
                    <tr className="bg-muted/40">
                      <td colSpan={ALL_ROLES.length + 1} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</td>
                    </tr>
                    {MENU_CATALOG.filter((item) => item.group === group).map((item) => (
                      <tr key={item.key} className="border-b">
                        <td className="px-4 py-2.5">{item.label}</td>
                        {ALL_ROLES.map((role) => {
                          const locked = role === "super_admin" && LOCKED.has(item.key);
                          const on = locked || granted.has(`${role}:${item.key}`);
                          return (
                            <td key={role} className="px-3 py-2.5 text-center">
                              <Checkbox
                                aria-label={`${item.label} for ${ROLE_LABELS[role]}`}
                                checked={on}
                                disabled={!s.isSuper || locked || save.isPending}
                                onCheckedChange={(value) => save.mutate({ role, key: item.key, allow: value === true })}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
