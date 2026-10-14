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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import AppShell from "@/components/AppShell";
import { useBusiness } from "@/hooks/use-business";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/convex/shared";
import { formatMoney, formatDate, toDateInputValue, fromDateInputValue } from "@/lib/money";
import { useQuery, useMutation } from "convex/react";
import { toast } from "sonner";
import {
  Banknote,
  CircleDollarSign,
  CreditCard,
  Landmark,
  Loader2,
  Plus,
  Search,
  Smartphone,
} from "lucide-react";
import { Link } from "react-router";
import { useState } from "react";

const METHOD_ICON: Record<PaymentMethod, typeof Banknote> = {
  cash: Banknote,
  bank_transfer: Landmark,
  mobile_money: Smartphone,
  card: CreditCard,
  other: CircleDollarSign,
};

const METHODS = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[];

function MethodBadge({ method }: { method: PaymentMethod }) {
  const Icon = METHOD_ICON[method];
  return (
    <Badge variant="outline" className="gap-1.5 font-normal">
      <Icon className="size-3.5" />
      {PAYMENT_METHOD_LABELS[method]}
    </Badge>
  );
}

/* ── Record payment dialog ───────────────────────────────────────── */

export function RecordPaymentDialog({
  open,
  onOpenChange,
  preselectedInvoiceId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedInvoiceId: Id<"invoices"> | null;
}) {
  const createPayment = useMutation(api.payments.create);
  const invoicesResult = useQuery(
    api.invoices.list,
    open ? {} : "skip",
  );

  // Invoices that can receive payments
  const openInvoices = (invoicesResult?.invoices ?? []).filter(
    (i) =>
      i.status === "sent" ||
      i.status === "partially_paid" ||
      i.status === "overdue",
  );

  const [invoiceId, setInvoiceId] = useState<Id<"invoices"> | "">("");
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(
    toDateInputValue(new Date()),
  );
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const seedKey = open ? (preselectedInvoiceId ?? "new") : null;
  if (open && seedKey && loadedFor !== seedKey) {
    setLoadedFor(seedKey);
    setError(null);
    setInvoiceId(preselectedInvoiceId ?? "");
    setAmount("");
    setPaymentDate(toDateInputValue(new Date()));
    setMethod("cash");
    setReference("");
    setNotes("");
  }

  const selected = openInvoices.find((i) => i._id === invoiceId);
  const balanceCents = selected
    ? Math.max(0, selected.grandTotalCents - selected.amountPaidCents)
    : null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!invoiceId) {
      setError("Choose the invoice that was paid.");
      return;
    }
    const trimmed = amount.trim().replace(/^E\s*/i, "").replace(/,/g, "");
    if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
      setError("Enter an amount like 150 or 150.50.");
      return;
    }
    const [whole, frac = ""] = trimmed.split(".");
    const amountCents =
      parseInt(whole, 10) * 100 + parseInt((frac + "00").slice(0, 2), 10);
    if (amountCents <= 0) {
      setError("The amount must be more than zero.");
      return;
    }
    if (selected && amountCents > balanceCents!) {
      setError(
        `That is more than the outstanding ${formatMoney(balanceCents!)}.`,
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createPayment({
        invoiceId,
        paymentDate: fromDateInputValue(paymentDate),
        amountCents,
        method,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      toast.success(
        res.invoiceStatus === "paid"
          ? "Payment recorded — invoice settled in full. 🎉"
          : "Payment recorded.",
      );
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record the payment.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">
            Record a payment
          </DialogTitle>
          <DialogDescription>
            Cash, MoMo or bank — write it into the register and the invoice
            balance updates itself.
          </DialogDescription>
        </DialogHeader>

        {open && invoicesResult && openInvoices.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            No invoices are awaiting payment. Issue an invoice first — then
            record what comes in.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Invoice *</Label>
              <Select
                value={invoiceId || undefined}
                onValueChange={(v) => {
                  setInvoiceId(v as Id<"invoices">);
                  setAmount("");
                }}
                disabled={isSubmitting}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose an invoice" />
                </SelectTrigger>
                <SelectContent>
                  {openInvoices.map((invoice) => (
                    <SelectItem key={invoice._id} value={invoice._id}>
                      {invoice.documentNumber} · {invoice.customerName} ·{" "}
                      {formatMoney(
                        Math.max(
                          0,
                          invoice.grandTotalCents - invoice.amountPaidCents,
                        ),
                        { compact: true },
                      )}{" "}
                      due
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {balanceCents !== null && (
              <div className="flex items-center justify-between rounded-md border bg-glass/50 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Outstanding</span>
                <span className="font-mono font-semibold">
                  {formatMoney(balanceCents)}
                </span>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pay-amount">Amount (E) *</Label>
                <Input
                  id="pay-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={isSubmitting}
                  placeholder="0.00"
                />
                {balanceCents !== null && balanceCents > 0 && (
                  <button
                    type="button"
                    className="text-xs text-primary underline-offset-2 hover:underline"
                    onClick={() =>
                      setAmount((balanceCents / 100).toFixed(2))
                    }
                  >
                    Full balance ({formatMoney(balanceCents)})
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pay-date">Date received</Label>
                <Input
                  id="pay-date"
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Method</Label>
              <Select
                value={method}
                onValueChange={(v) => setMethod(v as PaymentMethod)}
                disabled={isSubmitting}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {PAYMENT_METHOD_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pay-reference">Reference (optional)</Label>
              <Input
                id="pay-reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                disabled={isSubmitting}
                placeholder="MoMo txn ID, cheque no…"
                maxLength={60}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pay-notes">Notes (optional)</Label>
              <Textarea
                id="pay-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={isSubmitting}
                maxLength={300}
              />
            </div>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                )}
                Record payment
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── Page ────────────────────────────────────────────────────────── */

export default function Payments() {
  const { hasBusiness } = useBusiness();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [preselected, setPreselected] = useState<Id<"invoices"> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: Id<"payments">;
    amountLabel: string;
  } | null>(null);

  const result = useQuery(
    api.payments.list,
    hasBusiness ? { search: search || undefined } : "skip",
  );
  const removePayment = useMutation(api.payments.remove);
  const [isDeleting, setIsDeleting] = useState(false);

  const payments = result?.payments ?? [];

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await removePayment({ id: deleteTarget.id });
      toast.success("Payment removed — the invoice balance was restored.");
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="ledger-label text-muted-foreground">
              SikaFlow · The payment register
            </div>
            <h1 className="letterpress mt-1 font-serif text-2xl font-bold tracking-tight sm:text-3xl">
              Payments
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {result
                ? `${result.total} ${result.total === 1 ? "receipt" : "receipts"} on file`
                : "Loading…"}
            </p>
          </div>
          <Button
            onClick={() => {
              setPreselected(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="mr-2 size-4" />
            Record payment
          </Button>
        </header>

        {/* Money summary */}
        {result && (
          <div className="grid grid-cols-2 gap-3">
            <Card className="glass glass-card paper-card border shadow-lg border-border/60 bg-glass/40 p-4 shadow-lg">
              <CardContent className="p-4">
                <div className="ledger-label text-muted-foreground">
                  Collected all-time
                </div><div className="mt-1 font-mono text-lg font-bold text-foreground">
                  {formatMoney(result.totalCents, { compact: true })}</div>
              </CardContent>
            </Card>
            <Card className="glass glass-card paper-card border shadow-lg border-border/60 bg-glass/40 p-4 shadow-lg">
              <CardContent className="p-4">
                <div className="ledger-label text-muted-foreground">
                  This month
                </div><div className="mt-1 font-mono text-lg font-bold text-foreground">
                  {formatMoney(result.thisMonthCents, { compact: true })}</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoice, customer or reference…"
            className="pl-9"
            aria-label="Search payments"
          />
        </div>

        {/* Register */}
        {!result ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="mr-2 size-5 animate-spin" />
            Opening the register…
          </div>
        ) : payments.length === 0 ? (
          <Card className="glass glass-card paper-card parchment-edge border-border/60 border-dashed bg-glass/40 p-6 shadow-xl backdrop-blur-md">
            <CardHeader className="items-center text-center">
              <div className="stamp mx-auto flex size-14 items-center justify-center rounded-full text-primary/70">
                <Banknote className="size-7" />
              </div>
              <CardTitle className="font-serif text-lg">
                {search ? "Nothing matches" : "No payments recorded yet"}
              </CardTitle>
              <CardDescription>
                {search
                  ? "Try a different invoice number or reference."
                  : "When cash, MoMo or bank payments come in, record them here."}
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <ul className="space-y-3">
            {payments.map((payment) => (
              <li key={payment._id}>
                <Card className="glass glass-card paper-card border-border/60 p-4 shadow-lg bg-glass/40">
                  <CardContent className="flex flex-wrap items-start gap-3 p-4">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Banknote className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={`/invoices/${payment.invoiceId}`}
                          className="font-mono text-sm font-semibold underline-offset-2 hover:underline"
                        >
                          {payment.invoiceNumber}
                        </Link>
                        <MethodBadge method={payment.method} />
                      </div>
                      <div className="mt-0.5 truncate text-sm text-muted-foreground">
                        {payment.customerName} ·{" "}
                        {formatDate(payment.paymentDate)}
                        {payment.reference ? ` · ${payment.reference}` : ""}
                      </div>
                      {payment.notes && (
                        <p className="mt-1 text-xs text-muted-foreground/80">
                          {payment.notes}
                        </p>
                      )}
                    </div>
                    <div className="ml-auto text-right"><div className="font-mono text-base font-bold text-foreground">
                        +{formatMoney(payment.amountCents, { compact: true })}</div>
                      <button
                        className="ledger-label mt-1 text-muted-foreground/70 underline-offset-2 hover:text-destructive hover:underline"
                        onClick={() =>
                          setDeleteTarget({
                            id: payment._id,
                            amountLabel: formatMoney(payment.amountCents),
                          })
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>

      <RecordPaymentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        preselectedInvoiceId={preselected}
      />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">
              Remove this payment?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.amountLabel} will be struck from the register and
              the invoice balance restored. The entry is kept for your audit
              trail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {isDeleting && <Loader2 className="mr-2 size-4 animate-spin" />}
              Remove payment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
