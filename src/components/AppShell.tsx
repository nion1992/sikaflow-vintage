import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { useBusiness } from "@/hooks/use-business";
import { useUsage } from "@/hooks/use-usage";
import UpgradeDialog from "@/components/UpgradeDialog";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.svg";
import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  BarChart3,
  BellRing,
  BookOpen,
  BookUser,
  Boxes,
  ChevronDown,
  Download,
  FileText,
  Home,
  LayoutDashboard,
  Loader2,
  LogOut,
  ReceiptText,
  Settings,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { Link, NavLink, useNavigate, useLocation } from "react-router";
import { useEffect, useRef, useState, createContext, useContext, ReactNode } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";

interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  exact?: boolean;
}

const PRIMARY_NAV: NavItem[] = [
  { label: "Overview", to: "/dashboard", icon: LayoutDashboard, exact: true },
  { label: "Guide", to: "/guide", icon: BookOpen },
  { label: "Follow-ups", to: "/follow-ups", icon: BellRing },
  { label: "Customers", to: "/customers", icon: BookUser },
  { label: "Items", to: "/products", icon: Boxes },
  { label: "Quotes", to: "/quotes", icon: FileText },
  { label: "Invoices", to: "/invoices", icon: ReceiptText },
  { label: "Payments", to: "/payments", icon: Banknote },
  { label: "Reports", to: "/reports", icon: BarChart3 },
  { label: "Settings", to: "/settings", icon: Settings },
];

const MOBILE_NAV: NavItem[] = [
  { label: "Home", to: "/dashboard", icon: Home, exact: true },
  { label: "Chasing", to: "/follow-ups", icon: BellRing },
  { label: "Quotes", to: "/quotes", icon: FileText },
  { label: "Invoices", to: "/invoices", icon: ReceiptText },
  { label: "More", to: "/settings", icon: Settings },
];

const APP_VERSION = "v1 · Phase 16 · Launch";

/** Shared page-transition key so the outlet wrapper can animate between views. */
interface RouteContextValue {
  routeKey: string;
}
const RouteContext = createContext<RouteContextValue | null>(null);

function useRouteContext(): RouteContextValue {
  const ctx = useContext(RouteContext);
  if (!ctx) throw new Error("useRouteContext must be used within RouteProvider");
  return ctx;
}

/** Desktop navigation: static active indicator (animations removed). */
function PrimaryNav() {
  const { routeKey } = useRouteContext();
  // Derive the pill position from the route instead of syncing state in an
  // effect. The prefix match keeps sub-routes (e.g. /invoices/:id) on the
  // right item; unknown routes fall back to the first entry.
  const matchedIndex = PRIMARY_NAV.findIndex(
    (item) =>
      routeKey === item.to ||
      (!item.exact && routeKey.startsWith(`${item.to}/`)),
  );
  const activeIndex = matchedIndex >= 0 ? matchedIndex : 0;

  return (
    <div className="flex flex-col gap-0.5" aria-label="Primary">
      <div className="relative flex flex-col gap-0.5">
        {PRIMARY_NAV.map((item) => {
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground/80 hover:bg-accent hover:text-accent-foreground",
                )
              }
              onClick={() => {}}
            >
              <item.icon className="size-4" />
              {item.label}
            </NavLink>
          );
        })}
      </div>

      {/* Active indicator — static, no sliding (animations removed). */}
      <div className="absolute top-0 left-0 bottom-0 w-px bg-primary/60">
        {(() => {
          const item = PRIMARY_NAV[activeIndex];
          const left = item ? item.to.length * 7 + 40 : 0;
          return (
            <div
              className="absolute top-0 h-full bg-primary/70 shadow-sm"
              style={{ left, width: item ? item.to.length * 7 + 44 : 0 }}
            />
          );
        })()}
      </div>
    </div>
  );
}

/** Route-keyed wrapper — renders instantly (animations removed). */
function PageTransition({ children }: { children: ReactNode }) {
  const { routeKey } = useRouteContext();

  return <div key={routeKey}>{children}</div>;
}

