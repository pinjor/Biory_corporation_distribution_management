import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CalendarCheck, Clock, Download, Printer, UserX } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import {
  ATTENDANCE_LABEL,
  type AttendanceKind,
  type AttendancePerson,
  type AttendancePunch,
  buildAttendance,
  monthStart,
} from "@/lib/attendance";
import { ListPager, usePagedRows } from "@/components/app/list-pager";
import { FilterClear, ListToolbar } from "@/components/app/list-toolbar";
import { EmptyState, PageHeader, StatCard, StatusBadge } from "@/components/app/page";
import { NativeSelect } from "@/components/app/select-native";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadTableReport } from "@/lib/table-report";
import { salesOfficersQuery } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { errorMessage, formatDate, formatDateTime, todayBD } from "@/lib/format";
import { ProfilePhoto } from "@/components/app/profile-photo";

export const Route = createFileRoute("/_authenticated/attendance/history")({
  head: () => ({ meta: [{ title: "Attendance history — BIORY Corporation" }] }),
  component: AttendanceHistoryPage,
});

type PunchRecord = {
  so_id: string;
  work_date: string;
  punched_in_at: string;
  punched_out_at: string | null;
  profiles?: { full_name?: string | null; so_code?: string | null } | null;
};

const KINDS: AttendanceKind[] = ["FULL", "HALF", "SHORT", "ON_DUTY", "MISSED", "ABSENT"];

