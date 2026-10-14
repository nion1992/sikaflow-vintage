import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import AppShell from "@/components/AppShell";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useBusiness } from "@/hooks/use-business";
import { formatMoney, formatDate } from "@/lib/money";
import { useQuery, useMutation } from "convex/react";
import { toast } from "sonner";
import {
  BellRing,
  CalendarClock,
  Copy,
  ExternalLink,
  FileText,
  Hourglass,
  Loader2,
  MessageCircle,
  RefreshCw,
} from "lucide-react";
import { Link, useNavigate } from "react-router";
import { useState } from "react";

type QuoteId = Id<"quotes">;

interface Contact {
  name: string;
  phone?: string;
  whatsapp?: string;
}

/* ── WhatsApp helpers ────────────────────────────────────────────── */

function waLink(contact: Contact, text: string): string {
  const digits = (contact.whatsapp ?? contact.phone ?? "")
    .replace(/[^\d]/g, "");
  const base = digits ? `https://wa.me/${digits}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(text)}`;
}

function openWhatsApp(contact: Contact, text: string) {
  window.open(waLink(contact, text), "_blank", "noopener,noreferrer");
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Message copied — paste it into WhatsApp or SMS.");
  } catch {
    toast.error("Could not access the clipboard.");
  }
}

/* ── Shared action row ───────────────────────────────────────────── */

