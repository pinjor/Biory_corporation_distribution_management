import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  Eye,
  EyeOff,
  HandCoins,
  Loader2,
  Lock,
  Mail,
  MailCheck,
  ShieldCheck,
  Truck,
  UserRound,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { BrandMark } from "@/components/app/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/format";
import { clearOfflineCaches } from "@/lib/offline/session-cache";
import {
  getRememberedEmail,
  getRememberPreference,
  sessionShouldEnd,
  setRememberPreference,
} from "@/lib/auth/remember-me";
export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — BIORY Corporation" },
      {
        name: "description",
        content:
          "Sign in to BIORY Corporation to manage stock, orders, deliveries and collections.",
      },
      { property: "og:title", content: "Sign in — BIORY Corporation" },
      { property: "og:description", content: "Access your BIORY Corporation workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot";
type Busy = null | "form";

const HIGHLIGHTS = [
  { icon: Boxes, title: "Batch & expiry stock", text: "FEFO issue on an append-only ledger" },
  { icon: Truck, title: "Partial deliveries", text: "Challans that match what left the shelf" },
  { icon: HandCoins, title: "Approved collections", text: "Wallet → deposit → receipt, audited" },
  {
    icon: ShieldCheck,
    title: "Role-based access",
    text: "Five roles, rules enforced on the server",
  },
];

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState<Busy>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setRemember(getRememberPreference());
    const saved = getRememberedEmail();
    if (saved) setEmail(saved);

    let cancelled = false;
    (async () => {
      if (sessionShouldEnd()) {
        clearOfflineCaches();
        await api.auth.signOut({ scope: "local" }).catch(() => undefined);
        return;
      }
      const { data } = await api.auth.getUser();
      if (!cancelled && data.user) navigate({ to: "/dashboard", replace: true });
    })();
    const { data } = api.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) navigate({ to: "/dashboard", replace: true });
    });
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, [navigate]);

  function switchMode(next: Mode) {
    setMode(next);
    setSent(null);
    setFormError(null);
    setShowPassword(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy("form");
    setFormError(null);
    try {
      if (mode === "signin") {
        setRememberPreference(remember, email.trim());
        const { error } = await api.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        toast.success("Welcome back");
      } else if (mode === "signup") {
        return;
      } else {
        const { error } = await api.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setSent("If that email has an account, a password reset link is on its way.");
      }
    } catch (err) {
      const message = errorMessage(err);
      setFormError(message);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  }

  function trackCaps(e: React.KeyboardEvent<HTMLInputElement>) {
    setCapsLock(e.getModifierState?.("CapsLock") ?? false);
  }

  const title =
    mode === "signin"
      ? "Welcome back"
      : mode === "signup"
        ? "Contact your admin"
        : "Reset your password";
  const subtitle =
    mode === "signup"
      ? "A Super Admin creates every account. Public sign-up is closed."
      : mode === "forgot"
        ? "Enter your work email and we'll send you a secure reset link."
        : "Sign in to your BIORY Corporation workspace.";

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[1.05fr_1fr]">
      <BrandPanel />

      <main className="relative flex items-center justify-center px-4 py-10 sm:px-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60 [background-image:radial-gradient(color-mix(in_oklab,var(--primary)_14%,transparent)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]"
        />
        <div className="relative w-full max-w-[420px] animate-in fade-in slide-in-from-bottom-3 duration-500">
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <BrandMark />
            <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">
              Home
            </Link>
          </div>

          <div className="surface-card p-6 sm:p-8">
            <span className="inline-flex items-center gap-1.5 rounded-full border bg-primary-soft px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-accent-foreground">
              <ShieldCheck className="size-3.5" /> Secure workspace
            </span>
            <h1 className="mt-4 text-[1.7rem] font-semibold leading-tight">{title}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>

            {mode !== "forgot" && !sent && (
              <div
                className="mt-6 grid grid-cols-2 rounded-xl bg-muted p-1 text-sm font-medium"
                role="tablist"
              >
                {(["signin", "signup"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={mode === m}
                    onClick={() => switchMode(m)}
                    className={cn(
                      "rounded-lg py-2 transition-all",
                      mode === m
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {m === "signin" ? "Sign in" : "Create account"}
                  </button>
                ))}
              </div>
            )}

            {sent ? (
              <div className="mt-6 flex flex-col items-center rounded-2xl border bg-primary-soft p-6 text-center animate-in fade-in zoom-in-95">
                <span className="grid size-12 place-items-center rounded-full bg-card shadow-card">
                  <MailCheck className="size-6 text-primary" />
                </span>
                <p className="mt-3 text-sm text-accent-foreground">{sent}</p>
              </div>
            ) : mode === "signup" ? (
              <div className="mt-6 rounded-2xl border bg-primary-soft p-6 text-center animate-in fade-in zoom-in-95">
                <span className="mx-auto grid size-12 place-items-center rounded-full bg-card shadow-card">
                  <UserRound className="size-6 text-primary" />
                </span>
                <h2 className="mt-3 text-base font-semibold text-foreground">Accounts are created by an admin</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Ask your Super Admin to add you from the Users page. They will give you an email and password. Then come back here and sign in.
                </p>
                <Button type="button" className="mt-5 h-11 rounded-xl" onClick={() => switchMode("signin")}>
                  <ArrowLeft /> Back to sign in
                </Button>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-6 flex flex-col gap-4" noValidate={false}>
                {formError && (
                  <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive-soft px-3 py-2.5 text-sm text-destructive">
                    {formError}
                  </div>
                )}
                <AuthField label="Email address" htmlFor="email">
                  <IconInput
                    id="email"
                    icon={<Mail />}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@biory.com"
                    required
                    autoComplete="email"
                    inputMode="email"
                  />
                </AuthField>

                {mode !== "forgot" && (
                  <AuthField
                    label="Password"
                    htmlFor="password"
                    aside={
                      mode === "signin" ? (
                        <button
                          type="button"
                          onClick={() => switchMode("forgot")}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          Forgot password?
                        </button>
                      ) : null
                    }
                  >
                    <div className="relative">
                      <IconInput
                        id="password"
                        icon={<Lock />}
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyUp={trackCaps}
                        onKeyDown={trackCaps}
                        onBlur={() => setCapsLock(false)}
                        placeholder="Enter your password"
                        required
                        minLength={8}
                        className="pr-11"
                        autoComplete="current-password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        aria-pressed={showPassword}
                        className="absolute right-1.5 top-1/2 size-8 -translate-y-1/2 text-muted-foreground hover:bg-muted"
                      >
                        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </Button>
                    </div>
                    {capsLock && (
                      <p className="mt-1.5 text-xs font-medium text-warning-foreground">
                        <span className="rounded bg-warning-soft px-1.5 py-0.5">
                          Caps Lock is on
                        </span>
                      </p>
                    )}
                  </AuthField>
                )}

                {mode !== "forgot" && (
                  <label className="flex cursor-pointer select-none items-center gap-2.5 text-sm text-muted-foreground">
                    <Checkbox
                      checked={remember}
                      onCheckedChange={(v) => setRemember(v === true)}
                      className="size-[18px] rounded-[5px]"
                    />
                    Remember me on this device
                  </label>
                )}

                <Button
                  type="submit"
                  disabled={busy !== null}
                  className="group mt-1 h-11 rounded-xl text-[15px] shadow-lift"
                >
                  {busy === "form" ? (
                    <>
                      <Loader2 className="animate-spin" /> Please wait…
                    </>
                  ) : (
                    <>
                      {mode === "signin" ? "Sign in" : "Send reset link"}
                      <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </Button>
              </form>
            )}

            {(mode === "forgot" || sent) && (
              <button
                type="button"
                className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                onClick={() => switchMode("signin")}
              >
                <ArrowLeft className="size-4" /> Back to sign in
              </button>
            )}
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Protected by role-based access and an audited ledger · Times in Asia/Dhaka
          </p>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            <a
              href="https://xactpulse.com/review/index.html"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
            >
              Powered by <span className="font-semibold tracking-wide text-foreground">XactPulse</span>
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}

function BrandPanel() {
  return (
    <aside className="bg-hero relative hidden overflow-hidden p-10 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between xl:p-14">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-highlight/25 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-20 size-[28rem] rounded-full bg-primary/40 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:48px_48px]"
      />

      <div className="relative flex items-center justify-between">
        <Link to="/" className="inline-flex rounded-2xl bg-card px-3 py-2 shadow-card">
          <BrandMark />
        </Link>
        <span className="rounded-full border border-sidebar-border bg-sidebar-accent/60 px-3 py-1 text-xs backdrop-blur">
          Distribution management
        </span>
      </div>

      <div className="relative max-w-lg">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sidebar-primary">
          Field sales · Inventory · Collections
        </p>
        <h2 className="mt-4 text-4xl font-semibold leading-[1.1] text-sidebar-accent-foreground xl:text-5xl">
          Every strip, every taka, accounted for.
        </h2>
        <p className="mt-4 text-sidebar-foreground/80">
          Stock decreases on delivery. Money moves on approval. History never changes.
        </p>

        <ul className="mt-10 grid gap-3 sm:grid-cols-2">
          {HIGHLIGHTS.map((h) => (
            <li
              key={h.title}
              className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm transition-colors hover:bg-white/10"
            >
              <span className="grid size-9 place-items-center rounded-xl bg-sidebar-primary/15 text-sidebar-primary">
                <h.icon className="size-[18px]" />
              </span>
              <div className="mt-3 text-sm font-semibold text-sidebar-accent-foreground">
                {h.title}
              </div>
              <div className="mt-0.5 text-xs text-sidebar-foreground/70">{h.text}</div>
            </li>
          ))}
        </ul>
      </div>

      <div className="relative flex items-center justify-between text-xs text-sidebar-foreground/60">
        <span>© {new Date().getFullYear()} BIORY Corporation</span>
        <span className="inline-flex items-center gap-1.5">
          <Lock className="size-3.5" /> Encrypted connection
        </span>
      </div>
    </aside>
  );
}

function AuthField({
  label,
  htmlFor,
  aside,
  children,
}: {
  label: string;
  htmlFor: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <div className="flex items-center justify-between">
        <label htmlFor={htmlFor} className="font-medium text-foreground">
          {label}
        </label>
        {aside}
      </div>
      {children}
    </div>
  );
}

function IconInput({
  icon,
  className,
  ...props
}: React.ComponentProps<typeof Input> & { icon: ReactNode }) {
  return (
    <div className="group relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary [&_svg]:size-4">
        {icon}
      </span>
      <Input
        className={cn(
          "h-11 rounded-xl bg-card pl-10 shadow-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:border-primary",
          className,
        )}
        {...props}
      />
    </div>
  );
}

