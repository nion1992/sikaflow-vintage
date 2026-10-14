import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import AppShell from "@/components/AppShell";
import { api } from "@/convex/_generated/api";
import { useBusiness } from "@/hooks/use-business";
import { formatMoney, fromDateInputValue } from "@/lib/money";
import { useQuery } from "convex/react";
import { BarChart3, Loader2, Printer } from "lucide-react";
import { Link } from "react-router";
import { useState } from "react";

/* ── Date ranges ─────────────────────────────────────────────────── */

type PresetKey =
  | "this_month"
  | "last_month"
  | "this_year"
  | "last_year"
  | "all"
  | "custom";

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "this_year", label: "This year" },
  { key: "last_year", label: "Last year" },
  { key: "all", label: "All time" },
  { key: "custom", label: "Custom" },
];

const DAY_MS = 86_400_000;

function presetRange(key: PresetKey, customFrom: string, customTo: string) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  switch (key) {
    case "this_month":
      return {
        from: new Date(y, m, 1).getTime(),
        to: new Date(y, m + 1, 0, 23, 59, 59, 999).getTime(),
      };
    case "last_month":
      return {
        from: new Date(y, m - 1, 1).getTime(),
        to: new Date(y, m, 0, 23, 59, 59, 999).getTime(),
      };
    case "this_year":
      return {
        from: new Date(y, 0, 1).getTime(),
        to: new Date(y, 11, 31, 23, 59, 59, 999).getTime(),
      };
    case "last_year":
      return {
        from: new Date(y - 1, 0, 1).getTime(),
        to: new Date(y - 1, 11, 31, 23, 59, 59, 999).getTime(),
      };
    case "custom":
      return {
        from: customFrom ? fromDateInputValue(customFrom) : 0,
        to: customTo ? fromDateInputValue(customTo) + DAY_MS - 1 : Number.MAX_SAFE_INTEGER,
      };
    case "all":
    default:
      return { from: 0, to: Number.MAX_SAFE_INTEGER };
  }
}

/* ── Tile ────────────────────────────────────────────────────────── */

