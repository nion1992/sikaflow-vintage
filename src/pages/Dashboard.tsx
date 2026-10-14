import AppShell from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { useBusiness } from "@/hooks/use-business";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { formatMoney } from "@/lib/money";
import {
  ArrowRight,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  ReceiptText,
  Banknote,
  Lightbulb,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { Link } from "react-router";
import { useMemo } from "react";

function trendArrow(direction: "up" | "down" | "flat") {
  if (direction === "up") return <ArrowUpRight className="size-4 text-emerald-400" />;
  if (direction === "down") return <ArrowDownRight className="size-4 text-red-400" />;
  return <TrendingUp className="size-4 text-muted-foreground/60" />;
}

/** Derive a suggestion from the current ledger state. */
function deriveSuggestions(
  quotesData: { quotes?: Array<{ status: string; documentNumber: string; customerName: string; expiryDate: number; _id: string }>; total?: number; counts?: Record<string, number> } | undefined,
  invoicesData: { invoices?: Array<{ status: string; documentNumber: string; customerName: string; dueDate: number; grandTotalCents: number; amountPaidCents: number; _id: string }>; total?: number; counts?: Record<string, number> } | undefined,
  reportsData: { invoices?: { outstandingCount?: number; overdueCount?: number; overdueCents?: number }; quotes?: { quoteCounts?: { sent?: number; draft?: number } }; payments?: { collectedCount?: number } } | undefined,
) {
  const suggestions: Array<{ icon: typeof Lightbulb; label: string; detail: string; href?: string }> = [];

  if (!quotesData || !invoicesData || !reportsData) return suggestions;

  const { quoteCounts } = reportsData.quotes || {};
  const { outstandingCount = 0, overdueCount = 0 } = reportsData.invoices || {};
  const { collectedCount = 0 } = reportsData.payments || {};
  const sentQuotes = quoteCounts?.sent || 0;

  // Suggestion: follow up on sent quotes
  if (sentQuotes > 0) {
    suggestions.push({
      icon: Lightbulb,
      label: "Follow up on sent quotes",
      detail: `${sentQuotes} quotation${sentQuotes > 1 ? "s" : ""} sent and waiting for a reply. A quick nudge can turn them into accepted work.`,
      href: "/follow-ups",
    });
  }

  // Suggestion: chase overdue invoices
  if (overdueCount > 0) {
    suggestions.push({
      icon: AlertCircle,
      label: "Overdue invoices need attention",
      detail: `${overdueCount} invoice${overdueCount > 1 ? "s" : ""} are past due — ${formatMoney(reportsData.invoices?.overdueCents || 0, { compact: true })} still owed.`,
      href: "/invoices",
    });
  }

  // Suggestion: outstanding but not overdue
  const outstanding = outstandingCount - overdueCount;
  if (outstanding > 0) {
    suggestions.push({
      icon: Clock,
      label: "Upcoming due dates",
      detail: `${outstanding} invoice${outstanding > 1 ? "s" : ""} are outstanding but not yet overdue. Check who is due soon.`,
      href: "/invoices",
    });
  }

  // Suggestion: payment recording
  const invoicedCount = invoicesData.invoices?.length || 0;
  if (collectedCount === 0 && invoicedCount > 0) {
    suggestions.push({
      icon: Banknote,
      label: "Record your first payment",
      detail: "You've issued invoices but haven't recorded a payment yet. Tap + on any invoice to log cash, MoMo or bank transfer.",
      href: "/payments",
    });
  }

  // Suggestion: convert quotes
  const draftInvoices = invoicesData.invoices?.filter((i: { status: string }) => i.status === "draft").length || 0;
  if (draftInvoices > 0) {
    suggestions.push({
      icon: FileText,
      label: "Finish your draft invoices",
      detail: `${draftInvoices} invoice${draftInvoices > 1 ? "s" : ""} are still in draft. Complete and send them to start the payment clock.`,
      href: "/invoices",
    });
  }

  return suggestions;
}

/** Quick reminders derived from document conditions. */
function deriveReminders(
  quotesData: { quotes?: Array<{ status: string; documentNumber: string; customerName: string; expiryDate: number; _id: string }> } | undefined,
  invoicesData: { invoices?: Array<{ status: string; documentNumber: string; customerName: string; dueDate: number; grandTotalCents: number; amountPaidCents: number; _id: string }> } | undefined,
) {
  const reminders: Array<{ icon: typeof Clock; label: string; detail: string; href?: string }> = [];

  if (!quotesData || !invoicesData) return reminders;

  const now = Date.now();
  const MS_PER_DAY = 86_400_000;

  // Quotes expiring soon
  const expiringQuotes = quotesData.quotes
    ?.filter((q) => q.status === "sent" && q.expiryDate - now < 3 * MS_PER_DAY && q.expiryDate > now)
    .slice(0, 3) || [];

  for (const q of expiringQuotes) {
    const daysLeft = Math.ceil((q.expiryDate - now) / MS_PER_DAY);
    reminders.push({
      icon: Clock,
      label: `Quote ${q.documentNumber} expires in ${daysLeft} day${daysLeft > 1 ? "s" : ""}`,
      detail: `Sent to ${q.customerName} — follow up before it expires.`,
      href: `/quotes/${q._id}`,
    });
  }

  // Invoices due soon
  const dueSoonInvoices = invoicesData.invoices
    ?.filter((i) => i.status === "sent" && i.dueDate - now < 7 * MS_PER_DAY && i.dueDate > now)
    .slice(0, 3) || [];

  for (const inv of dueSoonInvoices) {
    const daysLeft = Math.ceil((inv.dueDate - now) / MS_PER_DAY);
    reminders.push({
      icon: Clock,
      label: `Invoice ${inv.documentNumber} due in ${daysLeft} day${daysLeft > 1 ? "s" : ""}`,
      detail: `${inv.customerName} · ${formatMoney(inv.grandTotalCents - inv.amountPaidCents, { compact: true })} remaining.`,
      href: `/invoices/${inv._id}`,
    });
  }

  // Overdue invoices
  const overdueInvoices = invoicesData.invoices
    ?.filter((i) => i.status === "overdue")
    .slice(0, 3) || [];

  for (const inv of overdueInvoices) {
    const daysOverdue = Math.ceil((now - inv.dueDate) / MS_PER_DAY);
    reminders.push({
      icon: AlertCircle,
      label: `Invoice ${inv.documentNumber} is ${daysOverdue} day${daysOverdue > 1 ? "s" : ""} overdue`,
      detail: `${inv.customerName} · ${formatMoney(inv.grandTotalCents - inv.amountPaidCents, { compact: true })} still owed.`,
      href: `/invoices/${inv._id}`,
    });
  }

  return reminders;
}

/** Trend data for the overview chart. */
function buildTrends(reportsData: { monthly?: Array<{ label: string; invoicedCents: number; collectedCents: number }> } | undefined) {
  if (!reportsData?.monthly || reportsData.monthly.length === 0) {
    return {
      labels: [],
      invoiced: [],
      collected: [],
      latestGrowth: "flat" as const,
      latestInvoiced: 0,
      latestCollected: 0,
    };
  }

  const recent = reportsData.monthly.slice(-6);
  const labels = recent.map((m) => m.label);
  const invoiced = recent.map((m) => m.invoicedCents);
  const collected = recent.map((m) => m.collectedCents);

  // Growth: compare latest month to previous
  let latestGrowth: "up" | "down" | "flat" = "flat";
  if (recent.length >= 2) {
    const prev = recent[recent.length - 2].invoicedCents;
    const curr = recent[recent.length - 1].invoicedCents;
    if (curr > prev) latestGrowth = "up";
    else if (curr < prev) latestGrowth = "down";
  }

  return {
    labels,
    invoiced,
    collected,
    latestGrowth,
    latestInvoiced: recent[recent.length - 1]?.invoicedCents ?? 0,
    latestCollected: recent[recent.length - 1]?.collectedCents ?? 0,
  };
}

export default function Dashboard() {
  const { user } = useAuth();
  const { business } = useBusiness();

  // Reactive queries — the dashboard updates automatically when data changes
  const quotesData = useQuery(api.quotes.list, { status: "sent" });
  const invoicesData = useQuery(api.invoices.list, {});
  const reportsData = useQuery(api.reports.summary, {});

  // Build trend data from reports
  const trends = useMemo(() => buildTrends(reportsData), [reportsData]);

  // Build suggestions and reminders from current conditions
  const suggestions = useMemo(
    () => deriveSuggestions(quotesData, invoicesData, reportsData),
    [quotesData, invoicesData, reportsData],
  );

  const reminders = useMemo(
    () => deriveReminders(quotesData, invoicesData),
    [quotesData, invoicesData],
  );

  // Quick stats from reports
  const stats = useMemo(() => {
    if (!reportsData) return null;
    return {
      invoiced: reportsData.invoices?.invoicedCents || 0,
      invoicedCount: reportsData.invoices?.invoicedCount || 0,
      collected: reportsData.payments?.collectedCents || 0,
      collectedCount: reportsData.payments?.collectedCount || 0,
      outstanding: reportsData.invoices?.outstandingCents || 0,
      overdue: reportsData.invoices?.overdueCents || 0,
      acceptanceRate: reportsData.quotes?.acceptanceRateBps || null,
      sentQuotes: reportsData.quotes?.quoteCounts?.sent || 0,
      draftQuotes: reportsData.quotes?.quoteCounts?.draft || 0,
    };
  }, [reportsData]);

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        {/* Header — no date/time, no long title */}
        <header className="flex flex-col gap-1">
          <div className="ledger-label text-muted-foreground animate-fade-in-up">
            Your ledger at a glance
          </div>
          <h1 className="letterpress font-serif text-2xl font-bold tracking-tight sm:text-3xl animate-in-up">
            {business ? (
              <>Overview for <span className="font-serif font-semibold text-foreground">{business.name}</span></>
            ) : (
              "Overview"
            )}
          </h1>
        </header>

        {/* Trend chart card */}
        <Card className="glass glass-ambient paper-card border shadow-lg relative overflow-hidden">
          <div className="deco-glow absolute inset-0 pointer-events-none" />
          <div className="flex flex-col gap-4 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="ledger-label text-muted-foreground">6-month trend</div>
                <div className="font-serif text-2xl font-bold tracking-tight mt-0.5">
                  {trends.labels.length > 0
                    ? trends.labels[trends.labels.length - 1]
                    : "No data yet"}
                </div>
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  {trendArrow(trends.latestGrowth)}
                  {trends.latestGrowth === "up" ? "Revenue growing" : trends.latestGrowth === "down" ? "Revenue declining" : "Stable"}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 rounded-md bg-glass/60 px-3 py-2">
                <TrendingUp className="size-4 text-muted-foreground" />
                <span className="ledger-label text-xs text-muted-foreground">Invoiced vs collected</span>
              </div>
            </div>

            {/* Trend bars */}
            {trends.labels.length > 0 ? (
              <div className="analytics-grid relative pt-2 pb-1">
                <div className="flex items-end gap-2 justify-between h-28">
                  {trends.labels.map((label, i) => {
                    const maxVal = Math.max(...trends.invoiced, 1);
                    const invoicedHeight = (trends.invoiced[i] / maxVal) * 100;
                    const collectedHeight = trends.collected[i]
                      ? (trends.collected[i] / maxVal) * 100
                      : 0;
                    return (
                      <div key={label} className="flex flex-col items-center gap-1 flex-1">
                        <div className="flex items-end gap-1 w-full h-24">
                          <div
                            className="w-3 rounded-t bg-primary/80 transition-all"
                            style={{ height: `${Math.max(4, invoicedHeight)}%` }}
                            title={`Invoiced ${formatMoney(trends.invoiced[i], { compact: true })}`}
                          />
                          <div
                            className="w-3 rounded-t bg-emerald-600/60 transition-all"
                            style={{ height: `${Math.max(4, collectedHeight)}%` }}
                            title={`Collected ${formatMoney(trends.collected[i], { compact: true })}`}
                          />
                        </div>
                        <span className="ledger-label text-[10px] text-muted-foreground truncate w-full text-center">
                          {label}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block size-2.5 rounded-sm bg-primary/80" />
                    Invoiced
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block size-2.5 rounded-sm bg-emerald-600/60" />
                    Collected
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Clock className="mr-2 size-5" />
                Send quotes and invoices to see your trend here.
              </div>
            )}

            {/* Bottom stats row */}
            {stats && (
              <div className="grid grid-cols-3 gap-3">
                <div className="glass-wall rounded-md border p-3 text-center">
                  <div className="font-mono text-lg font-bold text-foreground">
                    {formatMoney(stats.invoiced, { compact: true })}
                  </div>
                  <div className="ledger-label text-[10px] text-muted-foreground">
                    Invoiced · {stats.invoicedCount}
                  </div>
                </div>
                <div className="glass-wall rounded-md border p-3 text-center">
                  <div className="font-mono text-lg font-bold text-foreground">
                    {formatMoney(stats.collected, { compact: true })}
                  </div>
                  <div className="ledger-label text-[10px] text-muted-foreground">
                    Collected · {stats.collectedCount}
                  </div>
                </div>
                <div className="glass-wall rounded-md border p-3 text-center">
                  <div className={`font-mono text-lg font-bold ${stats.outstanding > 0 ? "text-amber-400" : "text-foreground"}`}>
                    {formatMoney(stats.outstanding, { compact: true })}
                  </div>
                  <div className="ledger-label text-[10px] text-muted-foreground">
                    Outstanding
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* AI-style suggestions */}
        {suggestions.length > 0 && (
          <section>
            <div className="flex items-center gap-2">
              <Lightbulb className="size-4 text-primary" />
              <h2 className="font-serif text-lg font-bold">Suggestions</h2>
              <Badge variant="outline" className="border-primary/40 font-normal text-primary">
                {suggestions.length}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Derived from your quotes, invoices and payments — things that could move your business forward.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {suggestions.map((s, i) => (
                <div
                  key={i}
                  className="glass-wall rounded-md border border-border/60 bg-glass/40 p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex size-5 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <s.icon className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-serif font-bold text-sm">{s.label}</h3>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{s.detail}</p>
                      {s.href && (
                        <Button asChild variant="ghost" size="sm" className="mt-2">
                          <Link to={s.href}>
                            Take action
                            <ArrowRight className="ml-1.5 size-3.5" />
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Quick reminders */}
        {reminders.length > 0 && (
          <section>
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-amber-400" />
              <h2 className="font-serif text-lg font-bold">Quick reminders</h2>
              <Badge variant="outline" className="border-amber-400/40 font-normal text-amber-400">
                {reminders.length}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Time-sensitive items from your quotes, invoices and payments.
            </p>
            <div className="mt-4 space-y-2">
              {reminders.map((r, i) => (
                <div
                  key={i}
                  className="glass-wall rounded-md border border-border/60 bg-glass/40 p-3 flex items-center gap-3"
                >
                  <div className={`mt-0.5 flex size-5 items-center justify-center rounded-full ${
                    r.icon === AlertCircle ? "bg-red-100/20 text-red-400" : "bg-amber-100/20 text-amber-400"
                  }`}>
                    <r.icon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-serif font-semibold text-sm truncate">{r.label}</div>
                    <div className="text-xs text-muted-foreground truncate">{r.detail}</div>
                  </div>
                  {r.href && (
                    <Button asChild variant="ghost" size="icon" className="shrink-0">
                      <Link to={r.href}>
                        <ArrowRight className="size-3.5" />
                      </Link>
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Empty state when no data */}
        {!stats && (
          <Card className="glass glass-card paper-card parchment-edge border-dashed">
            <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
              <div className="stamp flex size-14 items-center justify-center rounded-full text-primary/70">
                <TrendingUp className="size-7" />
              </div>
              <h3 className="font-serif text-lg font-bold">Your ledger is empty</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Send your first quote or invoice to start seeing trends, suggestions and reminders here.
              </p>
              <div className="flex gap-2">
                <Button asChild size="sm">
                  <Link to="/quotes">
                    New quote
                    <ArrowRight className="ml-2 size-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link to="/invoices">
                    New invoice
                    <ArrowRight className="ml-2 size-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick action CTA */}
        {(suggestions.length > 0 || reminders.length > 0) && (
          <Card className="border-dashed glass-wall">
            <CardContent className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-serif font-bold">Keep the momentum</h3>
                <p className="text-sm text-muted-foreground">
                  Trends update in realtime as your quotes, invoices and payments change.
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                <Button asChild variant="outline" size="sm">
                  <Link to="/follow-ups">
                    Review reminders
                    <ArrowRight className="ml-2 size-4" />
                  </Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/quotes">
                    Send a quote
                    <ArrowRight className="ml-2 size-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
