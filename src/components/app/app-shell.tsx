import { Link, Outlet, useNavigate, useRouter, useRouterState, type LinkProps } from "@tanstack/react-router";
import { PdfPreviewHost } from "@/components/app/pdf-preview";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  BarChart3,
  Bell,
  Boxes,
  CalendarCheck,
  ClipboardList,
  Camera,
  ChevronDown,
  Clock,
  Database,
  Fingerprint,
  HandCoins,
  LayoutDashboard,
  LogOut,
  Package,
  PackageOpen,
  PackagePlus,
  MapPin,
  Pill,
  Receipt,
  Ruler,
  Settings,
  SlidersHorizontal,
  Shield,
  ScrollText,
  ShoppingCart,
  Stethoscope,
  Store,
  Tag,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api } from "@/lib/api/client";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { menuAllowed } from "@/lib/access";
import type { ReportKey } from "@/routes/_authenticated/reports";
import { ROLE_LABELS, useSession } from "@/lib/session";
import { errorMessage, formatDateTime } from "@/lib/format";
import { OfflineProvider, useOffline } from "@/components/app/offline-provider";
import { ProfilePhoto } from "@/components/app/profile-photo";
import { SyncStatusChip } from "@/components/app/sync-status";
import { clearOfflineCaches } from "@/lib/offline/session-cache";
import { useIsTablet } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface NavChild {
  to: "/chemists" | "/doctors" | "/sales-officers" | "/territories" | "/master/$kind" | "/reports" | "/wallet" | "/wallet/ledger" | "/products" | "/attendance" | "/attendance/history" | "/settings";
  kind?: "pack-size" | "expense-categories" | "uom" | "strength" | "generic-name";
  report?: ReportKey;
  gate?: "money" | "stock";
  exact?: boolean;
  menuKey?: string;
  label: string;
  icon: LucideIcon;
}

interface NavItem {
  to?: NonNullable<LinkProps["to"]>;
  label: string;
  icon: LucideIcon;
  children?: NavChild[];
}

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/orders", label: "Orders", icon: ShoppingCart },
      { to: "/visits", label: "Doctor visits", icon: Stethoscope },
      { to: "/inventory/opening", label: "Opening stock", icon: PackageOpen },
      { to: "/inventory/adjust", label: "Stock adjustment", icon: SlidersHorizontal },
      { to: "/requisitions", label: "Requisitions", icon: ClipboardList },
      { to: "/inventory/receive", label: "Receive stock", icon: PackagePlus },
      { to: "/inventory", label: "Stock", icon: Boxes },
      {
        label: "Attendance",
        icon: Fingerprint,
        children: [
          { to: "/attendance", label: "Punch in / out", icon: Clock, exact: true, menuKey: "/attendance" },
          { to: "/attendance/history", label: "Attendance history", icon: CalendarCheck, menuKey: "/attendance/history" },
        ],
      },
      {
        label: "Wallet",
        icon: Wallet,
        children: [
          { to: "/wallet", label: "By SO", icon: Users, exact: true, menuKey: "/wallet" },
          { to: "/wallet/ledger", label: "Ledger", icon: ScrollText, menuKey: "/wallet" },
        ],
      },
      { to: "/deposits", label: "Deposits", icon: HandCoins },
      { to: "/expenses", label: "Expenses", icon: Receipt },
      {
        label: "Master data",
        icon: Database,
        children: [
          { to: "/products", label: "Products", icon: Pill },
          { to: "/chemists", label: "Chemists", icon: Store },
          { to: "/doctors", label: "Doctors", icon: UserRound },
          { to: "/sales-officers", label: "Sales officers", icon: Users },
          { to: "/territories", label: "Territories", icon: MapPin },
          { to: "/settings", label: "Pricing & policy", icon: Settings },
          { to: "/master/$kind", kind: "pack-size", label: "Pack size", icon: Package },
          { to: "/master/$kind", kind: "expense-categories", label: "Expense categories", icon: Receipt },
          { to: "/master/$kind", kind: "uom", label: "Product UOM", icon: Ruler },
          { to: "/master/$kind", kind: "strength", label: "Strength", icon: Tag },
          { to: "/master/$kind", kind: "generic-name", label: "Generic name", icon: Pill },
        ],
      },
      {
        label: "Reports",
        icon: BarChart3,
        children: [
        { to: "/reports", report: "outstanding", label: "Outstanding & ageing", icon: HandCoins, gate: "money" },
        { to: "/reports", report: "so", label: "SO performance", icon: Users, gate: "money" },
        { to: "/reports", report: "product", label: "Product sales", icon: Pill, gate: "money" },
        { to: "/reports", report: "collections", label: "Collections", icon: Wallet, gate: "money" },
        { to: "/reports", report: "discounts", label: "Discounts", icon: Tag, gate: "money" },
        { to: "/reports", report: "stocklist", label: "Stock report", icon: Boxes, gate: "stock" },
        { to: "/reports", report: "batchstock", label: "Batch wise stock", icon: Package, gate: "stock" },
        { to: "/reports", report: "stock", label: "Re-order level", icon: SlidersHorizontal, gate: "stock" },
        { to: "/reports", report: "expiry", label: "Near expiry", icon: PackageOpen, gate: "stock" },
        { to: "/reports", report: "promo", label: "Promotional usage", icon: Stethoscope, gate: "stock" },
        { to: "/reports", report: "issue", label: "Item wise issue", icon: ClipboardList, gate: "stock" },
        { to: "/reports", report: "receive", label: "Item wise receive", icon: PackagePlus, gate: "stock" },
        { to: "/reports", report: "itemstock", label: "Item stock", icon: Boxes, gate: "stock" },
        ],
      },
      { to: "/users", label: "Users", icon: Users },
      { to: "/role-access", label: "Role access", icon: Shield },
    ],
  },
];

