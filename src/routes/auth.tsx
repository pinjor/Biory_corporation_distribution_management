import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import "@lovable.dev/cloud-auth-js/styles.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/app/page";
import { errorMessage } from "@/lib/format";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — PharmaField" },
      { name: "description", content: "Sign in to PharmaField to manage stock, orders, deliveries and collections." },
      { property: "og:title", content: "Sign in — PharmaField" },
      { property: "og:description", content: "Access your PharmaField workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard", replace: true });
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) navigate({ to: "/dashboard", replace: true });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/dashboard", data: { full_name: fullName } },
        });
        if (error) throw error;
        if (!data.session) setSent("Check your email and click the confirmation link to finish creating your account.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setSent("If that email has an account, a password reset link is on its way.");
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function oauth(provider: "google" | "lovable") {
    const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: window.location.origin + "/auth" });
    if (result.error) toast.error(errorMessage(result.error));
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="bg-hero hidden flex-col justify-between p-10 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-highlight font-display text-sm font-bold text-highlight-foreground">
            Pf
          </span>
          <span className="font-display text-lg font-semibold text-sidebar-accent-foreground">PharmaField</span>
        </div>
        <blockquote className="max-w-md">
          <p className="font-display text-3xl leading-tight text-sidebar-accent-foreground">
            Stock decreases on delivery. Money moves on approval. History never changes.
          </p>
        </blockquote>
        <p className="text-xs text-sidebar-foreground/70">Times shown in Asia/Dhaka</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold">
            {mode === "signin" ? "Welcome back" : mode === "signup" ? "Create your account" : "Reset password"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signup"
              ? "New accounts get access once a Super Admin assigns your role."
              : mode === "forgot"
                ? "We'll email you a link to set a new password."
                : "Sign in to your PharmaField workspace."}
          </p>

          {sent ? (
            <div className="mt-6 rounded-xl border bg-primary-soft p-4 text-sm text-accent-foreground">{sent}</div>
          ) : (
            <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
              {mode === "signup" && (
                <Field label="Full name">
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="name" />
                </Field>
              )}
              <Field label="Email">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
              </Field>
              {mode !== "forgot" && (
                <Field label="Password">
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  />
                </Field>
              )}
              <Button type="submit" disabled={busy}>
                {busy ? "Please wait…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
              </Button>
            </form>
          )}

          {mode !== "forgot" && !sent && (
            <>
              <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
              </div>
              <div className="flex flex-col gap-2">
                <Button type="button" variant="outline" onClick={() => oauth("google")}>
                  Continue with Google
                </Button>
                <button type="button" className="lovable-auth-button" onClick={() => oauth("lovable")}>
                  Continue with Lovable
                </button>
              </div>
            </>
          )}

          <div className="mt-6 flex flex-wrap justify-between gap-2 text-sm">
            {mode === "signin" ? (
              <>
                <button className="text-primary hover:underline" onClick={() => setMode("signup")}>
                  Create an account
                </button>
                <button className="text-muted-foreground hover:underline" onClick={() => setMode("forgot")}>
                  Forgot password?
                </button>
              </>
            ) : (
              <button
                className="text-primary hover:underline"
                onClick={() => {
                  setMode("signin");
                  setSent(null);
                }}
              >
                Back to sign in
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
