import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  Check,
  Copy,
  Eye,
  EyeOff,
  HandCoins,
  Loader2,
  Lock,
  Mail,
  MailCheck,
  ShieldCheck,
  Sparkles,
  Truck,
  UserRound,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import "@lovable.dev/cloud-auth-js/styles.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/format";
import { clearOfflineCaches } from "@/lib/offline/session-cache";
import { DEMO_EMAIL, DEMO_PASSWORD, demoLoginEnabled, signInAsDemo } from "@/lib/auth/demo";
import {
  getRememberedEmail,
  getRememberPreference,
  sessionShouldEnd,
  setRememberPreference,
} from "@/lib/auth/remember-me";
import logo from "@/assets/biory-logo.png.asset.json";

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
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState<null | "form" | "demo">(null);
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    setRemember(getRememberPreference());
    const saved = getRememberedEmail();
    if (saved) setEmail(saved);

    let cancelled = false;
    (async () => {
      if (sessionShouldEnd()) {
        clearOfflineCaches();
        await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
        return;
      }
      const { data } = await supabase.auth.getUser();
      if (!cancelled && data.user) navigate({ to: "/dashboard", replace: true });
    })();
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
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
    setShowPassword(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy("form");
    try {
      if (mode === "signin") {
        setRememberPreference(remember, email.trim());
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        toast.success("Welcome back");
      } else if (mode === "signup") {
        setRememberPreference(remember, email.trim());
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin + "/dashboard",
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        if (!data.session)
          setSent(
            "Check your email and click the confirmation link to finish creating your account.",
          );
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setSent("If that email has an account, a password reset link is on its way.");
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function demo() {
    setBusy("demo");
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
    try {
      setRememberPreference(remember);
      await signInAsDemo();
      toast.success("Signed in to the demo workspace", {
        description: "Every role and menu is unlocked.",
      });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function oauth(provider: "google" | "lovable") {
    setRememberPreference(remember);
    const result = await lovable.auth.signInWithOAuth(provider, {
      redirect_uri: window.location.origin + "/auth",
    });
    if (result.error) toast.error(errorMessage(result.error));
  }

  function trackCaps(e: React.KeyboardEvent<HTMLInputElement>) {
    setCapsLock(e.getModifierState?.("CapsLock") ?? false);
  }

  const title =
    mode === "signin"
      ? "Welcome back"
      : mode === "signup"
        ? "Create your account"
        : "Reset your password";
  const subtitle =
    mode === "signup"
      ? "New accounts get access once a Super Admin assigns your role."
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
            <img src={logo.url} alt="BIORY Corporation" className="h-10 w-auto" />
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
            ) : (
              <form onSubmit={submit} className="mt-6 flex flex-col gap-4" noValidate={false}>
                {mode === "signup" && (
                  <AuthField label="Full name" htmlFor="full-name">
                    <IconInput
                      id="full-name"
                      icon={<UserRound />}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Your full name"
                      required
                      autoComplete="name"
                    />
                  </AuthField>
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
                        placeholder={
                          mode === "signup" ? "At least 8 characters" : "Enter your password"
                        }
                        required
                        minLength={8}
                        className="pr-11"
                        autoComplete={mode === "signup" ? "new-password" : "current-password"}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        aria-pressed={showPassword}
                        className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                    {capsLock && (
                      <p className="mt-1.5 text-xs font-medium text-warning-foreground">
                        <span className="rounded bg-warning-soft px-1.5 py-0.5">
                          Caps Lock is on
                        </span>
                      </p>
                    )}
                    {mode === "signup" && <PasswordStrength password={password} />}
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
                      {mode === "signin"
                        ? "Sign in"
                        : mode === "signup"
                          ? "Create account"
                          : "Send reset link"}
                      <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </Button>
              </form>
            )}

            {mode !== "forgot" && !sent && (
              <>
                <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wider text-muted-foreground">
                  <span className="h-px flex-1 bg-border" /> or continue with{" "}
                  <span className="h-px flex-1 bg-border" />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 rounded-xl"
                    onClick={() => oauth("google")}
                  >
                    <GoogleIcon /> Google
                  </Button>
                  <button
                    type="button"
                    className="lovable-auth-button !h-11 !w-full !min-w-0 !rounded-xl"
                    onClick={() => oauth("lovable")}
                  >
                    Lovable
                  </button>
                </div>
              </>
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

          {demoLoginEnabled && mode === "signin" && !sent && <DemoCard busy={busy} onDemo={demo} />}

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Protected by role-based access and an audited ledger · Times in Asia/Dhaka
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
        <Link to="/" className="inline-flex rounded-xl bg-card px-3 py-1.5 shadow-card">
          <img src={logo.url} alt="BIORY Corporation" className="h-11 w-auto" />
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

function DemoCard({ busy, onDemo }: { busy: null | "form" | "demo"; onDemo: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked */
    }
  }
  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-highlight/40 bg-gradient-to-br from-warning-soft to-card p-5 shadow-card animate-in fade-in slide-in-from-bottom-2 duration-700">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-highlight text-highlight-foreground shadow-sm">
          <Sparkles className="size-5" />
        </span>
        <div className="min-w-0">
          <div className="font-semibold">Explore the live demo</div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            One click signs you in with every role — Super Admin, Admin, Finance, Warehouse and
            Sales Officer — so all menus and features are unlocked.
          </p>
        </div>
      </div>
      <Button
        type="button"
        variant="highlight"
        className="group mt-4 h-11 w-full rounded-xl text-[15px]"
        disabled={busy !== null}
        onClick={onDemo}
      >
        {busy === "demo" ? (
          <>
            <Loader2 className="animate-spin" /> Opening demo workspace…
          </>
        ) : (
          <>
            Try the demo — full access{" "}
            <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
          </>
        )}
      </Button>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        {(
          [
            ["Email", DEMO_EMAIL],
            ["Password", DEMO_PASSWORD],
          ] as const
        ).map(([label, value]) => (
          <button
            key={label}
            type="button"
            onClick={() => copy(label, value)}
            className="flex min-w-0 items-center justify-between gap-2 rounded-lg border bg-card/70 px-2.5 py-1.5 text-left transition-colors hover:bg-card"
            title={`Copy demo ${label.toLowerCase()}`}
          >
            <span className="min-w-0">
              <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
                {label}
              </span>
              <span className="num block truncate">{value}</span>
            </span>
            {copied === label ? (
              <Check className="size-3.5 shrink-0 text-success" />
            ) : (
              <Copy className="size-3.5 shrink-0 text-muted-foreground" />
            )}
          </button>
        ))}
      </div>
    </div>
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

function PasswordStrength({ password }: { password: string }) {
  const score = useMemo(() => {
    let s = 0;
    if (password.length >= 8) s++;
    if (password.length >= 12) s++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) s++;
    if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) s++;
    return s;
  }, [password]);
  if (!password) return null;
  const labels = ["Too weak", "Weak", "Fair", "Good", "Strong"];
  const colors = ["bg-destructive", "bg-destructive", "bg-warning", "bg-success", "bg-success"];
  return (
    <div className="mt-2">
      <div className="grid grid-cols-4 gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 rounded-full transition-colors",
              i < score ? colors[score] : "bg-muted",
            )}
          />
        ))}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Password strength: <span className="font-medium text-foreground">{labels[score]}</span>
      </p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.11V7.05H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.95l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.96 10.96 0 0 0 12 1 11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}
