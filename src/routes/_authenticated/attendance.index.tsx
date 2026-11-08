import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { LogIn, LogOut } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { ATTENDANCE_LABEL, attendanceKind, formatHours } from "@/lib/attendance";
import { errorMessage, formatDate, todayBD } from "@/lib/format";
import { useSession } from "@/lib/session";
import { PageHeader, StatusBadge } from "@/components/app/page";
import { ProfilePhoto } from "@/components/app/profile-photo";

export const Route = createFileRoute("/_authenticated/attendance/")({
  head: () => ({ meta: [{ title: "Punch in / out — BIORY Corporation" }] }),
  component: PunchPage,
});

type PunchRow = {
  id: string;
  work_date: string;
  punched_in_at: string;
  punched_out_at: string | null;
};

function PunchPage() {
  const s = useSession();
  const qc = useQueryClient();
  const today = todayBD();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const { data: row, isLoading } = useQuery({
    queryKey: ["attendance", "today", s.userId, today],
    enabled: s.isSO,
    queryFn: async () => {
      const { data, error } = await api
        .from("attendance_punches")
        .select("id, work_date, punched_in_at, punched_out_at")
        .eq("so_id", s.userId)
        .eq("work_date", today)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as PunchRow | null;
    },
  });

  const punch = useMutation({
    mutationFn: async (which: "in" | "out") => {
      const { data, error } = await api.rpc(which === "in" ? "punch_in" : "punch_out", {
        p_idempotency_key: crypto.randomUUID(),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, which) => {
      toast.success(which === "in" ? "Punched in" : "Punched out");
      qc.invalidateQueries({ queryKey: ["attendance"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const clock = new Date(now).toLocaleTimeString("en-GB", {
    timeZone: "Asia/Dhaka",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const kind = row ? attendanceKind(row.punched_in_at, row.punched_out_at, row.work_date, now) : null;
  const open = !!row && !row.punched_out_at;
  const done = !!row?.punched_out_at;

  return (
    <div>
      <PageHeader
        eyebrow="Attendance"
        title="Punch in / out"
        description="Punch in when the day starts. Six hours counts as a full day. Punching out within three hours counts as a half day."
      />
      {!s.isSO ? (
        <section className="surface-card mx-auto max-w-xl p-8 text-sm text-muted-foreground">
          Punch in and punch out are for Sales Officers. Open{" "}
          <Link to="/attendance/history" className="font-medium text-primary hover:underline">Attendance history</Link>{" "}
          to see every officer.
        </section>
      ) : (
        <section className="surface-card relative mx-auto max-w-xl overflow-hidden px-6 py-10 sm:px-10">
          <div className="pointer-events-none absolute -right-20 -top-24 size-56 rounded-full bg-primary/10" />
          <div className="pointer-events-none absolute -bottom-24 -left-16 size-48 rounded-full bg-primary/5" />
          <div className="relative flex flex-col items-center text-center">
            <ProfilePhoto path={s.profile?.avatar_path} name={s.profile?.full_name || "Sales Officer"} className="size-20 text-lg" />
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary">{s.profile?.so_code || "Sales Officer"}</p>
            <p className="mt-2 text-sm text-muted-foreground">{s.profile?.full_name}</p>
            <p className="num mt-6 text-5xl font-semibold tracking-tight text-foreground sm:text-6xl">{clock}</p>
            <p className="mt-2 text-sm text-muted-foreground">{formatDate(today)}</p>
            <div className="mt-4 flex min-h-7 items-center gap-2">
              {kind && <StatusBadge status={kind} label={ATTENDANCE_LABEL[kind]} />}
              {open && <span className="num text-sm text-muted-foreground">{formatHours(row.punched_in_at, now)}</span>}
            </div>
            <button
              type="button"
              disabled={isLoading || punch.isPending || done}
              onClick={() => punch.mutate(row ? "out" : "in")}
              className="mt-8 grid size-44 place-items-center rounded-full bg-primary text-primary-foreground shadow-lift transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="flex flex-col items-center gap-2">
                {done ? <LogOut className="size-7" /> : row ? <LogOut className="size-7" /> : <LogIn className="size-7" />}
                <span className="text-lg font-semibold">{done ? "Done today" : row ? "Punch out" : "Punch in"}</span>
              </span>
            </button>
            <p className="mt-6 max-w-sm text-sm text-muted-foreground">
              {isLoading
                ? "Checking today's punch…"
                : done
                  ? `Punched out at ${new Date(row.punched_out_at ?? "").toLocaleTimeString("en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit", hour12: false })}.`
                  : open
                    ? "You are on duty. Punch out when the day ends."
                    : "You have not punched in today."}
            </p>
            <Link to="/attendance/history" className="mt-4 text-sm font-medium text-primary hover:underline">
              Attendance history
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
