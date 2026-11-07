import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api/client";
import { PageHeader, Section, EmptyState } from "@/components/app/page";
import { NativeSelect } from "@/components/app/select-native";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { profilesQuery } from "@/lib/queries";
import { formatDateTime, humanize } from "@/lib/format";
import type { Json } from "@/lib/database.types";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({ meta: [{ title: "Audit log — BIORY Corporation" }] }),
  component: AuditPage,
});

const ENTITIES = ["products", "app_settings", "user_roles", "profiles", "orders", "collections", "deposits", "requisitions", "chemists", "doctors"];
const SKIP = new Set(["updated_at", "created_at"]);

function diff(before: Json | null, after: Json | null): string[] {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  if (!before) return Object.keys(a).filter((k) => !SKIP.has(k) && a[k] !== null).slice(0, 6).map((k) => `${k}: ${String(a[k])}`);
  return Object.keys(a)
    .filter((k) => !SKIP.has(k) && JSON.stringify(a[k]) !== JSON.stringify(b[k]))
    .map((k) => `${k}: ${String(b[k] ?? "∅")} → ${String(a[k] ?? "∅")}`);
}

function AuditPage() {
  const [entity, setEntity] = useState("");
  const [limit, setLimit] = useState(100);
  const { data: profiles = [] } = useQuery(profilesQuery);
  const names = new Map(profiles.map((p) => [p.id, p.full_name]));
  const { data = [], isLoading } = useQuery({
    queryKey: ["audit", entity, limit],
    queryFn: async () => {
      let q = api.from("audit_log").select("*").order("created_at", { ascending: false }).limit(limit);
      if (entity) q = q.eq("entity", entity);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
  return (
    <div>
      <PageHeader title="Audit log" description="Immutable record of who changed what and when. Entries can't be edited or deleted." />
      <Section
        bodyClassName="p-0"
        title={`${data.length} events`}
        actions={
          <NativeSelect value={entity} onChange={(e) => setEntity(e.target.value)} className="h-8 w-44">
            <option value="">All records</option>
            {ENTITIES.map((e) => <option key={e} value={e}>{humanize(e)}</option>)}
          </NativeSelect>
        }
      >
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : data.length === 0 ? (
          <div className="p-5"><EmptyState title="No events" /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Changes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="whitespace-nowrap text-xs">{formatDateTime(a.created_at)}</TableCell>
                  <TableCell className="text-sm">{a.actor ? (names.get(a.actor) ?? "Unknown user") : "System"}</TableCell>
                  <TableCell className="text-sm">
                    <div className="font-medium">{humanize(a.action)} {humanize(a.entity)}</div>
                    {a.reason && <div className="text-xs text-muted-foreground">{a.reason}</div>}
                  </TableCell>
                  <TableCell className="max-w-md">
                    <ul className="num text-[11px] text-muted-foreground">
                      {diff(a.before_data, a.after_data).slice(0, 8).map((d, i) => <li key={i} className="truncate">{d}</li>)}
                    </ul>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
      {data.length >= limit && (
        <div className="mt-4 text-center"><Button variant="outline" onClick={() => setLimit((l) => l + 200)}>Load more</Button></div>
      )}
    </div>
  );
}
