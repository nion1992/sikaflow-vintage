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
import { Separator } from "@/components/ui/separator";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import AppShell from "@/components/AppShell";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useBusiness } from "@/hooks/use-business";
import { useUsage } from "@/hooks/use-usage";
import UpgradeDialog from "@/components/UpgradeDialog";
import {
  computeTotals,
  formatMoney,
  formatDate,
  toDateInputValue,
  fromDateInputValue,
} from "@/lib/money";
import { useQuery, useMutation } from "convex/react";
import { toast } from "sonner";
import {
  Copy,
  ExternalLink,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  ReceiptText,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";

type InvoiceId = Id<"invoices">;
type CustomerId = Id<"customers">;
type ProductId = Id<"products">;
type InvoiceStatus =
  | "draft"
  | "sent"
  | "partially_paid"
  | "paid"
  | "overdue"
  | "cancelled";

const STATUS_META: Record<
  InvoiceStatus,
  { label: string; className: string }
> = {
  draft: {
    label: "Draft",
    className: "border-border/60 bg-muted/40 text-muted-foreground",
  },
  sent: {
    label: "Sent",
    className: "border-primary/30 bg-primary/10 text-primary",
  },
  partially_paid: {
    label: "Partly paid",
    className:
      "border-amber-700/30 bg-amber-700/10 text-amber-800 dark:text-amber-300",
  },
  paid: {
    label: "Paid",
    className:
      "border-emerald-700/30 bg-emerald-700/10 text-emerald-300 dark:text-emerald-300",
  },
  overdue: {
    label: "Overdue",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  cancelled: {
    label: "Cancelled",
    className: "border-border/60 bg-muted/40 text-muted-foreground line-through",
  },
};

const MS_PER_DAY = 86_400_000;

/* ── Line draft state (percent inputs, converted to bps on save) ─── */

interface DraftLine {
  key: number;
  productId: ProductId | null;
  name: string;
  description: string;
  quantity: string;
  unit: string;
  price: string;
  discountPercent: string;
  vatPercent: string; // "" = business default
}

let lineKeySeq = 1;

function emptyLine(defaultVatPercent: string): DraftLine {
  return {
    key: lineKeySeq++,
    productId: null,
    name: "",
    description: "",
    quantity: "1",
    unit: "each",
    price: "",
    discountPercent: "0",
    vatPercent: defaultVatPercent,
  };
}

function parsePercent(input: string): number | null {
  const trimmed = input.trim().replace("%", "");
  if (!trimmed) return null;
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const value = parseFloat(trimmed);
  if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  return value;
}

function percentToBps(input: string): number {
  const parsed = parsePercent(input);
  if (parsed === null) return 0;
  return Math.round(parsed * 100);
}

function bpsToPercentInput(bps: number): string {
  return String(bps / 100);
}

/* ── Invoice builder dialog ──────────────────────────────────────── */

function InvoiceBuilderDialog({
  open,
  onOpenChange,
  editingInvoiceId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingInvoiceId: InvoiceId | null;
}) {
  const { settings } = useBusiness();
  const createInvoice = useMutation(api.invoices.create);
  const updateInvoice = useMutation(api.invoices.update);

  const customersResult = useQuery(
    api.customers.list,
    open ? { pageSize: 200 } : "skip",
  );
  const products = useQuery(
    api.products.list,
    open ? { activeOnly: true } : "skip",
  );
  const existing = useQuery(
    api.invoices.get,
    open && editingInvoiceId ? { id: editingInvoiceId } : "skip",
  );

  const defaultVatPercent = bpsToPercentInput(
    settings?.defaultTaxRateBps ?? 1500,
  );
  const termsDays = settings?.defaultPaymentTermsDays ?? 30;

  const [customerId, setCustomerId] = useState<CustomerId | "">("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");

  const defaultNotes = settings?.defaultNotes ?? "";
  const defaultTerms = settings?.defaultTerms ?? "";

  // Seed the builder once per open/editing target. When editing, wait until
  // the invoice query has resolved so we never seed a fresh form by mistake.
  const seedReady = open && (editingInvoiceId === null || existing !== undefined);
  if (seedReady && loadedFor !== (editingInvoiceId ?? "new")) {
    const key = editingInvoiceId ?? "new";
    setLoadedFor(key);
    setError(null);
    if (editingInvoiceId && existing) {
      setCustomerId(existing.invoice.customerId);
      setInvoiceDate(toDateInputValue(existing.invoice.invoiceDate));
      setDueDate(toDateInputValue(existing.invoice.dueDate));
      setLines(
        existing.items.map((item) => ({
          key: lineKeySeq++,
          productId: item.productId ?? null,
          name: item.name,
          description: item.description ?? "",
          quantity: String(item.quantity),
          unit: item.unit ?? "",
          price: (item.unitPriceCents / 100).toString(),
          discountPercent: bpsToPercentInput(item.discountBps),
          vatPercent: bpsToPercentInput(item.taxRateBps),
        })),
      );
      setNotes(existing.invoice.notes ?? "");
      setTerms(existing.invoice.terms ?? "");
    } else {
      const today = new Date();
      setCustomerId("");
      setInvoiceDate(toDateInputValue(today));
      setDueDate(
        toDateInputValue(new Date(today.getTime() + termsDays * MS_PER_DAY)),
      );
      setLines([emptyLine(defaultVatPercent)]);
      setNotes(defaultNotes);
      setTerms(defaultTerms);
    }
  }

  const filteredProducts = useMemo(() => {
    const list = products ?? [];
    const needle = productSearch.trim().toLowerCase();
    if (!needle) return list.slice(0, 8);
    return list
      .filter((p) => p.name.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [products, productSearch]);

  const totals = useMemo(() => {
    const parsed = lines.map((line) => {
      const quantity = parseFloat(line.quantity);
      const unitPriceCents = Math.round(
        parseFloat(line.price.replace(/,/g, "")) * 100,
      );
      const discountPercent = parsePercent(line.discountPercent) ?? 0;
      const vatPercent =
        line.vatPercent === ""
          ? parseFloat(defaultVatPercent)
          : (parsePercent(line.vatPercent) ?? 0);
      return {
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 0,
        unitPriceCents: Number.isFinite(unitPriceCents) ? unitPriceCents : 0,
        discountPercent,
        taxPercent: Number.isFinite(vatPercent) ? vatPercent : 0,
      };
    });
    return computeTotals(parsed);
  }, [lines, defaultVatPercent]);

  const updateLine = (key: number, patch: Partial<DraftLine>) => {
    setLines((prev) =>
      prev.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  };

  const removeLine = (key: number) => {
    setLines((prev) =>
      prev.length > 1 ? prev.filter((line) => line.key !== key) : prev,
    );
  };

  const pickProduct = (product: {
    _id: ProductId;
    name: string;
    unit?: string;
    unitPriceCents: number;
    taxRateBps?: number;
  }) => {
    const vatPercent =
      product.taxRateBps !== undefined
        ? bpsToPercentInput(product.taxRateBps)
        : "";
    setLines((prev) => [
      ...prev,
      {
        key: lineKeySeq++,
        productId: product._id,
        name: product.name,
        description: "",
        quantity: "1",
        unit: product.unit ?? "each",
        price: (product.unitPriceCents / 100).toString(),
        discountPercent: "0",
        vatPercent,
      },
    ]);
    setSearchOpen(false);
    setProductSearch("");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!customerId) {
      setError("Choose a customer first.");
      return;
    }
    if (!invoiceDate || !dueDate) {
      setError("Set both the invoice and due dates.");
      return;
    }

    const payloadLines = lines.map((line) => {
      const quantity = parseFloat(line.quantity);
      const unitPriceCents = Math.round(
        parseFloat(line.price.replace(/,/g, "")) * 100,
      );
      const taxPercent =
        line.vatPercent === ""
          ? parseFloat(defaultVatPercent)
          : (parsePercent(line.vatPercent) ?? 0);
      return {
        productId: line.productId ?? undefined,
        name: line.name.trim(),
        description: line.description.trim() || undefined,
        quantity: Number.isFinite(quantity) ? quantity : 0,
        unit: line.unit.trim() || undefined,
        unitPriceCents: Number.isFinite(unitPriceCents) ? unitPriceCents : -1,
        discountBps: percentToBps(line.discountPercent),
        taxRateBps: Math.round(taxPercent * 100),
      };
    });

    setIsSubmitting(true);
    try {
      if (editingInvoiceId) {
        await updateInvoice({
          id: editingInvoiceId,
          customerId,
          invoiceDate: fromDateInputValue(invoiceDate),
          dueDate: fromDateInputValue(dueDate),
          notes,
          terms,
          lines: payloadLines,
        });
        toast.success("Invoice updated.");
      } else {
        const result = await createInvoice({
          customerId,
          invoiceDate: fromDateInputValue(invoiceDate),
          dueDate: fromDateInputValue(dueDate),
          notes,
          terms,
          lines: payloadLines,
        });
        toast.success(`Invoice ${result.documentNumber} created.`);
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the invoice.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">
            {editingInvoiceId
              ? `Edit ${existing?.invoice.documentNumber ?? "invoice"}`
              : "New invoice"}
          </DialogTitle>
          <DialogDescription>
            Same quick builder as quotations — pick a customer, add lines,
            totals take care of themselves.
          </DialogDescription>
        </DialogHeader>

        {!settings ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading your settings…
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Customer + dates */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Customer *</Label>
                <Select
                  value={customerId || undefined}
                  onValueChange={(v) => setCustomerId(v as CustomerId)}
                  disabled={isSubmitting}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose from the customer book" />
                  </SelectTrigger>
                  <SelectContent>
                    {(customersResult?.customers ?? []).map((customer) => (
                      <SelectItem key={customer._id} value={customer._id}>
                        {customer.name}
                        {customer.company ? ` — ${customer.company}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {customersResult && customersResult.customers.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Your customer book is empty — add a customer first.
                  </p>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="invoice-date">Invoice date</Label>
                  <Input
                    id="invoice-date"
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="due-date">
                    Due by ({termsDays}-day terms)
                  </Label>
                  <Input
                    id="due-date"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Lines */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Line items</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSearchOpen((v) => !v)}
                  >
                    <Search className="mr-2 size-4" />
                    From register
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setLines((prev) => [...prev, emptyLine(defaultVatPercent)])
                    }
                  >
                    <Plus className="mr-2 size-4" />
                    Blank line
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Close item picker"
                    onClick={() => setSearchOpen(false)}
                    className={searchOpen ? "" : "hidden"}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              </div>

              {searchOpen && (
                <div className="rounded-md border bg-glass/50 p-3">
                  <Input
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Search the item register…"
                    className="mb-2"
                  />
                  {(products ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      The register is empty — add items under “Items”, or use a
                      blank line.
                    </p>
                  ) : filteredProducts.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No items match that search.
                    </p>
                  ) : (
                    <ul className="max-h-44 space-y-1 overflow-y-auto">
                      {filteredProducts.map((product) => (
                        <li key={product._id}>
                          <button
                            type="button"
                            className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                            onClick={() => pickProduct(product)}
                          >
                            <span className="truncate">{product.name}</span>
                            <span className="ml-2 shrink-0 font-mono text-xs text-muted-foreground">
                              {formatMoney(product.unitPriceCents, {
                                compact: true,
                              })}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="space-y-3">
                {lines.map((line, index) => {
                  const lineTotal = totals.lines[index]?.lineTotal ?? 0;
                  return (<div
                      key={line.key}
                      className="rounded-md border bg-glass/40 p-3">
                      <div className="flex items-center justify-between">
                        <span className="ledger-label text-muted-foreground">
                          Line {index + 1}
                          {line.productId ? " · from register" : ""}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove line ${index + 1}`}
                          onClick={() => removeLine(line.key)}
                          disabled={lines.length === 1}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-12">
                        <div className="space-y-1 sm:col-span-5">
                          <Label
                            htmlFor={`inv-line-name-${line.key}`}
                            className="text-xs"
                          >
                            Description
                          </Label>
                          <Input
                            id={`inv-line-name-${line.key}`}
                            value={line.name}
                            onChange={(e) =>
                              updateLine(line.key, { name: e.target.value })
                            }
                            disabled={isSubmitting}
                            placeholder="What are you billing for?"
                          />
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                          <Label
                            htmlFor={`inv-line-qty-${line.key}`}
                            className="text-xs"
                          >
                            Qty
                          </Label>
                          <Input
                            id={`inv-line-qty-${line.key}`}
                            type="number"
                            min="0"
                            step="any"
                            inputMode="decimal"
                            value={line.quantity}
                            onChange={(e) =>
                              updateLine(line.key, { quantity: e.target.value })
                            }
                            disabled={isSubmitting}
                          />
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                          <Label
                            htmlFor={`inv-line-price-${line.key}`}
                            className="text-xs"
                          >
                            Price (E)
                          </Label>
                          <Input
                            id={`inv-line-price-${line.key}`}
                            inputMode="decimal"
                            value={line.price}
                            onChange={(e) =>
                              updateLine(line.key, { price: e.target.value })
                            }
                            disabled={isSubmitting}
                            placeholder="0.00"
                          />
                        </div>
                        <div className="space-y-1 sm:col-span-1">
                          <Label
                            htmlFor={`inv-line-disc-${line.key}`}
                            className="text-xs"
                          >
                            Disc %
                          </Label>
                          <Input
                            id={`inv-line-disc-${line.key}`}
                            inputMode="decimal"
                            value={line.discountPercent}
                            onChange={(e) =>
                              updateLine(line.key, {
                                discountPercent: e.target.value,
                              })
                            }
                            disabled={isSubmitting}
                          />
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                          <Label
                            htmlFor={`inv-line-vat-${line.key}`}
                            className="text-xs"
                          >
                            VAT %
                          </Label>
                          <Input
                            id={`inv-line-vat-${line.key}`}
                            inputMode="decimal"
                            value={line.vatPercent}
                            onChange={(e) =>
                              updateLine(line.key, {
                                vatPercent: e.target.value,
                              })
                            }
                            disabled={isSubmitting}
                            placeholder={defaultVatPercent}
                          />
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                        <Input
                          value={line.unit}
                          onChange={(e) =>
                            updateLine(line.key, { unit: e.target.value })
                          }
                          disabled={isSubmitting}
                          className="h-7 w-24 text-xs"
                          aria-label={`Unit for line ${index + 1}`}
                        />
                        <span className="font-mono">
                          {formatMoney(lineTotal)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* Notes + terms */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="invoice-notes">Notes to customer</Label>
                <Textarea
                  id="invoice-notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={isSubmitting}
                  placeholder="Bank details, MoMo number…"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invoice-terms">Terms</Label>
                <Textarea
                  id="invoice-terms"
                  rows={3}
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  disabled={isSubmitting}
                  placeholder="Payment and delivery terms…"
                />
              </div>
            </div>

            {/* Totals */}
            <div className="ledger-lines rounded-md border bg-glass/50 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-mono">{formatMoney(totals.subtotal)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Discounts</span>
                <span className="font-mono">
                  −{formatMoney(totals.discountTotal)}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">VAT</span>
                <span className="font-mono">{formatMoney(totals.taxTotal)}</span>
              </div>
              <Separator className="my-2" />
              <div className="flex items-center justify-between">
                <span className="font-serif font-bold">Total</span>
                <span className="font-mono text-lg font-bold">
                  {formatMoney(totals.grandTotal)}
                </span>
              </div>
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
                {editingInvoiceId ? "Save changes" : "Create invoice"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── Status control (row action) ─────────────────────────────────── */

function StatusSelect({
  invoiceId,
  status,
  disabled,
}: {
  invoiceId: InvoiceId;
  status: InvoiceStatus;
  disabled?: boolean;
}) {
  const setStatus = useMutation(api.invoices.setStatus);
  const [isPending, setIsPending] = useState(false);

  const allowed: InvoiceStatus[] =
    status === "draft"
      ? ["sent", "cancelled"]
      : status === "sent" || status === "partially_paid" || status === "overdue"
        ? ["paid", "cancelled"]
        : [];

  const handleChange = async (next: InvoiceStatus) => {
    setIsPending(true);
    try {
      await setStatus({ id: invoiceId, status: next });
      toast.success(`Marked as ${STATUS_META[next].label.toLowerCase()}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update.");
    } finally {
      setIsPending(false);
    }
  };

  if (allowed.length === 0) {
    return (
      <Badge variant="outline" className={STATUS_META[status].className}>
        {STATUS_META[status].label}
      </Badge>
    );
  }

  return (
    <Select
      value={status}
      onValueChange={(v) => handleChange(v as InvoiceStatus)}
      disabled={disabled || isPending}
    >
      <SelectTrigger
        className={`h-8 w-auto gap-1.5 border px-2.5 text-xs ${STATUS_META[status].className}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={status}>{STATUS_META[status].label}</SelectItem>
        <SelectSeparator />
        {allowed
          .filter((s) => s !== status)
          .map((s) => (
            <SelectItem key={s} value={s}>
              {STATUS_META[s].label}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}

/* ── Page ────────────────────────────────────────────────────────── */

export default function Invoices() {
  const { hasBusiness } = useBusiness();
  const { canCreate } = useUsage();
  const navigate = useNavigate();
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "all">("all");
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingInvoiceId, setEditingInvoiceId] = useState<InvoiceId | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: InvoiceId;
    number: string;
  } | null>(null);

  const duplicateInvoice = useMutation(api.invoices.duplicate);
  const removeInvoice = useMutation(api.invoices.remove);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const result = useQuery(
    api.invoices.list,
    hasBusiness
      ? {
          search: search || undefined,
          status: statusFilter === "all" ? undefined : statusFilter,
        }
      : "skip",
  );

  const invoices = result?.invoices ?? [];
  const counts = result?.counts;

  const requireQuota = () => {
    if (!canCreate) {
      setUpgradeOpen(true);
      return false;
    }
    return true;
  };

  const handleDuplicate = async (id: InvoiceId) => {
    if (!requireQuota()) return;
    setIsDuplicating(true);
    try {
      const res = await duplicateInvoice({ id });
      toast.success(`Created draft ${res.documentNumber}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not duplicate.");
    } finally {
      setIsDuplicating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await removeInvoice({ id: deleteTarget.id });
      toast.success(`Invoice ${deleteTarget.number} removed.`);
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
              SikaFlow · The invoice book
            </div>
            <h1 className="letterpress mt-1 font-serif text-2xl font-bold tracking-tight sm:text-3xl">
              Invoices
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {result
                ? `${result.total} ${result.total === 1 ? "invoice" : "invoices"} on file`
                : "Loading…"}
            </p>
          </div>
          <Button
            onClick={() => {
              if (!requireQuota()) return;
              setEditingInvoiceId(null);
              setBuilderOpen(true);
            }}
          >
            <Plus className="mr-2 size-4" />
            New invoice
          </Button>
        </header>

        {/* Money summary */}
        {result && (
          <div className="grid grid-cols-2 gap-3">
            <Card className="glass glass-card paper-card border-border/60 bg-glass/40 p-4 shadow-lg">
              <CardContent className="p-4">
                <div className="ledger-label text-muted-foreground">
                  Outstanding
                </div>
                <div
                  className={`mt-1 font-mono text-lg font-bold ${
                    result.outstandingCents > 0 ? "text-destructive" : ""
                  }`}
                >
                  {formatMoney(result.outstandingCents, { compact: true })}
                </div>
              </CardContent>
            </Card>
            <Card className="glass glass-card paper-card border-border/60 bg-glass/40 p-4 shadow-lg">
              <CardContent className="p-4">
                <div className="ledger-label text-muted-foreground">
                  Collected
                </div><div className="mt-1 font-mono text-lg font-bold text-foreground">
                  {formatMoney(result.paidCents, { compact: true })}</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Search + status filter */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by number or customer…"
              className="pl-9"
              aria-label="Search invoices"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as InvoiceStatus | "all")}
          >
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {(Object.keys(STATUS_META) as InvoiceStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_META[s].label}
                  {counts ? ` (${counts[s]})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* List */}
        {!result ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="mr-2 size-5 animate-spin" />
            Opening the invoice book…
          </div>
        ) : invoices.length === 0 ? (
          <Card className="glass glass-card paper-card parchment-edge border-border/60 border-dashed bg-glass/40 p-6 shadow-xl backdrop-blur-md">
            <CardHeader className="items-center text-center">
              <div className="stamp mx-auto flex size-14 items-center justify-center rounded-full text-primary/70">
                <ReceiptText className="size-7" />
              </div>
              <CardTitle className="font-serif text-lg">
                {search || statusFilter !== "all"
                  ? "Nothing matches"
                  : "No invoices yet"}
              </CardTitle>
              <CardDescription>
                {search || statusFilter !== "all"
                  ? "Try a different search or status."
                  : "Create one from scratch, or accept a quotation and convert it in one tap."}
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <ul className="space-y-3">
            {invoices.map((invoice) => {
              const balance = Math.max(
                0,
                invoice.grandTotalCents - invoice.amountPaidCents,
              );
              return (
                <li
                  key={invoice._id}
                  className="animate-fade-in-up"
                  style={{ animationDelay: `${Math.min(invoices.indexOf(invoice), 8) * 50}ms` }}
                >
                  <Card className="glass glass-card paper-card border-border/60 bg-glass/40 p-4 shadow-lg">
                    <CardContent className="p-4">
                      <div className="flex flex-wrap items-start gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
                          <ReceiptText className="size-5" />
                        </div>

                        {/* Signature status flow: draft -> sent -> partially_paid -> paid -> overdue/cancelled */}
                        <div className="flex shrink-0 items-center gap-2">
                          {([
                            "draft",
                            "sent",
                            "partially_paid",
                            "paid",
                          ] as const).map((step, index) => {
                            const done =
                              step === "draft"
                                ? invoice.status === "draft"
                                : step === "sent"
                                  ? invoice.status === "sent"
                                  : step === "partially_paid"
                                    ? invoice.status === "partially_paid"
                                    : invoice.status === "paid";
                            return (
                              <div key={step} className="flex items-center gap-1.5">
                                <span
                                  className={`flex h-2.5 w-2.5 items-center justify-center rounded-full border-2 ${done ? "border-foreground/50 bg-foreground" : "border-border/40 bg-background"}`}
                                  style={{ animation: done ? "none" : "fade-in var(--duration-fast) var(--ease-out) both" }}
                                >
                                  {done && <span className="h-0.5 w-0.5 rounded-full bg-foreground" />}
                                </span>
                                {index < 3 && (
                                  <span
                                    className={`h-0.5 flex-1 rounded ${done ? "bg-foreground/40" : "bg-border/30"}`}
                                    style={{ animation: done ? "none" : "fade-in var(--duration-fast) var(--ease-out) both", animationDelay: `${index * 40}ms` }}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              to={`/invoices/${invoice._id}`}
                              className="font-mono text-sm font-semibold underline-offset-2 hover:underline"
                            >
                              {invoice.documentNumber}
                            </Link>
                            <StatusSelect
                              invoiceId={invoice._id}
                              status={invoice.status}
                            />
                          </div>
                          <div className="mt-0.5 truncate text-sm text-muted-foreground">
                            {invoice.customerName} ·{" "}
                            {formatDate(invoice.invoiceDate)} · due{" "}
                            {formatDate(invoice.dueDate)}
                          </div>
                        </div>
                        <div className="ml-auto text-right">
                          <div className="font-mono text-base font-bold">
                            {formatMoney(invoice.grandTotalCents, {
                              compact: true,
                            })}
                          </div>
                          <div className="ledger-label text-muted-foreground">
                            {invoice.amountPaidCents > 0
                              ? `${formatMoney(balance, { compact: true })} due`
                              : "total"}
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="mt-1 size-7"
                                aria-label={`Actions for ${invoice.documentNumber}`}
                              >
                                <MoreVertical className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() =>
                                  navigate(`/invoices/${invoice._id}`)
                                }
                              >
                                <ExternalLink className="mr-2 size-4" /> View &
                                share
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={invoice.status !== "draft"}
                                onClick={() => {
                                  setEditingInvoiceId(invoice._id);
                                  setBuilderOpen(true);
                                }}
                              >
                                <Pencil className="mr-2 size-4" /> Edit draft
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={isDuplicating}
                                onClick={() => handleDuplicate(invoice._id)}
                              >
                                <Copy className="mr-2 size-4" /> Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                disabled={isDeleting || invoice.status !== "draft"}
                                onClick={() =>
                                  setDeleteTarget({
                                    id: invoice._id,
                                    number: invoice.documentNumber,
                                  })
                                }
                              >
                                <Trash2 className="mr-2 size-4" /> Delete draft
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <InvoiceBuilderDialog
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        editingInvoiceId={editingInvoiceId}
      />

      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">
              Remove invoice {deleteTarget?.number}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Only drafts can be removed. Issued invoices should be cancelled so
              the numbering trail stays intact.
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
              Remove invoice
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
