import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AlertTriangle, MapPin } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Field } from "@/components/app/page";
import { NativeSelect } from "@/components/app/select-native";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { salesOfficersQuery, territoriesQuery } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { errorMessage } from "@/lib/format";

export type PartyKind = "chemist" | "doctor";

type FieldDef = { key: string; label: string; type?: string; span?: boolean; required?: boolean };

const CHEMIST_FIELDS: FieldDef[] = [
  { key: "business_name", label: "Business / shop name", required: true },
  { key: "owner_name", label: "Owner / contact person" },
  { key: "mobile", label: "Mobile" },
  { key: "alternate_mobile", label: "Alternate mobile" },
  { key: "address", label: "Address", span: true },
  { key: "division", label: "Division" },
  { key: "district", label: "District" },
  { key: "upazila", label: "Upazila / area" },
  { key: "route", label: "Route" },
  { key: "drug_license_no", label: "Drug licence no." },
  { key: "credit_limit", label: "Credit limit (৳, 0 = none)", type: "number" },
  { key: "payment_terms_days", label: "Payment terms (days)", type: "number" },
];

const DOCTOR_FIELDS: FieldDef[] = [
  { key: "name", label: "Doctor name", required: true },
  { key: "speciality", label: "Speciality" },
  { key: "qualification", label: "Qualification" },
  { key: "mobile", label: "Mobile" },
  { key: "hospital", label: "Hospital" },
  { key: "chamber", label: "Chamber" },
  { key: "address", label: "Address", span: true },
];

type Values = Record<string, string | number | null>;

export function PartyDialog({ kind, initial, onClose }: { kind: PartyKind; initial: Values | null; onClose: () => void }) {
  const s = useSession();
  const qc = useQueryClient();
  const { data: territories = [] } = useQuery(territoriesQuery);
  const { data: sos = [] } = useQuery({ ...salesOfficersQuery, enabled: s.isAdmin });
  const fields = kind === "chemist" ? CHEMIST_FIELDS : DOCTOR_FIELDS;
  const [f, setF] = useState<Values>(() => ({
    status: "active",
    territory_id: s.profile?.territory_id ?? null,
    ...(kind === "chemist" ? { credit_limit: 0, payment_terms_days: 30 } : {}),
    ...(initial ?? {}),
  }));
  const editing = !!initial?.["id"];
  const set = (k: string, v: string | number | null) => setF((x) => ({ ...x, [k]: v }));

  const name = String((kind === "chemist" ? f["business_name"] : f["name"]) ?? "");
  const place = String((kind === "chemist" ? (f["upazila"] ?? f["district"] ?? f["address"]) : (f["chamber"] ?? f["hospital"])) ?? "");
  const mobile = String(f["mobile"] ?? "");
  const [debounced, setDebounced] = useState({ name, place, mobile });
  useEffect(() => {
    const t = setTimeout(() => setDebounced({ name, place, mobile }), 400);
    return () => clearTimeout(t);
  }, [name, place, mobile]);

  const { data: dupes = [] } = useQuery({
    queryKey: ["dupes", kind, debounced, initial?.["id"]],
    enabled: debounced.name.length > 2 || debounced.mobile.length > 6,
    queryFn: async () => {
      const args = {
        p_kind: kind,
        p_name: debounced.name,
        p_mobile: debounced.mobile,
        p_place: debounced.place,
        ...(initial?.["id"] ? { p_exclude: String(initial["id"]) } : {}),
      };
      const { data, error } = await supabase.rpc("find_party_duplicates", args);
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = { status: f["status"], territory_id: f["territory_id"] || null };
      for (const d of fields) {
        const v = f[d.key];
        payload[d.key] = d.type === "number" ? Number(v ?? 0) : v === "" || v === undefined ? null : String(v).trim();
      }
      payload["latitude"] = f["latitude"] === "" || f["latitude"] == null ? null : Number(f["latitude"]);
      payload["longitude"] = f["longitude"] === "" || f["longitude"] == null ? null : Number(f["longitude"]);
      if (s.isAdmin && f["assigned_so"]) payload["assigned_so"] = f["assigned_so"];
      const table = kind === "chemist" ? "chemists" : "doctors";
      const { error } = editing
        ? await supabase.from(table).update(payload as never).eq("id", String(initial!["id"]))
        : await supabase.from(table).insert(payload as never);
      if (error) {
        if (error.message.includes("mobile_uq")) throw new Error("Another record already uses this mobile number.");
        throw error;
      }
    },
    onSuccess: () => {
      toast.success(kind === "chemist" ? "Chemist saved" : "Doctor saved");
      qc.invalidateQueries({ queryKey: [kind === "chemist" ? "chemists" : "doctors"] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  function useGps() {
    if (!navigator.geolocation) {
      toast.error("Location isn't available on this device");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        set("latitude", Number(p.coords.latitude.toFixed(6)));
        set("longitude", Number(p.coords.longitude.toFixed(6)));
      },
      () => toast.error("Couldn't read your location"),
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit" : "New"} {kind}
          </DialogTitle>
        </DialogHeader>
        {dupes.length > 0 && (
          <div className="rounded-lg border border-warning bg-warning-soft p-3 text-sm text-warning-foreground">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="size-4" /> Possible duplicate
            </div>
            <ul className="mt-1 list-disc pl-5">
              {dupes.map((d) => (
                <li key={d.id}>
                  <span className="num">{d.code}</span> {d.name} · {d.mobile ?? "no mobile"} · {d.place ?? ""} — {d.reason}
                  {d.assigned_to ? ` (assigned to ${d.assigned_to})` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((d) => (
            <div key={d.key} className={d.span ? "sm:col-span-2" : ""}>
              <Field label={d.label}>
                <Input
                  type={d.type ?? "text"}
                  required={d.required}
                  value={(f[d.key] ?? "") as string}
                  onChange={(e) => set(d.key, e.target.value)}
                />
              </Field>
            </div>
          ))}
          <Field label="Territory">
            <NativeSelect value={(f["territory_id"] as string) ?? ""} onChange={(e) => set("territory_id", e.target.value || null)}>
              <option value="">—</option>
              {territories.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} {t.area ? `· ${t.area}` : ""}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Status">
            <NativeSelect value={(f["status"] as string) ?? "active"} onChange={(e) => set("status", e.target.value)}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </NativeSelect>
          </Field>
          {s.isAdmin && (
            <Field label="Assigned Sales Officer">
              <NativeSelect value={(f["assigned_so"] as string) ?? ""} onChange={(e) => set("assigned_so", e.target.value || null)}>
                <option value="">Choose SO…</option>
                {sos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} {p.so_code ? `(${p.so_code})` : ""}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
          <Field label="Location (GPS)">
            <div className="flex gap-2">
              <Input placeholder="Lat" value={(f["latitude"] ?? "") as string} onChange={(e) => set("latitude", e.target.value)} />
              <Input placeholder="Lng" value={(f["longitude"] ?? "") as string} onChange={(e) => set("longitude", e.target.value)} />
              <Button type="button" variant="outline" size="icon" onClick={useGps} aria-label="Use my location">
                <MapPin />
              </Button>
            </div>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !name.trim() || (s.isAdmin && !editing && !f["assigned_so"])}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