function ReminderActions({
  contact,
  message,
  extra,
}: {
  contact: Contact;
  message: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {extra}
      <Button
        variant="outline"
        size="sm"
        onClick={() => openWhatsApp(contact, message)}
      >
        <MessageCircle className="mr-2 size-4" />
        WhatsApp
      </Button>
      <Button variant="ghost" size="sm" onClick={() => copyText(message)}>
        <Copy className="mr-2 size-4" />
        Copy
      </Button>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────── */

export default function FollowUps() {
  const { hasBusiness, business } = useBusiness();
  const navigate = useNavigate();
  const duplicateQuote = useMutation(api.quotes.duplicate);
  const [resendingId, setResendingId] = useState<QuoteId | null>(null);

  const data = useQuery(
    api.followups.list,
    hasBusiness ? {} : "skip",
  );

  const bizName = business?.name ?? "our business";

  const handleResend = async (quoteId: QuoteId) => {
    setResendingId(quoteId);
    try {
      const res = await duplicateQuote({ id: quoteId });
      toast.success(`Re-issued as ${res.documentNumber} — review and share it.`);
      navigate(`/quotes/${res.quoteId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not re-issue.");
    } finally {
      setResendingId(null);
    }
  };

  if (!hasBusiness) {
    return (
      <AppShell>
        <Card className="paper-card parchment-edge border-dashed">
          <CardHeader className="items-center text-center">
            <div className="stamp mx-auto flex size-14 items-center justify-center rounded-full text-primary/70">
              <BellRing className="size-7" />
            </div>
            <CardTitle className="font-serif text-lg">
              The reminder desk
            </CardTitle>
            <CardDescription>
              Finish onboarding to start chasing payments politely.
            </CardDescription>
          </CardHeader>
        </Card>
      </AppShell>
    );
  }

  const totalItems =
    (data?.overdueInvoices.length ?? 0) +
    (data?.dueSoonInvoices.length ?? 0) +
    (data?.expiringQuotes.length ?? 0) +
    (data?.awaitingQuotes.length ?? 0) +
    (data?.needsResendQuotes.length ?? 0);

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <header>
          <div className="ledger-label text-muted-foreground">
            SikaFlow · The reminder desk
          </div>
          <h1 className="letterpress mt-1 font-serif text-2xl font-bold tracking-tight sm:text-3xl">
            Follow-ups
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data
              ? totalItems === 0
                ? "Nothing needs chasing today."
                : `${totalItems} ${totalItems === 1 ? "item needs" : "items need"} a polite nudge.`
              : "Reading the ledger…"}
          </p>
        </header>

        {!data ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="mr-2 size-5 animate-spin" />
            Sorting the chasing pile…
          </div>
        ) : totalItems === 0 ? (
          <Card className="paper-card parchment-edge border-dashed">
            <CardHeader className="items-center text-center">
              <div className="stamp mx-auto flex size-14 items-center justify-center rounded-full text-emerald-800 dark:text-emerald-300">
                <BellRing className="size-7" />
              </div>
              <CardTitle className="font-serif text-lg">
                All quiet in the ledger
              </CardTitle>
              <CardDescription>
                No overdue invoices, nothing about to lapse, no quotes awaiting a
                reply. Check back after your next round of documents.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="flex flex-col gap-8">
            {/* 1. Overdue invoices */}
            {data.overdueInvoices.length > 0 && (
              <section>
                <div className="flex items-center gap-2">
                  <BellRing className="size-4 text-destructive" />
                  <h2 className="font-serif text-lg font-bold">Overdue invoices</h2>
                  <Badge
                    variant="outline"
                    className="border-destructive/30 font-normal text-destructive"
                  >
                    {data.overdueInvoices.length}
                  </Badge>
                </div>
                <ul className="mt-3 space-y-3">
                  {data.overdueInvoices.map((item) => (
                    <li key={item.invoiceId}>
                      <Card className="paper-card border-destructive/25">
                        <CardContent className="p-4">
                          <div className="flex flex-wrap items-start gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Link
                                  to={`/invoices/${item.invoiceId}`}
                                  className="font-mono text-sm font-semibold underline-offset-2 hover:underline"
                                >
                                  {item.documentNumber}
                                </Link>
                                <Badge
                                  variant="outline"
                                  className="border-destructive/30 bg-destructive/10 font-normal text-destructive"
                                >
                                  {item.daysOverdue}{" "}
                                  {item.daysOverdue === 1 ? "day" : "days"} overdue
                                </Badge>
                              </div>
                              <div className="mt-0.5 text-sm text-muted-foreground">
                                {item.contact.name} · was due{" "}
                                {formatDate(item.dueDate)} ·{" "}
                                {formatMoney(item.balanceCents)} outstanding
                              </div>
                              <ReminderActions
                                contact={item.contact}
                                message={[
                                  `Hello ${item.contact.name},`,
                                  "",
                                  `A gentle reminder that invoice ${item.documentNumber} from ${bizName} has a balance of ${formatMoney(item.balanceCents)}, which was due on ${formatDate(item.dueDate)}.`,
                                  "",
                                  "Kindly settle at your convenience — cash, bank transfer or MoMo all work. Reply here if you need banking details or a copy of the invoice.",
                                  "",
                                  `— ${bizName}`,
                                ].join("\n")}
                              />
                            </div>
                            <div className="ml-auto text-right">
                              <div className="font-mono text-base font-bold text-destructive">
                                {formatMoney(item.balanceCents, { compact: true })}
                              </div>
                              <div className="ledger-label text-muted-foreground">
                                outstanding
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* 2. Due within a week */}
            {data.dueSoonInvoices.length > 0 && (
              <section>
                <div className="flex items-center gap-2">
                  <CalendarClock className="size-4 text-amber-700 dark:text-amber-300" />
                  <h2 className="font-serif text-lg font-bold">
                    Due within 7 days
                  </h2>
                  <Badge
                    variant="outline"
                    className="border-amber-700/30 font-normal text-amber-800 dark:text-amber-300"
                  >
                    {data.dueSoonInvoices.length}
                  </Badge>
                </div>
                <ul className="mt-3 space-y-3">
                  {data.dueSoonInvoices.map((item) => (
                    <li key={item.invoiceId}>
                      <Card className="paper-card">
                        <CardContent className="p-4">
                          <div className="flex flex-wrap items-start gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Link
                                  to={`/invoices/${item.invoiceId}`}
                                  className="font-mono text-sm font-semibold underline-offset-2 hover:underline"
                                >
                                  {item.documentNumber}
                                </Link>
                                <Badge
                                  variant="outline"
                                  className="border-amber-700/30 bg-amber-700/10 font-normal text-amber-800 dark:text-amber-300"
                                >
                                  due in {item.daysUntilDue}{" "}
                                  {item.daysUntilDue === 1 ? "day" : "days"}
                                </Badge>
                              </div>
                              <div className="mt-0.5 text-sm text-muted-foreground">
                                {item.contact.name} ·{" "}
                                {formatMoney(item.balanceCents)} outstanding
                              </div>
                              <ReminderActions
                                contact={item.contact}
                                message={[
                                  `Hello ${item.contact.name},`,
                                  "",
                                  `A friendly heads-up that invoice ${item.documentNumber} from ${bizName} (${formatMoney(item.balanceCents)}) falls due on ${formatDate(item.dueDate)}.`,
                                  "",
                                  "Thank you for your business!",
                                  "",
                                  `— ${bizName}`,
                                ].join("\n")}
                              />
                            </div>
                            <div className="ml-auto text-right">
                              <div className="font-mono text-base font-bold">
                                {formatMoney(item.balanceCents, { compact: true })}
                              </div>
                              <div className="ledger-label text-muted-foreground">
                                outstanding
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* 3. Quotes expiring within a week */}
            {data.expiringQuotes.length > 0 && (
              <section>
                <div className="flex items-center gap-2">
                  <Hourglass className="size-4 text-amber-700 dark:text-amber-300" />
                  <h2 className="font-serif text-lg font-bold">
                    Quotes expiring soon
                  </h2>
                  <Badge
                    variant="outline"
                    className="border-amber-700/30 font-normal text-amber-800 dark:text-amber-300"
                  >
                    {data.expiringQuotes.length}
                  </Badge>
                </div>
                <ul className="mt-3 space-y-3">
                  {data.expiringQuotes.map((q) => (
                    <li key={q.quoteId}>
                      <Card className="paper-card">
                        <CardContent className="p-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Link
                                to={`/quotes/${q.quoteId}`}
                                className="font-mono text-sm font-semibold underline-offset-2 hover:underline"
                              >
                                {q.documentNumber}
                              </Link>
                              <Badge
                                variant="outline"
                                className="border-amber-700/30 bg-amber-700/10 font-normal text-amber-800 dark:text-amber-300"
                              >
                                expires in {q.daysUntilExpiry}{" "}
                                {q.daysUntilExpiry === 1 ? "day" : "days"}
                              </Badge>
                            </div>
                            <div className="mt-0.5 text-sm text-muted-foreground">
                              {q.contact.name} · {formatMoney(q.grandTotalCents)}{" "}
                              · sent {formatDate(q.quoteDate)}
                            </div>
                            <ReminderActions
                              contact={q.contact}
                              message={[
                                `Hello ${q.contact.name},`,
                                "",
                                `Just checking in — quotation ${q.documentNumber} from ${bizName} (${formatMoney(q.grandTotalCents)}) is still valid until ${formatDate(q.expiryDate)}.`,
                                "",
                                "Would you like to go ahead? Happy to adjust anything first.",
                                "",
                                `— ${bizName}`,
                              ].join("\n")}
                            />
                          </div>
                        </CardContent>
                      </Card>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* 4. Quotes awaiting a reply */}
            {data.awaitingQuotes.length > 0 && (
              <section>
                <div className="flex items-center gap-2">
                  <FileText className="size-4 text-muted-foreground" />
                  <h2 className="font-serif text-lg font-bold">
                    Quotes awaiting a reply
                  </h2>
                  <Badge variant="outline" className="font-normal">
                    {data.awaitingQuotes.length}
                  </Badge>
                </div>
                <ul className="mt-3 space-y-3">
                  {data.awaitingQuotes.map((q) => (
                    <li key={q.quoteId}>
                      <Card className="paper-card">
                        <CardContent className="p-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Link
                                to={`/quotes/${q.quoteId}`}
                                className="font-mono text-sm font-semibold underline-offset-2 hover:underline"
                              >
                                {q.documentNumber}
                              </Link>
                              <Badge
                                variant="outline"
                                className="font-normal text-muted-foreground"
                              >
                                sent {q.daysSinceSent}{" "}
                                {q.daysSinceSent === 1 ? "day" : "days"} ago
                              </Badge>
                            </div>
                            <div className="mt-0.5 text-sm text-muted-foreground">
                              {q.contact.name} ·{" "}
                              {formatMoney(q.grandTotalCents, { compact: true })}{" "}
                              · valid until {formatDate(q.expiryDate)}
                            </div>
                            <ReminderActions
                              contact={q.contact}
                              message={[
                                `Hello ${q.contact.name},`,
                                "",
                                `Following up on quotation ${q.documentNumber} from ${bizName} (${formatMoney(q.grandTotalCents)}), sent on ${formatDate(q.quoteDate)}.`,
                                "",
                                "Any questions or adjustments before you decide?",
                                "",
                                `— ${bizName}`,
                              ].join("\n")}
                            />
                          </div>
                        </CardContent>
                      </Card>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* 5. Quotes to re-issue */}
            {data.needsResendQuotes.length > 0 && (
              <section>
                <div className="flex items-center gap-2">
                  <RefreshCw className="size-4 text-primary" />
                  <h2 className="font-serif text-lg font-bold">
                    Re-issue or close out
                  </h2>
                  <Badge variant="outline" className="font-normal">
                    {data.needsResendQuotes.length}
                  </Badge>
                </div>
                <ul className="mt-3 space-y-3">
                  {data.needsResendQuotes.map((q) => (
                    <li key={q.quoteId}>
                      <Card className="paper-card border-dashed">
                        <CardContent className="p-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Link
                                to={`/quotes/${q.quoteId}`}
                                className="font-mono text-sm font-semibold underline-offset-2 hover:underline"
                              >
                                {q.documentNumber}
                              </Link>
                              <Badge
                                variant="outline"
                                className={
                                  q.status === "rejected"
                                    ? "border-destructive/30 bg-destructive/10 font-normal text-destructive"
                                    : "border-amber-700/30 bg-amber-700/10 font-normal text-amber-800 dark:text-amber-300"
                                }
                              >
                                {q.status === "rejected"
                                  ? "declined"
                                  : "expired"}
                              </Badge>
                            </div>
                            <div className="mt-0.5 text-sm text-muted-foreground">
                              {q.contact.name} ·{" "}
                              {formatMoney(q.grandTotalCents, { compact: true })}{" "}
                              · from {formatDate(q.quoteDate)}
                            </div>
                            <ReminderActions
                              contact={q.contact}
                              message={[
                                `Hello ${q.contact.name},`,
                                "",
                                `Earlier we sent quotation ${q.documentNumber} from ${bizName} (${formatMoney(q.grandTotalCents)}). If the timing is better now, we can confirm a fresh offer — or adjust the scope or price if anything changed.`,
                                "",
                                "Would a new version be useful?",
                                "",
                                `— ${bizName}`,
                              ].join("\n")}
                              extra={
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleResend(q.quoteId)}
                                  disabled={resendingId === q.quoteId}
                                >
                                  {resendingId === q.quoteId ? (
                                    <Loader2 className="mr-2 size-4 animate-spin" />
                                  ) : (
                                    <RefreshCw className="mr-2 size-4" />
                                  )}
                                  Re-issue as new draft
                                </Button>
                              }
                            />
                          </div>
                        </CardContent>
                      </Card>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <p className="pb-2 text-center text-xs text-muted-foreground">
              <ExternalLink className="mr-1 inline size-3" />
              Re-issued quotes open as fresh drafts with new numbers — edit, then
              share from the preview page.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