/** Mini connectivity/connection status chip shown in the mobile top bar. */
function ConnectionChip() {
  const isOnline = useOnlineStatus();
  return (
    <span
      className={"hidden items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-muted-foreground sm:flex"}
      title={isOnline ? "Connected" : "Offline"}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${isOnline ? "bg-emerald-500" : "bg-destructive"}`}
        style={isOnline ? undefined : { animation: "none" }}
      />
      {isOnline ? "Online" : "Offline"}
    </span>
  );
}

/** Glass-styled avatar pill with the user's initial and online dot. */
function AvatarPill() {
  const { user } = useAuth();
  const online = useOnlineStatus();
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/60 bg-glass/60 px-1.5 py-1">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 font-serif text-sm font-bold text-primary">
        {(user?.name ?? "S").charAt(0).toUpperCase()}
      </div>
      <div className="hidden min-w-0 flex-1 text-xs font-medium text-muted-foreground sm:block">
        {user?.name || "Owner"}
      </div>
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${online ? "bg-emerald-400" : "bg-border"}`}
        style={{ animation: online ? undefined : "none" }}
      />
    </div>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut, isAuthenticated } = useAuth();
  const { business, subscription, isLoading: businessLoading } = useBusiness();
  const { plan, used, limit, canCreate } = useUsage();
  const navigate = useNavigate();
  const location = useLocation();
  const isOnline = useOnlineStatus();
  const onboardingRedirectedRef = useRef(false);
  const { canInstall, install } = usePwaInstall();
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  // Sync the route key with the current URL so the sidebar indicator
  // and page transition always reflect the active view.
  const routeKey = location.pathname;

  const needsOnboarding =
    !businessLoading && isAuthenticated && business === null;

  // Redirect to onboarding exactly once. Without the ref gate this
  // effect would re-fire on every location change (navigate updates
  // location state, which re-renders, which re-runs the effect), an
  // infinite loop that React's render cap aborts with the "Too many
  // re-renders" error.
  // The ref is the guard: it also protects us from a lingering fetch
  // that keeps `needsOnboarding` true after the redirect (e.g. a
  // business that resolves to `null`), because we only gate on whether
  // we've *already* navigated, not on the constantly-flipping
  // `needsOnboarding` boolean.
  useEffect(() => {
    if (onboardingRedirectedRef.current) return;
    if (needsOnboarding) {
      onboardingRedirectedRef.current = true;
      navigate("/onboarding", { replace: true });
    }
  }, [needsOnboarding, navigate]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  // Every page inside this shell queries business data, and those queries throw
  // ("No active business found") for a caller who has none — so a page must not
  // render until the business query has resolved *and* returned a business.
  // Rendering during the loading window crashes the app on the very first
  // sign-in; when there is genuinely no business we spin while the effect above
  // redirects to /onboarding.
  if (businessLoading || needsOnboarding) {
    return (
      <div className="flex min-h-screen items-center justify-center paper-texture">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <RouteContext.Provider value={{ routeKey }}>
      <div className="min-h-screen paper-texture">
        {/* Offline banner */}
        {!isOnline && (
          <div
            className="banner-in no-print sticky top-0 z-50 border-b border-destructive/30 bg-destructive/10 px-4 py-1.5 text-center text-xs font-medium text-destructive"
            role="alert"
          >
            You're offline — changes may not save until you reconnect.
          </div>
        )}

        {/* Mobile top bar */}
        <header className="no-print sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-glass/70 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-glass/85 lg:hidden">
          <Link
            to="/dashboard"
            className="flex items-center gap-2"
            aria-label="SikaFlow home"
          >
            <img src={logo} alt="" className="size-8 rounded-md" />
            <span className="font-serif text-lg font-bold tracking-wide">
              SikaFlow
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <ConnectionChip />
            <ThemeToggle />
            <AvatarPill />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Account menu">
                  <ChevronDown className="size-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-serif">
                  {business?.name || user?.name || "Business owner"}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/settings")}>
                  <Settings className="mr-2 size-4" /> Business settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setUpgradeOpen(true)}>
                  <Sparkles className="mr-2 size-4" /> Plans &amp; usage
                </DropdownMenuItem>
                {canInstall && (
                  <DropdownMenuItem onClick={install}>
                    <Smartphone className="mr-2 size-4" /> Install app
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 size-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Desktop sidebar + main */}
        <div className="mx-auto flex w-full max-w-7xl">
          <aside className="glass sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r px-3 py-6 backdrop-blur-md lg:flex">
            <Link
              to="/dashboard"
              className="mb-6 flex items-center gap-2 px-2"
              aria-label="SikaFlow home"
            >
              <img src={logo} alt="" className="size-9 rounded-md shadow-sm" />
              <div className="min-w-0">
                <div className="font-serif text-xl font-bold tracking-wide text-foreground/90">
                  SikaFlow
                </div>
                <div className="ledger-label truncate text-muted-foreground">
                  {business?.name ?? "Ledger & Quotes"}
                </div>
              </div>
            </Link>

            <PrimaryNav />

            <div className="mt-auto space-y-3">
              {canInstall && (
                <button
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md border border-border/60 bg-glass/40 p-2 text-left transition-colors hover:border-primary/40 hover:bg-glass/60"
                  onClick={install}
                  aria-label="Install SikaFlow on this device"
                >
                  <Download className="size-4 shrink-0 text-primary" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground/90">
                      Install SikaFlow
                    </span>
                    <span className="ledger-label block truncate text-muted-foreground">
                      Like a native app on your phone
                    </span>
                  </span>
                </button>
              )}
              {plan === "free" && limit !== null && (
                <button
                  className="w-full rounded-md border border-border/60 bg-glass/40 p-2 text-left transition-colors hover:border-primary/40 hover:bg-glass/60"
                  onClick={() => setUpgradeOpen(true)}
                  aria-label="View plans and usage"
                >
                  <div className="flex items-center justify-between">
                    <span className="ledger-label text-muted-foreground">
                      Free plan
                    </span>
                    <span
                      className={`font-mono text-xs font-semibold ${
                        canCreate
                          ? used !== null && limit - used <= 1
                            ? "text-amber-500"
                            : ""
                          : "text-destructive"
                      }`}
                    >
                      {used}/{limit} docs
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${
                        canCreate ? "bg-primary" : "bg-destructive"
                      }`}
                      style={{
                        width: `${Math.min(
                          100,
                          ((used ?? 0) / (limit || 1)) * 100,
                        )}%`,
                      }}
                    />
                  </div>
                  {!canCreate && (
                    <span className="mt-1.5 block text-[11px] font-medium text-destructive">
                      Monthly limit reached — tap to upgrade
                    </span>
                  )}
                </button>
              )}
              <div className="flex items-center gap-2 rounded-md border border-border/60 bg-glass/40 px-2 py-2">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 font-serif text-sm font-bold text-primary">
                  {(user?.name ?? "S").charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground/90">
                    {user?.name || "Owner"}
                  </div>
                  <div className="ledger-label text-muted-foreground">
                    {subscription
                      ? subscription.plan === "free"
                        ? "Free plan"
                        : `${subscription.plan} plan`
                      : "Free plan"}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Sign out"
                  onClick={handleSignOut}
                >
                  <LogOut className="size-4" />
                </Button>
              </div>
              <div className="ledger-label text-center text-muted-foreground/70">
                {APP_VERSION}
              </div>
            </div>
          </aside>

          <main className="min-h-screen flex-1 px-4 pb-24 pt-6 lg:pb-10 lg:pl-8 lg:pr-8">
            <RouteContext.Provider value={{ routeKey }}>
              <PageTransition>
                <div className="mx-auto max-w-4xl">{children}</div>
              </PageTransition>
            </RouteContext.Provider>
          </main>
        </div>

        {/* Mobile bottom nav */}
        <nav
          className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/85 lg:hidden"
          aria-label="Mobile"
        >
          <div className="mx-auto grid max-w-md grid-cols-5">
            {MOBILE_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.exact}
                className={({ isActive }) =>
                  cn(
                    "flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground",
                  )
                }
              >
                <item.icon className="size-5" />
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>

        <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} />
      </div>
    </RouteContext.Provider>
  );
}
