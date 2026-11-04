import { Link, Outlet, useNavigate, useRouterState, type LinkProps } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  BarChart3,
  Bell,
  Boxes,
  ClipboardList,
  FileClock,
  HandCoins,
  LayoutDashboard,
  LogOut,
  Package,
  PackageOpen,
  PackagePlus,
  Pill,
  Receipt,
  Settings,
  SlidersHorizontal,
  ShieldCheck,
  ShoppingCart,
  Stethoscope,
  Store,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
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
import { ROLE_LABELS, useSession, type AppRole } from "@/lib/session";
import { formatDateTime } from "@/lib/format";
import { OfflineProvider, useOffline } from "@/components/app/offline-provider";
import { SyncStatusChip } from "@/components/app/sync-status";
import { clearOfflineCaches } from "@/lib/offline/session-cache";

interface NavItem {
  to: NonNullable<LinkProps["to"]>;
  label: string;
  icon: LucideIcon;
  roles?: AppRole[]; // undefined = everyone with any role
}

const NAV: { group: string; items: NavItem[] }[] = [
  { group: "Overview", items: [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    group: "Sales",
    items: [
      {
        to: "/orders",
        label: "Orders",
        icon: ShoppingCart,
        roles: ["super_admin", "admin", "finance_admin", "warehouse_admin", "sales_officer"],
      },
      { to: "/chemists", label: "Chemists", icon: Store },
      { to: "/doctors", label: "Doctors", icon: UserRound },
      { to: "/visits", label: "Doctor visits", icon: Stethoscope },
    ],
  },
  {
    group: "Inventory",
    items: [
      { to: "/inventory", label: "Stock", icon: Boxes },
      {
        to: "/requisitions",
        label: "Requisitions",
        icon: ClipboardList,
        roles: ["super_admin", "admin", "warehouse_admin", "sales_officer"],
      },
      {
        to: "/inventory/receive",
        label: "Receive stock",
        icon: PackagePlus,
        roles: ["super_admin", "admin", "warehouse_admin"],
      },
      {
        to: "/inventory/opening",
        label: "Opening stock",
        icon: PackageOpen,
        roles: ["super_admin", "admin", "warehouse_admin"],
      },
      {
        to: "/inventory/adjust",
        label: "Stock adjustment",
        icon: SlidersHorizontal,
        roles: ["super_admin", "admin", "warehouse_admin"],
      },
      { to: "/products", label: "Products", icon: Pill },
    ],
  },
  {
    group: "Money",
    items: [
      {
        to: "/wallet",
        label: "Wallet",
        icon: Wallet,
        roles: ["super_admin", "admin", "finance_admin", "sales_officer"],
      },
      {
        to: "/deposits",
        label: "Deposits",
        icon: HandCoins,
        roles: ["super_admin", "admin", "finance_admin", "sales_officer"],
      },
      { to: "/expenses", label: "Expenses", icon: Receipt },
    ],
  },
  {
    group: "Insights",
    items: [{ to: "/reports", label: "Reports", icon: BarChart3 }],
  },
  {
    group: "Administration",
    items: [
      { to: "/users", label: "Users & roles", icon: Users, roles: ["super_admin", "admin"] },
      {
        to: "/settings",
        label: "Pricing & policy",
        icon: Settings,
        roles: ["super_admin", "admin"],
      },
      { to: "/audit", label: "Audit log", icon: FileClock, roles: ["super_admin", "admin"] },
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
          <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/85 px-3 backdrop-blur sm:px-5">
            <SidebarTrigger />
            <div className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
              {session.profile?.so_code && (
                <span className="num mr-2 text-foreground">{session.profile.so_code}</span>
              )}
              {session.roles.map((r) => ROLE_LABELS[r]).join(" · ")}
            </div>
            <SyncStatusChip />
            <NotificationsBell />
            <UserMenu />
          </header>
          <main className="mx-auto w-full max-w-7xl flex-1 px-3 py-6 sm:px-6">
            <Outlet />
          </main>
        </SidebarInset>
      </SidebarProvider>
    </OfflineProvider>
  );
}

function AppSidebar() {
  const session = useSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { setOpenMobile } = useSidebar();
  return (
    <Sidebar collapsible="icon">
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
          const items = g.items.filter((i) => !i.roles || session.has(...i.roles));
          if (!items.length) return null;
          return (
            <SidebarGroup key={g.group}>
              <SidebarGroupLabel>{g.group}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((i) => {
                    const active =
                      i.to === "/inventory"
                        ? pathname === "/inventory" || pathname === "/inventory/ledger"
                        : pathname === i.to || pathname.startsWith(i.to + "/");
                    return (
                      <SidebarMenuItem key={i.to}>
                        <SidebarMenuButton asChild isActive={active} tooltip={i.label}>
                          <Link to={i.to} onClick={() => setOpenMobile(false)}>
                            <i.icon />
                            <span>{i.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-2 px-2 py-1 text-xs text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">
          <ShieldCheck className="size-3.5" /> Ledger-backed · Asia/Dhaka
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function NotificationsBell() {
  const session = useSession();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data = [] } = useQuery({
    queryKey: ["notifications", session.userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    refetchInterval: 60_000,
  });
  const unread = data.filter((n) => !n.read_at).length;
  const markAll = useMutation({
    mutationFn: async () => {
      await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .is("read_at", null);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell />
          {unread > 0 && (
            <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-highlight px-1 text-[10px] font-bold text-highlight-foreground">
              {unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
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
              className="flex w-full flex-col items-start gap-0.5 border-b px-3 py-2 text-left last:border-0 hover:bg-muted"
              onClick={async () => {
                if (!n.read_at) {
                  await supabase
                    .from("notifications")
                    .update({ read_at: new Date().toISOString() })
                    .eq("id", n.id);
                  qc.invalidateQueries({ queryKey: ["notifications"] });
                }
                if (n.link) navigate({ href: n.link });
              }}
            >
              <span
                className={`text-sm ${n.read_at ? "text-muted-foreground" : "font-semibold text-foreground"}`}
              >
                {n.title}
              </span>
              {n.body && (
                <span className="line-clamp-2 text-xs text-muted-foreground">{n.body}</span>
              )}
              <span className="text-[10px] text-muted-foreground">
                {formatDateTime(n.created_at)}
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
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }
  const name = session.profile?.full_name || session.email;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="max-w-44">
          <span className="grid size-5 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
            {name.slice(0, 1).toUpperCase()}
          </span>
          <span className="truncate">{name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="text-sm font-semibold">{name}</div>
          <div className="truncate text-xs text-muted-foreground">{session.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
              await supabase.auth.signOut();
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
