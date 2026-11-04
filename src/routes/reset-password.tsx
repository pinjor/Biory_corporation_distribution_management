import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/app/page";
import { errorMessage } from "@/lib/format";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a new password — PharmaField" },
      { name: "description", content: "Choose a new password for your PharmaField account." },
      { property: "og:title", content: "Set a new password — PharmaField" },
      { property: "og:description", content: "Choose a new password for your PharmaField account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return toast.error(errorMessage(error));
    toast.success("Password updated");
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <form onSubmit={submit} className="surface-card flex w-full max-w-sm flex-col gap-4 p-6">
        <h1 className="text-xl font-semibold">Set a new password</h1>
        <Field label="New password">
          <Input type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save password"}
        </Button>
      </form>
    </div>
  );
}