function AttendanceHistoryPage() {
  const s = useSession();
  const today = todayBD();
  const [q, setQ] = useState("");
  const [from, setFrom] = useState(monthStart(today));
  const [to, setTo] = useState(today);
  const [officer, setOfficer] = useState("");
  const [status, setStatus] = useState<AttendanceKind | "">("");
  const team = s.isAdmin;
  const officers = useQuery({ ...salesOfficersQuery, enabled: team });
  const sos = officers.data ?? [];
  const { data: punches = [], isLoading } = useQuery({
    queryKey: ["attendance", "history", from, to],
    queryFn: async () => {
      const { data, error } = await api
        .from("attendance_punches")
        .select("so_id, work_date, punched_in_at, punched_out_at, profiles!attendance_punches_so_id_fkey(full_name, so_code)")
        .gte("work_date", from)
        .lte("work_date", to)
        .order("work_date", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as PunchRecord[];
    },
  });

  const people = useMemo<AttendancePerson[]>(() => {
    if (!team) {
      return [{ id: s.userId, name: s.profile?.full_name || "Me", code: s.profile?.so_code || "", photo: s.profile?.avatar_path ?? null }];
    }
    const list = sos.map((person) => ({
      id: person.id as string,
      name: (person.full_name as string) || "Sales Officer",
      code: (person.so_code as string) || "",
      photo: (person.avatar_path as string | null) ?? null,
    }));
    return officer ? list.filter((person) => person.id === officer) : list;
  }, [team, s.userId, s.profile, sos, officer]);

  const built = useMemo(() => {
    const source: AttendancePunch[] = punches.map((punch) => ({
      soId: punch.so_id,
      workDate: punch.work_date,
      punchedIn: punch.punched_in_at,
      punchedOut: punch.punched_out_at,
    }));
    return buildAttendance(people, source, from, to);
  }, [people, punches, from, to]);

  const searched = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return built.rows;
    return built.rows.filter((row) => {
      const hay = `${row.name} ${row.code} ${row.workDate} ${ATTENDANCE_LABEL[row.kind]}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [built.rows, q]);

  const counts = useMemo(() => {
    const tally = { FULL: 0, HALF: 0, SHORT: 0, ON_DUTY: 0, MISSED: 0, ABSENT: 0 };
    for (const row of searched) tally[row.kind] += 1;
    return tally;
  }, [searched]);

  const shown = status ? searched.filter((row) => row.kind === status) : searched;
  const page = usePagedRows(shown, `${q}|${from}|${to}|${officer}|${status}`);

  function pick(kind: AttendanceKind) {
    setStatus((current) => (current === kind ? "" : kind));
  }

  function download() {
    void downloadTableReport("Attendance", from, to, {
      columns: ["Officer", "Code", "Date", "Punch in", "Punch out", "Hours", "Status"],
      rows: shown.map((row) => [
        row.name,
        row.code || "—",
        formatDate(row.workDate),
        row.punchedIn ? formatDateTime(row.punchedIn) : "—",
        row.punchedOut ? formatDateTime(row.punchedOut) : "—",
        row.hours,
        ATTENDANCE_LABEL[row.kind],
      ]),
    }).catch((error) => toast.error(errorMessage(error)));
  }

  return (
    <div>
      <PageHeader
        eyebrow="Attendance"
        title={team ? "Attendance history" : "My attendance"}
        description="Six hours or more is a full day. Punching out within three hours is a half day. A day with no punch is absent. Punching out after three hours but before six is a short day."
        actions={
          <>
            <Button variant="outline" onClick={() => window.print()}><Printer /> Print</Button>
            <Button onClick={download}><Download /> Download</Button>
          </>
        }
      />
      {!team && (
        <div className="mb-4 flex items-center gap-3">
          <ProfilePhoto path={s.profile?.avatar_path} name={s.profile?.full_name || "Me"} className="size-12" />
          <div>
            <div className="font-medium">{s.profile?.full_name || "Me"}</div>
            {s.profile?.so_code && <div className="num text-xs text-muted-foreground">{s.profile.so_code}</div>}
          </div>
        </div>
      )}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Full day" value={counts.FULL} hint="6 hours or more" tone="success" icon={<CalendarCheck />} onClick={() => pick("FULL")} active={status === "FULL"} />
        <StatCard label="Half day" value={counts.HALF} hint="Punched out within 3 hours" tone="warning" icon={<Clock />} onClick={() => pick("HALF")} active={status === "HALF"} />
        <StatCard label="Absent" value={counts.ABSENT} hint="No punch" tone="destructive" icon={<UserX />} onClick={() => pick("ABSENT")} active={status === "ABSENT"} />
        <StatCard label="On duty" value={counts.ON_DUTY} hint="Punched in, not out yet" tone="info" icon={<Clock />} onClick={() => pick("ON_DUTY")} active={status === "ON_DUTY"} />
      </div>
      <section className="print-sheet surface-card overflow-hidden">
        <header className="no-print flex flex-col gap-3 border-b px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-base font-semibold">{shown.length} days</h2>
          <ListToolbar query={q} onQuery={setQ} placeholder={team ? "Officer / code…" : "Date / status…"} from={from} to={to} onFrom={setFrom} onTo={setTo} maxTo={today}>
            {team && (
              <NativeSelect value={officer} onChange={(e) => setOfficer(e.target.value)} className="h-9 w-48 shrink-0" aria-label="Sales Officer">
                <option value="">All officers</option>
                {sos.map((person) => (
                  <option key={person.id} value={person.id}>{person.full_name}</option>
                ))}
              </NativeSelect>
            )}
            <NativeSelect value={status} onChange={(e) => setStatus(e.target.value as AttendanceKind | "")} className="h-9 w-44 shrink-0" aria-label="Status">
              <option value="">All statuses</option>
              {KINDS.map((kind) => (
                <option key={kind} value={kind}>{ATTENDANCE_LABEL[kind]}</option>
              ))}
            </NativeSelect>
            <FilterClear onClick={() => { setQ(""); setOfficer(""); setStatus(""); setFrom(monthStart(today)); setTo(today); }} />
          </ListToolbar>
        </header>
        {built.trimmed && (
          <p className="border-b px-4 py-2 text-xs text-muted-foreground">This range is longer than 92 days. Narrow the dates to see the rest.</p>
        )}
        {isLoading || (team && officers.isLoading) ? (
          <div className="p-6 text-sm text-muted-foreground">Loading attendance…</div>
        ) : shown.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No attendance in this range" description="Change the dates or clear the filters." />
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  {team && <TableHead>Officer</TableHead>}
                  <TableHead>Date</TableHead>
                  <TableHead>Punch in</TableHead>
                  <TableHead>Punch out</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.pageRows.map((row) => (
                  <TableRow key={`${row.soId}|${row.workDate}`}>
                    {team && (
                      <TableCell className="text-sm">
                        <div className="flex items-center gap-2">
                          <ProfilePhoto path={row.photo} name={row.name} className="size-8" />
                          <div className="min-w-0">
                            <div className="truncate">{row.name}</div>
                            {row.code && <div className="num text-xs text-muted-foreground">{row.code}</div>}
                          </div>
                        </div>
                      </TableCell>
                    )}
                    <TableCell className="whitespace-nowrap text-sm">{formatDate(row.workDate)}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{row.punchedIn ? formatDateTime(row.punchedIn) : "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{row.punchedOut ? formatDateTime(row.punchedOut) : "—"}</TableCell>
                    <TableCell className="num text-sm">{row.hours}</TableCell>
                    <TableCell><StatusBadge status={row.kind} label={ATTENDANCE_LABEL[row.kind]} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <ListPager page={page.page} pages={page.pages} total={page.total} pageSize={page.pageSize} noun="days" onPage={page.setPage} onSize={page.setPageSize} />
          </>
        )}
      </section>
    </div>
  );
}
