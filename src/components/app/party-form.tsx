import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { Field } from "@/components/app/page";
import { PlaceCombo } from "@/components/app/place-combo";
import { NativeSelect } from "@/components/app/select-native";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { geoPlacesQuery, territoriesQuery, type GeoPlace } from "@/lib/queries";
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
  { key: "upazila", label: "Upazila" },
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
  const { data: places = [] } = useQuery({ ...geoPlacesQuery, enabled: kind === "chemist" });
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
      const { data, error } = await api.rpc("find_party_duplicates", args);
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
      const table = kind === "chemist" ? "chemists" : "doctors";
      const { error } = editing
        ? await api.from(table).update(payload as never).eq("id", String(initial!["id"]))
        : await api.from(table).insert(payload as never);
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
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((d) =>
            kind === "chemist" && (d.key === "division" || d.key === "district" || d.key === "upazila") ? (
              <PlaceField key={d.key} level={d.key} label={d.label} places={places} values={f} set={set} />
            ) : (
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
            ),
          )}
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !name.trim()}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function namesFor(places: GeoPlace[], level: GeoPlace["level"], parentId: string | null, current: string) {
  const rows = places
    .filter((place) => place.level === level && (level === "division" ? place.parent_id == null : place.parent_id === parentId))
    .map((place) => place.name);
  const unique = [...new Set(rows)].sort((a, b) => a.localeCompare(b));
  if (current && !unique.some((name) => name.toLowerCase() === current.toLowerCase())) unique.unshift(current);
  return unique;
}

function PlaceField({
  level,
  label,
  places,
  values,
  set,
}: {
  level: "division" | "district" | "upazila";
  label: string;
  places: GeoPlace[];
  values: Values;
  set: (key: string, value: string | number | null) => void;
}) {
  const qc = useQueryClient();
  const division = String(values["division"] ?? "");
  const district = String(values["district"] ?? "");
  const upazila = String(values["upazila"] ?? "");
  const divisionRow = places.find((place) => place.level === "division" && place.name.toLowerCase() === division.toLowerCase());
  const districtRow = places.find(
    (place) => place.level === "district" && place.parent_id === divisionRow?.id && place.name.toLowerCase() === district.toLowerCase(),
  );
  const parent = level === "division" ? null : level === "district" ? divisionRow : districtRow;
  const ready = level === "division" || !!parent;
  const current = level === "division" ? division : level === "district" ? district : upazila;
  const options = namesFor(places, level, parent?.id ?? null, ready ? current : current);

  async function saveName(name: string) {
    if (!ready || (level !== "division" && !parent)) {
      toast.error(level === "district" ? "Choose a division first" : "Choose a district first");
      throw new Error("parent");
    }
    const { data, error } = await api.from("geo_places").insert({ level, name, parent_id: parent?.id ?? null });
    if (error) {
      toast.error(errorMessage(error));
      throw error;
    }
    const row = (Array.isArray(data) ? data[0] : null) as GeoPlace | null;
    if (row) {
      qc.setQueryData<GeoPlace[]>(["geo-places"], (old) => [...(old ?? []).filter((item) => item.id !== row.id), row]);
    } else {
      await qc.invalidateQueries({ queryKey: ["geo-places"] });
    }
    if (level === "division") {
      set("division", name);
      set("district", "");
      set("upazila", "");
    } else if (level === "district") {
      set("district", name);
      set("upazila", "");
    } else {
      set("upazila", name);
    }
  }

  return (
    <Field label={label}>
      <PlaceCombo
        label={label}
        value={current}
        options={ready ? options : current ? [current] : []}
        placeholder={
          ready
            ? `Choose ${label.toLowerCase()}, or type a new one`
            : level === "district"
              ? "Choose a division first"
              : "Choose a district first"
        }
        disabled={!ready && !current}
        onChange={(name) => {
          if (level === "division") {
            const next = places.find((place) => place.level === "division" && place.name.toLowerCase() === name.toLowerCase());
            const still = places.some(
              (place) => place.level === "district" && place.parent_id === next?.id && place.name.toLowerCase() === district.toLowerCase(),
            );
            set("division", name);
            if (!still) {
              set("district", "");
              set("upazila", "");
            }
          } else if (level === "district") {
            const next = places.find(
              (place) => place.level === "district" && place.parent_id === divisionRow?.id && place.name.toLowerCase() === name.toLowerCase(),
            );
            const still = places.some(
              (place) => place.level === "upazila" && place.parent_id === next?.id && place.name.toLowerCase() === upazila.toLowerCase(),
            );
            set("district", name);
            if (!still) set("upazila", "");
          } else {
            set("upazila", name);
          }
        }}
        onCreate={saveName}
      />
    </Field>
  );
}
