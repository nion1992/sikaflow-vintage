import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import InvoiceDocument from "@/components/InvoiceDocument";
import AppShell from "@/components/AppShell";
import { api } from "@/convex/_generated/api";
import { useBusiness } from "@/hooks/use-business";
import { formatMoney, formatDate } from "@/lib/money";
import { shareDocumentOnWhatsApp } from "@/lib/share-document";
import { useQuery, useMutation } from "convex/react";
import { toast } from "sonner";
import {
  ArrowLeft,
  BadgeCheck,
  Copy,
  Loader2,
  MessageCircle,
  Printer,
  Trash2,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { useState } from "react";
import { RecordPaymentDialog } from "@/pages/Payments";
import { PAYMENT_METHOD_LABELS } from "@/convex/shared";
import { Banknote } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";

/** Compose a friendly WhatsApp message summarising the invoice. */
function buildWhatsAppText(
  documentNumber: string,
  businessName: string,
  customerName: string,
  totalCents: number,
  amountPaidCents: number,
  status: string,
  dueDate: number,
): string {
  const balance = Math.max(0, totalCents - amountPaidCents);
  const lines = [
    `Hello ${customerName},`,
    "",
    `Please find your invoice ${documentNumber} from ${businessName}:`,
    `Total: ${formatMoney(totalCents)}`,
  ];
  if (amountPaidCents > 0) {
    lines.push(`Already paid: ${formatMoney(amountPaidCents)}`);
  }
  if (status !== "cancelled") {
    lines.push(
      status === "paid"
        ? "Status: settled in full — thank you!"
        : `Balance due: ${formatMoney(balance)} by ${formatDate(dueDate)}`,
    );
  }
  lines.push(
    "",
    "The full document is attached as a PDF. Payment details: cash, bank transfer or MoMo.",
    "",
    `— ${businessName}`,
  );
  return lines.join("\n");
}

export default function InvoicePreview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { business, logoUrl } = useBusiness();

  const data = useQuery(
    api.invoices.get,
    id ? { id: id as Id<"invoices"> } : "skip",
  );
  const payments = useQuery(
    api.payments.byInvoice,
    id ? { invoiceId: id as Id<"invoices"> } : "skip",
  );
  const setStatus = useMutation(api.invoices.setStatus);
  const removeInvoice = useMutation(api.invoices.remove);

  const [isPending, setIsPending] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [payDialogOpen, setPayDialogOpen] = useState(false);

  const changeStatus = async (status: "sent" | "cancelled") => {
    if (!data) return;
    setIsPending(true);
    try {
      await setStatus({ id: data.invoice._id, status });
      toast.success(
        status === "sent" ? "Invoice marked as sent." : "Invoice cancelled.",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update.");
    } finally {
      setIsPending(false);
    }
  };

  const handleCopy = async () => {
    if (!data || !business) return;
    const text = buildWhatsAppText(
      data.invoice.documentNumber,
      business.name,
      data.customer?.name ?? "Customer",
      data.invoice.grandTotalCents,
      data.invoice.amountPaidCents,
      data.invoice.status,
      data.invoice.dueDate,
    );
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Message copied — paste it anywhere.");
    } catch {
      toast.error("Could not access the clipboard.");
    }
  };

  const handleWhatsApp = async () => {
    if (!data || !business) return;
    const text = buildWhatsAppText(
      data.invoice.documentNumber,
      business.name,
      data.customer?.name ?? "Customer",
      data.invoice.grandTotalCents,
      data.invoice.amountPaidCents,
      data.invoice.status,
      data.invoice.dueDate,
    );
    setIsSharing(true);
    try {
      const outcome = await shareDocumentOnWhatsApp({
        sheet: document.querySelector<HTMLElement>(".quote-sheet"),
        logoUrl: logoUrl ?? undefined,
        filename: `${data.invoice.documentNumber.replace(/[^\w.-]+/g, "-")}.pdf`,
        text,
      });
      // Consider it sent on the first share — unless the user backed out.
      if (outcome !== "cancelled" && data.invoice.status === "draft") {
        void setStatus({ id: data.invoice._id, status: "sent" }).catch(() => {});
      }
    } finally {
      setIsSharing(false);
    }
  };

  const handleDelete = async () => {
    if (!data) return;
    try {
      await removeInvoice({ id: data.invoice._id });
      toast.success(`Invoice ${data.invoice.documentNumber} removed.`);
      navigate("/invoices");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete.");
    }
  };

  const statusLabel =
    data?.invoice.status === "partially_paid"
      ? "Partly paid"
      : (data?.invoice.status ?? "");

  return (
    <AppShell>
      <div className="flex flex-col gap-5">
        {/* Toolbar */}
        <div className="no-print flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="icon" aria-label="Back to invoices">
              <Link to="/invoices">
                <ArrowLeft className="size-5" />
              </Link>
            </Button>
            <div>
              <div className="ledger-label text-muted-foreground">
                The invoice book
              </div>
              <h1 className="font-serif text-xl font-bold tracking-tight">
                {data ? data.invoice.documentNumber : "Invoice"}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {data?.invoice.status === "draft" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => changeStatus("sent")}
                disabled={isPending}
              >
                {isPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <BadgeCheck className="mr-2 size-4" />
                )}
                Mark as sent
              </Button>
            )}
            {data &&
              (data.invoice.status === "sent" ||
                data.invoice.status === "partially_paid" ||
                data.invoice.status === "overdue") && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPayDialogOpen(true)}
                >
                  <Banknote className="mr-2 size-4" />
                  Record payment
                </Button>
              )}
            <Button variant="outline" size="sm" onClick={handleCopy} disabled={!data}>
              <Copy className="mr-2 size-4" />
              Copy message
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleWhatsApp}
              disabled={!data || isSharing}
            >
              {isSharing ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <MessageCircle className="mr-2 size-4" />
              )}
              {isSharing ? "Preparing PDF…" : "WhatsApp"}
            </Button>
            <Button size="sm" onClick={() => window.print()} disabled={!data}>
              <Printer className="mr-2 size-4" />
              Print / PDF
            </Button>
          </div>
        </div>

        {/* Document */}
        {!data ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="mr-2 size-5 animate-spin" />
            Fetching the document…
          </div>
        ) : !business ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="mr-2 size-5 animate-spin" />
            Loading your business details…
          </div>
        ) : (
          <>
            <div className="animate-document-open">
              <InvoiceDocument
                invoice={data.invoice}
                items={data.items}
                customer={data.customer}
                business={{
                  name: business.name,
                  address: business.address,
                  phone: business.phone,
                  email: business.email,
                  website: business.website,
                  taxNumber: business.taxNumber,
                  logoUrl,
                }}
              />
            </div>

            {/* Under-sheet actions */}
            <div className="no-print flex flex-wrap items-center justify-between gap-3 pb-2">
              <Button variant="ghost" size="sm" onClick={() => setDetailsOpen(true)}>
                View details & history
              </Button>
              <p className="text-xs text-muted-foreground">
                {data.invoice.status === "draft"
                  ? "Draft: edit from the invoice book before sending."
                  : data.invoice.status === "paid"
                    ? "Settled in full — nothing outstanding."
                    : data.invoice.amountPaidCents > 0
                      ? `${formatMoney(data.invoice.amountPaidCents)} received · ${formatMoney(Math.max(0, data.invoice.grandTotalCents - data.invoice.amountPaidCents))} still due`
                      : "Record payments as cash, MoMo or bank receipts come in."}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Details sheet */}
      {data && (
        <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
          <SheetContent className="w-full overflow-y-auto sm:max-w-md">
            <SheetHeader>
              <SheetTitle className="font-serif text-xl">
                {data.invoice.documentNumber}
              </SheetTitle>
              <SheetDescription>
                {data.customer?.name ?? "Unknown customer"}
                {data.sourceQuote
                  ? ` · converted from ${data.sourceQuote.documentNumber}`
                  : ""}
              </SheetDescription>
            </SheetHeader>
            <div className="mt-4 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-md border p-2">
                  <div className="ledger-label text-muted-foreground">Status</div>
                  <div className="mt-1 font-serif font-semibold capitalize">
                    {statusLabel}
                  </div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="ledger-label text-muted-foreground">Total</div>
                  <div className="mt-1 font-mono font-semibold">
                    {formatMoney(data.invoice.grandTotalCents, { compact: true })}
                  </div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="ledger-label text-muted-foreground">Paid</div>
                  <div className="mt-1 font-mono text-xs">
                    {formatMoney(data.invoice.amountPaidCents, { compact: true })}
                  </div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="ledger-label text-muted-foreground">Due by</div>
                  <div className="mt-1 font-mono text-xs">
                    {formatDate(data.invoice.dueDate)}
                  </div>
                </div>
              </div>

              {(data.invoice.sentAt || data.invoice.cancelledAt) && (
                <div className="rounded-md border bg-card/60 p-3 text-xs leading-5 text-muted-foreground">
                  {data.invoice.sentAt && (
                    <div>Sent · {formatDate(data.invoice.sentAt)}</div>
                  )}
                  {data.invoice.cancelledAt && (
                    <div>Cancelled · {formatDate(data.invoice.cancelledAt)}</div>
                  )}
                </div>
              )}

              {/* Payment history */}
              <div>
                <div className="ledger-label mb-2 text-muted-foreground">
                  Payments received
                </div>
                {payments === undefined ? null : payments.length === 0 ? (
                  <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                    Nothing recorded yet.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {payments.map((payment) => (
                      <li
                        key={payment._id}
                        className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-medium">
                            {PAYMENT_METHOD_LABELS[payment.method]}
                            {payment.reference ? ` · ${payment.reference}` : ""}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {formatDate(payment.paymentDate)}
                          </div>
                        </div>
                        <span className="font-mono text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                          +{formatMoney(payment.amountCents, { compact: true })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {(data.invoice.status === "draft" ||
                data.invoice.status === "sent" ||
                data.invoice.status === "partially_paid" ||
                data.invoice.status === "overdue") && (
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <div className="font-medium">
                      {data.invoice.status === "draft"
                        ? "Delete draft"
                        : "Cancel invoice"}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {data.invoice.status === "draft"
                        ? "Drafts leave no trace in the numbering trail."
                        : "Cancelled invoices stay on file for the audit trail."}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    aria-label={
                      data.invoice.status === "draft"
                        ? "Delete draft"
                        : "Cancel invoice"
                    }
                    onClick={
                      data.invoice.status === "draft"
                        ? handleDelete
                        : () => changeStatus("cancelled")
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>
      )}

      {data && (
        <RecordPaymentDialog
          open={payDialogOpen}
          onOpenChange={setPayDialogOpen}
          preselectedInvoiceId={data.invoice._id}
        />
      )}
    </AppShell>
  );
}
