import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import QuoteDocument from "@/components/QuoteDocument";
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
  ExternalLink,
  Loader2,
  MessageCircle,
  Printer,
  ReceiptText,
  Trash2,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";

/** Compose a friendly WhatsApp message summarising the quote. */
function buildWhatsAppText(
  documentNumber: string,
  businessName: string,
  customerName: string,
  grandTotalCents: number,
  expiryDate: number,
): string {
  return [
    `Hello ${customerName},`,
    "",
    `Please find your quotation ${documentNumber} from ${businessName}:`,
    `Total: ${formatMoney(grandTotalCents)}`,
    `Valid until: ${formatDate(expiryDate)}`,
    "",
    "The full document is attached as a PDF. Reply here if you would like any changes.",
    "",
    `— ${businessName}`,
  ].join("\n");
}

export default function QuotePreview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { business, logoUrl } = useBusiness();

  const data = useQuery(
    api.quotes.get,
    id ? { id: id as Id<"quotes"> } : "skip",
  );
  const setStatus = useMutation(api.quotes.setStatus);
  const removeQuote = useMutation(api.quotes.remove);
  const convertQuote = useMutation(api.invoices.convertQuote);

  // When converted, fetch the resulting invoice to link to it
  const converted = useQuery(
    api.invoices.get,
    data?.quote.convertedInvoiceId
      ? { id: data.quote.convertedInvoiceId }
      : "skip",
  );

  const [isMarkingSent, setIsMarkingSent] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const handleMarkSent = async () => {
    if (!data) return;
    setIsMarkingSent(true);
    try {
      await setStatus({ id: data.quote._id, status: "sent" });
      toast.success("Quotation marked as sent.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update.");
    } finally {
      setIsMarkingSent(false);
    }
  };

  const handleConvert = async () => {
    if (!data) return;
    setIsMarkingSent(true);
    try {
      const res = await convertQuote({ quoteId: data.quote._id });
      toast.success(`Invoice ${res.documentNumber} created.`);
      navigate(`/invoices/${res.invoiceId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not convert.");
    } finally {
      setIsMarkingSent(false);
    }
  };

  const handleCopy = async () => {
    if (!data || !business) return;
    const text = buildWhatsAppText(
      data.quote.documentNumber,
      business.name,
      data.customer?.name ?? "Customer",
      data.quote.grandTotalCents,
      data.quote.expiryDate,
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
      data.quote.documentNumber,
      business.name,
      data.customer?.name ?? "Customer",
      data.quote.grandTotalCents,
      data.quote.expiryDate,
    );
    setIsSharing(true);
    try {
      const outcome = await shareDocumentOnWhatsApp({
        sheet: document.querySelector<HTMLElement>(".quote-sheet"),
        logoUrl: logoUrl ?? undefined,
        filename: `${data.quote.documentNumber.replace(/[^\w.-]+/g, "-")}.pdf`,
        text,
      });
      // First share is as good a moment as any to consider it sent
      // — but never when the user backed out of the share sheet.
      if (outcome !== "cancelled" && data.quote.status === "draft") {
        void setStatus({ id: data.quote._id, status: "sent" }).catch(() => {});
      }
      // First share is as good a moment as any to consider it sent
      // — but never when the user backed out of the share sheet.
      if (outcome !== "cancelled" && data.quote.status === "draft") {
        void setStatus({ id: data.quote._id, status: "sent" }).catch(() => {});
      }
    } finally {
      setIsSharing(false);
    }
  };

  const handleDelete = async () => {
    if (!data) return;
    try {
      await removeQuote({ id: data.quote._id });
      toast.success(`Quotation ${data.quote.documentNumber} removed.`);
      navigate("/quotes");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete.");
    }
  };

  return (
    <AppShell>
      <div className="flex flex-col gap-5">
        {/* Toolbar */}
        <div className="no-print flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="icon" aria-label="Back to quotations">
              <Link to="/quotes">
                <ArrowLeft className="size-5" />
              </Link>
            </Button>
            <div>
              <div className="ledger-label text-muted-foreground">
                The quotation book
              </div>
              <h1 className="font-serif text-xl font-bold tracking-tight">
                {data ? data.quote.documentNumber : "Quotation"}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {data?.quote.status === "draft" && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleMarkSent}
                disabled={isMarkingSent || !data}
              >
                {isMarkingSent ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <BadgeCheck className="mr-2 size-4" />
                )}
                Mark as sent
              </Button>
            )}
            {data &&
              data.quote.status !== "draft" &&
              data.quote.status !== "rejected" &&
              data.quote.status !== "expired" &&
              data.quote.convertedInvoiceId === undefined && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleConvert}
                  disabled={isMarkingSent}
                >
                  {isMarkingSent ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <ReceiptText className="mr-2 size-4" />
                  )}
                  Convert to invoice
                </Button>
              )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              disabled={!data}
            >
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
              <QuoteDocument
                quote={data.quote}
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
                <ExternalLink className="mr-2 size-4" />
                View details & status
              </Button>
              {data.quote.status !== "draft" ? (
                <p className="text-xs text-muted-foreground">
                  Sent quotations are locked — duplicate from the list to revise.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Draft: edit it from the quotation book.
                </p>
              )}
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
                {data.quote.documentNumber}
              </SheetTitle>
              <SheetDescription>
                {data.customer?.name ?? "Unknown customer"}
              </SheetDescription>
            </SheetHeader>
            <div className="mt-4 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-md border p-2">
                  <div className="ledger-label text-muted-foreground">Status</div>
                  <div className="mt-1 font-serif font-semibold capitalize">
                    {data.quote.status}
                  </div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="ledger-label text-muted-foreground">Total</div>
                  <div className="mt-1 font-mono font-semibold">
                    {formatMoney(data.quote.grandTotalCents, { compact: true })}
                  </div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="ledger-label text-muted-foreground">Issued</div>
                  <div className="mt-1 font-mono text-xs">
                    {formatDate(data.quote.quoteDate)}
                  </div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="ledger-label text-muted-foreground">Expires</div>
                  <div className="mt-1 font-mono text-xs">
                    {formatDate(data.quote.expiryDate)}
                  </div>
                </div>
              </div>
              {(data.quote.sentAt || data.quote.acceptedAt || data.quote.rejectedAt) && (
                <div className="rounded-md border bg-card/60 p-3 text-xs leading-5 text-muted-foreground">
                  {data.quote.sentAt && (
                    <div>Sent · {formatDate(data.quote.sentAt)}</div>
                  )}
                  {data.quote.acceptedAt && (
                    <div>Accepted · {formatDate(data.quote.acceptedAt)}</div>
                  )}
                  {data.quote.rejectedAt && (
                    <div>Rejected · {formatDate(data.quote.rejectedAt)}</div>
                  )}
                </div>
              )}

              {converted && (
                <Link
                  to={`/invoices/${converted.invoice._id}`}
                  className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 p-3 text-sm transition-colors hover:bg-primary/10"
                >
                  <span>
                    Invoice on file
                    <span className="ml-2 font-mono text-xs">
                      {converted.invoice.documentNumber}
                    </span>
                  </span>
                  <ExternalLink className="size-4 text-primary" />
                </Link>
              )}
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <div className="font-medium">Delete quotation</div>
                  <p className="text-xs text-muted-foreground">
                    Hidden from the book; numbering unaffected.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  aria-label="Delete quotation"
                  onClick={handleDelete}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </AppShell>
  );
}