export function AppShell() {
  const session = useSession();
  if (session.roles.length === 0) return <AwaitingAccess />;
  return (
    <OfflineProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="bg-background">
          <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/85 px-2 backdrop-blur sm:gap-3 sm:px-5">
            <SidebarTrigger />
            <div className="min-w-0 flex-1 truncate text-xs text-muted-foreground sm:text-sm">
              {session.profile?.so_code && (
                <span className="num mr-2 text-foreground">{session.profile.so_code}</span>
              )}
              <span className="hidden min-[420px]:inline">{session.roles.map((r) => ROLE_LABELS[r]).join(" · ")}</span>
            </div>
            <SyncStatusChip />
            <NotificationsBell />
            <UserMenu />
          </header>
          <main className="w-full flex-1 px-4 py-4 sm:px-5">
            <Outlet />
          </main>
          <PdfPreviewHost />
        </SidebarInset>
      </SidebarProvider>
    </OfflineProvider>
  );
}

function AppSidebar() {
  const session = useSession();
  const tablet = useIsTablet();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const report = useRouterState({ select: (s) => {
    const search = s.location.search as { report?: string };
    return typeof search?.report === "string" ? search.report : "outstanding";
  } });
  const { setOpenMobile } = useSidebar();
  return (
    <Sidebar collapsible={tablet ? "offcanvas" : "icon"}>
      <SidebarHeader>
        <Link to="/dashboard" className="flex items-center gap-2 px-2 py-1.5">
          <img
            src="/icons/icon-192.png"
            alt=""
            className="size-8 shrink-0 rounded-lg bg-card object-contain p-0.5"
          />
          <span className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="font-display text-base font-semibold text-sidebar-accent-foreground">
              BIORY
            </span>
            <span className="text-[11px] text-sidebar-foreground/70">Corporation</span>
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {NAV.map((g) => {
          const items = g.items
            .map((item) => {
              if (!item.children) return menuAllowed(item.to ?? "/dashboard", session.roles, session.menus) ? item : null;
              const children = item.children.filter((child) => {
                const key = child.menuKey ?? (child.report ? `report:${child.report}` : childPath(child));
                return menuAllowed(key, session.roles, session.menus);
              });
              return children.length ? { ...item, children } : null;
            })
            .filter((item): item is NavItem => !!item);
          if (!items.length) return null;
          return (
            <SidebarGroup key={g.group} className="px-3 py-1">
              {g.group ? (
                <SidebarGroupLabel className="h-6 px-3 text-[11px] font-medium uppercase tracking-[0.14em] text-sidebar-foreground/40">
                  {g.group}
                </SidebarGroupLabel>
              ) : null}
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">
                  {items.map((i) =>
                    i.children ? (
                      <MasterMenu key={i.label} item={i} pathname={pathname} report={report} onNavigate={() => setOpenMobile(false)} />
                    ) : (
                      <SidebarMenuItem key={i.to}>
                        <SidebarMenuButton asChild isActive={isItemActive(i.to ?? "", pathname)} tooltip={i.label}>
                          <Link to={i.to ?? "/dashboard"} onClick={() => setOpenMobile(false)}>
                            <i.icon />
                            <span>{i.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ),
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
    </Sidebar>
  );
}

function childPath(child: NavChild) {
  return child.to === "/master/$kind" ? `/master/${child.kind}` : child.to;
}

function childActive(child: NavChild, pathname: string, report: string) {
  if (child.report) return pathname === "/reports" && report === child.report;
  const path = childPath(child);
  if (child.exact) return pathname === path || pathname === `${path}/`;
  return pathname === path || pathname.startsWith(`${path}/`);
}

function isItemActive(to: string, pathname: string) {
  if (to === "/inventory") return pathname === "/inventory" || pathname === "/inventory/ledger";
  return pathname === to || pathname.startsWith(`${to}/`);
}

function MasterMenu({ item, pathname, report, onNavigate }: { item: NavItem; pathname: string; report: string; onNavigate: () => void }) {
  const { setOpen, state } = useSidebar();
  const children = item.children ?? [];
  const active = children.some((child) => childActive(child, pathname, report));
  const [open, setMenuOpen] = useState(active);
  useEffect(() => {
    if (active) setMenuOpen(true);
  }, [active]);
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        tooltip={item.label}
        onClick={() => {
          if (state === "collapsed") setOpen(true);
          setMenuOpen((value) => !value);
        }}
      >
        <item.icon />
        <span>{item.label}</span>
        <ChevronDown className={`ml-auto size-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </SidebarMenuButton>
      {open && (
        <SidebarMenuSub>
          {children.map((child) => {
            const path = childPath(child);
            const on = childActive(child, pathname, report);
            const className = "h-10 min-w-0 rounded-full text-white/80 hover:bg-[linear-gradient(90deg,oklch(1_0_0_/_0.08),transparent)] hover:text-white data-[active=true]:bg-[linear-gradient(90deg,#31885f_0%,#1c6b54_40%,transparent_100%)] data-[active=true]:text-white lg:h-8";
            return (
              <SidebarMenuSubItem key={`${path}:${child.report ?? child.kind ?? child.label}`}>
                <SidebarMenuSubButton asChild isActive={on} className={className}>
                  {child.to === "/master/$kind" ? (
                    <Link to="/master/$kind" params={{ kind: child.kind ?? "uom" }} onClick={onNavigate}>
                      <child.icon />
                      <span>{child.label}</span>
                    </Link>
                  ) : child.report ? (
                    <Link to="/reports" search={{ report: child.report }} onClick={onNavigate}>
                      <child.icon />
                      <span>{child.label}</span>
                    </Link>
                  ) : (
                    <Link to={child.to} onClick={onNavigate} {...(child.exact ? { activeOptions: { exact: true } } : {})}>
                      <child.icon />
                      <span>{child.label}</span>
                    </Link>
                  )}
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            );
          })}
        </SidebarMenuSub>
      )}
    </SidebarMenuItem>
  );
}

function NotificationsBell() {
  const session = useSession();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { data = [] } = useQuery({
    queryKey: ["notifications", session.userId],
    queryFn: async () => {
      const { data, error } = await api
        .from("notifications")
        .select("id, title, body, link, read_at, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    refetchInterval: 30_000,
  });
  const unread = data.filter((n) => !n.read_at).length;
  const markAll = useMutation({
    mutationFn: async () => {
      const { error } = await api
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
    onError: (e) => toast.error(errorMessage(e)),
  });

  async function openNotice(n: (typeof data)[number]) {
    setOpen(false);
    if (!n.read_at) {
      const { error } = await api.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
      if (error) toast.error(errorMessage(error));
      else qc.invalidateQueries({ queryKey: ["notifications"] });
    }
    if (n.link) navigate({ href: n.link });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={unread ? `${unread} unread notifications` : "Notifications"}>
          <Bell />
          {unread > 0 && (
            <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-highlight px-1 text-[10px] font-bold text-highlight-foreground">
              {unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(20rem,calc(100vw-1rem))] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 && (
            <button
              className="text-xs text-primary hover:underline"
              onClick={() => markAll.mutate()}
            >
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {data.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">You're all caught up.</p>
          )}
          {data.map((n) => (
            <button
              key={n.id}
              className="flex w-full items-start gap-2 border-b px-3 py-2 text-left last:border-0 hover:bg-muted"
              onClick={() => void openNotice(n)}
            >
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-primary"}`} />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className={`text-sm ${n.read_at ? "text-muted-foreground" : "font-semibold text-foreground"}`}>
                  {n.title}
                </span>
                {n.body && (
                  <span className="line-clamp-2 text-xs text-muted-foreground">{n.body}</span>
                )}
                <span className="text-[10px] text-muted-foreground">
                  {formatDateTime(n.created_at)}
                </span>
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function UserMenu() {
  const session = useSession();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { queue } = useOffline();
  const [profileOpen, setProfileOpen] = useState(false);
  async function signOut() {
    if (
      queue.length > 0 &&
      !window.confirm(
        `${queue.length} order(s) haven't synced yet. They stay on this device and sync the next time you sign in here. Sign out anyway?`,
      )
    )
      return;
    await qc.cancelQueries();
    qc.clear();
    clearOfflineCaches();
    await api.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }
  const name = session.profile?.full_name || session.email;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="max-w-44 gap-2 px-1.5 sm:px-3">
            <ProfilePhoto path={session.profile?.avatar_path} name={name} className="size-7" />
            <span className="hidden truncate sm:inline">{name}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <div className="flex items-center gap-2">
              <ProfilePhoto path={session.profile?.avatar_path} name={name} className="size-9" />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{name}</div>
                <div className="truncate text-xs text-muted-foreground">{session.email}</div>
              </div>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setProfileOpen(true)}>
            <UserRound /> Profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={signOut}>
            <LogOut /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </>
  );
}

function ProfileDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const session = useSession();
  const qc = useQueryClient();
  const router = useRouter();
  const name = session.profile?.full_name || session.email;
  const save = useMutation({
    mutationFn: async (file: File | null) => {
      let path: string | null = null;
      if (file) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
          throw new Error("Use a JPG, PNG or WEBP photo");
        }
        if (file.size > 4 * 1024 * 1024) throw new Error("Photo must be 4 MB or smaller");
        const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
        path = `${session.userId}/${crypto.randomUUID()}.${ext}`;
        const { error } = await api.storage.from("profile-photos").upload(path, file, { contentType: file.type });
        if (error) throw error;
      }
      const { error } = await api.rpc("set_profile_photo", { p_path: path });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Profile photo saved");
      await qc.invalidateQueries({ queryKey: ["profile-photo"] });
      await qc.invalidateQueries({ queryKey: ["user-accounts"] });
      await qc.invalidateQueries({ queryKey: ["sales-officers"] });
      await qc.invalidateQueries({ queryKey: ["profiles"] });
      await router.invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="mx-auto w-[calc(100%-1.5rem)] max-w-md">
        <DialogHeader>
          <DialogTitle>Profile</DialogTitle>
          <DialogDescription>Your photo shows here, on Users, and on the attendance list.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
          <ProfilePhoto path={session.profile?.avatar_path} name={name} className="size-20 text-lg" />
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <div className="font-semibold">{name}</div>
            <div className="truncate text-sm text-muted-foreground">{session.email}</div>
            {session.profile?.so_code && <div className="num text-xs text-muted-foreground">{session.profile.so_code}</div>}
            <div className="mt-1 text-xs text-muted-foreground">{session.roles.map((r) => ROLE_LABELS[r]).join(" · ")}</div>
            <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
              <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:brightness-110">
                <Camera className="size-4" />
                {save.isPending ? "Saving…" : "Choose photo"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  disabled={save.isPending}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) save.mutate(file);
                  }}
                />
              </label>
              {session.profile?.avatar_path && (
                <Button type="button" variant="outline" disabled={save.isPending} onClick={() => save.mutate(null)}>
                  Remove
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AwaitingAccess() {
  const session = useSession();
  const qc = useQueryClient();
  const navigate = useNavigate();
  return (
    <div className="grid min-h-screen place-items-center bg-background p-6">
      <div className="surface-card max-w-md p-8 text-center">
        <Package className="mx-auto size-10 text-primary" />
        <h1 className="mt-4 text-xl font-semibold">Waiting for access</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You're signed in as <span className="font-medium text-foreground">{session.email}</span>.
          A Super Admin needs to assign your role (for example Sales Officer or Warehouse Admin)
          before you can use BIORY Corporation.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button variant="outline" onClick={() => window.location.reload()}>
            Check again
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              qc.clear();
              clearOfflineCaches();
              await api.auth.signOut();
              navigate({ to: "/auth", replace: true });
            }}
          >
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