function Tile({
  label,
  amount,
  sub,
  tone,
  to,
}: {
  label: string;
  amount: string;
  sub?: string;
  tone: "ink" | "good" | "bad";
  to?: string;
}) {
  const body = (
    <div
      className={`paper-card h-full rounded-md border p-4 transition-colors ${
        to ? "hover:border-primary/40" : ""
      }`}
    >
      <div className="ledger-label text-muted-foreground">{label}</div>
      <div
        className={`mt-1.5 font-mono text-xl font-bold ${
          tone === "good"
            ? "text-emerald-800 dark:text-emerald-300"
            : tone === "bad"
              ? "text-destructive"
              : ""
        }`}
      >
        {amount}
      </div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
  return to ? (
    <Link to={to} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}

/* ── Page ────────────────────────────────────────────────────────── */

export default function Reports() {
  const { hasBusiness } = useBusiness();
  const [preset, setPreset] = useState<PresetKey>("this_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const range = presetRange(preset, customFrom, customTo);
  const data = useQuery(
    api.reports.summary,
    hasBusiness
      ? {
          from: range.from === 0 ? undefined : range.from,
          to: range.to === Number.MAX_SAFE_INTEGER ? undefined : range.to,
        }
      : "skip",
  );

  const maxMonthly = data?.monthly
    ? Math.max(
        1,
        ...data.monthly.map((m) => Math.max(m.invoicedCents, m.collectedCents)),
      )
    : 1;

  if (!hasBusiness) {
    return (
      <AppShell>
        <Card className="paper-card parchment-edge border-dashed">
          <CardHeader className="items-center text-center">
            <div className="stamp mx-auto flex size-14 items-center justify-center rounded-full text-primary/70">
              <BarChart3 className="size-7" />
            </div>
            <CardTitle className="font-serif text-lg">The report room</CardTitle>
            <CardDescription>
              Finish onboarding to see your books summarised.
            </CardDescription>
          </CardHeader>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="ledger-label text-muted-foreground">
              SikaFlow · The report room
            </div>
            <h1 className="letterpress mt-1 font-serif text-2xl font-bold tracking-tight sm:text-3xl">
              Reports
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Plain-language totals from your ledger — no jargon, no guesswork.
            </p>
          </div>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="mr-2 size-4" />
            Print
          </Button>
        </header>

        {/* Range picker */}
        <div className="no-print flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="space-y-1.5 sm:w-44">
            <Label>Period</Label>
            <Select
              value={preset}
              onValueChange={(v) => setPreset(v as PresetKey)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRESETS.map((p) => (
                  <SelectItem key={p.key} value={p.key}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {preset === "custom" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="report-from">From</Label>
                <Input
                  id="report-from"
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="report-to">To</Label>
                <Input
                  id="report-to"
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </div>
            </>
          )}
        </div>

        {/* Content */}
        {!data ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="mr-2 size-5 animate-spin" />
            Tallying the ledger…
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {/* Summary tiles */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile
                label="Invoiced"
                amount={formatMoney(data.invoices.invoicedCents, { compact: true })}
                sub={`${data.invoices.invoicedCount} issued`}
                tone="ink"
              />
              <Tile
                label="Collected"
                amount={formatMoney(data.payments.collectedCents, {
                  compact: true,
                })}
                sub={`${data.payments.collectedCount} receipts`}
                tone="good"
              />
              <Tile
                label="Outstanding"
                amount={formatMoney(data.invoices.outstandingCents, {
                  compact: true,
                })}
                sub={`${data.invoices.outstandingCount} awaiting payment`}
                tone={data.invoices.outstandingCents > 0 ? "bad" : "ink"}
                to="/invoices"
              />
              <Tile
                label="Overdue"
                amount={formatMoney(data.invoices.overdueCents, {
                  compact: true,
                })}
                sub={`${data.invoices.overdueCount} past due`}
                tone={data.invoices.overdueCents > 0 ? "bad" : "ink"}
                to="/invoices"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile
                label="Paid invoices"
                amount={formatMoney(data.invoices.paidInvoiceCents, {
                  compact: true,
                })}
                sub={`${data.invoices.paidInvoiceCount} settled in full`}
                tone="ink"
              />
              <Tile
                label="Quoted"
                amount={formatMoney(data.quotes.quotedCents, { compact: true })}
                sub={`${data.quotes.count} quotes out`}
                tone="ink"
                to="/quotes"
              />
              <Tile
                label="Acceptance"
                amount={
                  data.quotes.acceptanceRateBps === null
                    ? "—"
                    : `${(data.quotes.acceptanceRateBps / 100).toFixed(0)}%`
                }
                sub={`${data.quotes.quoteCounts.accepted} of ${
                  data.quotes.quoteCounts.accepted +
                  data.quotes.quoteCounts.rejected
                } decided`}
                tone="ink"
                to="/quotes"
              />
              <Tile
                label="Drafts to finish"
                amount={String(
                  data.invoices.draftCount + data.quotes.quoteCounts.draft,
                )}
                sub="invoice + quote drafts"
                tone="ink"
              />
            </div>

            {/* Month by month */}
            {data.monthly.length > 0 && (
              <Card className="paper-card">
                <CardHeader>
                  <CardTitle className="font-serif text-base">
                    Month by month
                  </CardTitle>
                  <CardDescription>
                    Invoiced vs collected, by month in the selected period.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-end gap-4 overflow-x-auto pb-2">
                    {data.monthly.map((m) => (
                      <div
                        key={m.key}
                        className="flex w-16 shrink-0 flex-col items-center gap-1"
                      >
                        <div className="flex h-32 w-full items-end justify-center gap-1">
                          <div
                            className="w-1/2 rounded-t bg-primary/80"
                            style={{
                              height: `${Math.max(
                                4,
                                (m.invoicedCents / maxMonthly) * 100,
                              )}%`,
                            }}
                            title={`Invoiced ${formatMoney(m.invoicedCents)}`}
                          />
                          <div
                            className="w-1/2 rounded-t bg-emerald-800/50 dark:bg-emerald-300/40"
                            style={{
                              height: `${Math.max(
                                4,
                                (m.collectedCents / maxMonthly) * 100,
                              )}%`,
                            }}
                            title={`Collected ${formatMoney(m.collectedCents)}`}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {m.label}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block size-2.5 rounded-sm bg-primary/80" />
                      Invoiced
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block size-2.5 rounded-sm bg-emerald-800/50" />
                      Collected
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Top customers */}
            {data.customers.length > 0 && (
              <Card className="paper-card">
                <CardHeader>
                  <CardTitle className="font-serif text-base">
                    Top customers
                  </CardTitle>
                  <CardDescription>
                    By invoiced value in the selected period.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {data.customers.map((c, index) => (
                      <li key={c.customerId} className="flex items-center gap-3">
                        <span className="w-5 font-serif text-sm font-bold text-primary">
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {c.name}
                        </span>
                        <span className="font-mono text-sm">
                          {formatMoney(c.invoicedCents, { compact: true })}
                        </span>
                        {c.outstandingCents > 0 && (
                          <Badge
                            variant="outline"
                            className="border-destructive/30 font-normal text-destructive"
                          >
                            {formatMoney(c.outstandingCents, {
                              compact: true,
                            })}{" "}
                            due
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Quote funnel */}
            <Card className="paper-card">
              <CardHeader>
                <CardTitle className="font-serif text-base">
                  The quote funnel
                </CardTitle>
                <CardDescription>
                  Where your quotations stand in the selected period.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-5 gap-2 text-center">
                  {(
                    [
                      ["Draft", data.quotes.quoteCounts.draft],
                      ["Sent", data.quotes.quoteCounts.sent],
                      ["Accepted", data.quotes.quoteCounts.accepted],
                      ["Rejected", data.quotes.quoteCounts.rejected],
                      ["Expired", data.quotes.quoteCounts.expired],
                    ] as const
                  ).map(([label, count]) => (
                    <div key={label} className="rounded-md border p-2">
                      <div className="ledger-label text-muted-foreground">
                        {label}
                      </div>
                      <div className="mt-1 font-mono text-lg font-bold">
                        {count}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AppShell>
  );
}
