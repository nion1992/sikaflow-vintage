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
  FileText,
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

type QuoteId = Id<"quotes">;
type CustomerId = Id<"customers">;
type ProductId = Id<"products">;
type QuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "expired";

const STATUS_META: Record<
  QuoteStatus,
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
  accepted: {
    label: "Accepted",
    className:
      "border-emerald-700/30 bg-emerald-700/10 text-emerald-300 dark:text-emerald-300",
  },
  rejected: {
    label: "Rejected",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  expired: {
    label: "Expired",
    className: "border-amber-700/30 bg-amber-700/10 text-amber-800 dark:text-amber-300",
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

/* ── Quote builder dialog ────────────────────────────────────────── */

interface BuilderProduct {
  _id: ProductId;
  name: string;
  unit?: string;
  unitPriceCents: number;
  taxRateBps?: number;
  active: boolean;
}

function QuoteBuilderDialog({
  open,
  onOpenChange,
  editingQuoteId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingQuoteId: QuoteId | null;
  onSaved?: () => void;
}) {
  const { settings } = useBusiness();
  const createQuote = useMutation(api.quotes.create);
  const updateQuote = useMutation(api.quotes.update);

  const customersResult = useQuery(
    api.customers.list,
    open ? { pageSize: 200 } : "skip",
  );
  const products = useQuery(
    api.products.list,
    open ? { activeOnly: true } : "skip",
  );
  const existing = useQuery(
    api.quotes.get,
    open && editingQuoteId ? { id: editingQuoteId } : "skip",
  );

  const defaultVatPercent = bpsToPercentInput(
    settings?.defaultTaxRateBps ?? 1500,
  );

  const [customerId, setCustomerId] = useState<CustomerId | "">("");
  const [quoteDate, setQuoteDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");

  const validityDays = settings?.defaultQuoteValidityDays ?? 14;
  const defaultNotes = settings?.defaultNotes ?? "";
  const defaultTerms = settings?.defaultTerms ?? "";

  // Seed the builder once per open/editing target. When editing, wait until
  // the quote query has resolved so we never seed a fresh form by mistake.
  const seedReady = open && (editingQuoteId === null || existing !== undefined);
  if (seedReady && loadedFor !== (editingQuoteId ?? "new")) {
    const key = editingQuoteId ?? "new";
    setLoadedFor(key);
    setError(null);
    if (editingQuoteId && existing) {
      setCustomerId(existing.quote.customerId);
      setQuoteDate(toDateInputValue(existing.quote.quoteDate));
      setExpiryDate(toDateInputValue(existing.quote.expiryDate));
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
      setNotes(existing.quote.notes ?? "");
      setTerms(existing.quote.terms ?? "");
    } else {
      const today = new Date();
      setCustomerId("");
      setQuoteDate(toDateInputValue(today));
      setExpiryDate(
        toDateInputValue(new Date(today.getTime() + validityDays * MS_PER_DAY)),
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

  const pickProduct = (product: BuilderProduct) => {
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
    if (!quoteDate || !expiryDate) {
      setError("Set both the quote and expiry dates.");
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
      if (editingQuoteId) {
        await updateQuote({
          id: editingQuoteId,
          customerId,
          quoteDate: fromDateInputValue(quoteDate),
          expiryDate: fromDateInputValue(expiryDate),
          notes,
          terms,
          lines: payloadLines,
        });
        toast.success("Quotation updated.");
      } else {
        const result = await createQuote({
          customerId,
          quoteDate: fromDateInputValue(quoteDate),
          expiryDate: fromDateInputValue(expiryDate),
          notes,
          terms,
          lines: payloadLines,
        });
        toast.success(`Quotation ${result.documentNumber} created.`);
      }
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the quotation.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">
            {editingQuoteId
              ? `Edit ${existing?.quote.documentNumber ?? "quotation"}`
              : "New quotation"}
          </DialogTitle>
          <DialogDescription>
            Pick a customer, add lines from your item register, and the totals
            look after themselves.
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
                  <Label htmlFor="quote-date">Quote date</Label>
                  <Input
                    id="quote-date"
                    type="date"
                    value={quoteDate}
                    onChange={(e) => setQuoteDate(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="expiry-date">
                    Valid until ({validityDays} days)
                  </Label>
                  <Input
                    id="expiry-date"
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
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
                  const lineTotal =
                    totals.lines[index]?.lineTotal ?? 0;
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
                            htmlFor={`line-name-${line.key}`}
                            className="text-xs"
                          >
                            Description
                          </Label>
                          <Input
                            id={`line-name-${line.key}`}
                            value={line.name}
                            onChange={(e) =>
                              updateLine(line.key, { name: e.target.value })
                            }
                            disabled={isSubmitting}
                            placeholder="What are you selling?"
                          />
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                          <Label
                            htmlFor={`line-qty-${line.key}`}
                            className="text-xs"
                          >
                            Qty
                          </Label>
                          <Input
                            id={`line-qty-${line.key}`}
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
                            htmlFor={`line-price-${line.key}`}
                            className="text-xs"
                          >
                            Price (E)
                          </Label>
                          <Input
                            id={`line-price-${line.key}`}
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
                            htmlFor={`line-disc-${line.key}`}
                            className="text-xs"
                          >
                            Disc %
                          </Label>
                          <Input
                            id={`line-disc-${line.key}`}
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
                            htmlFor={`line-vat-${line.key}`}
                            className="text-xs"
                          >
                            VAT %
                          </Label>
                          <Input
                            id={`line-vat-${line.key}`}
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
                <Label htmlFor="quote-notes">Notes to customer</Label>
                <Textarea
                  id="quote-notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={isSubmitting}
                  placeholder="Thank you for the opportunity…"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quote-terms">Terms</Label>
                <Textarea
                  id="quote-terms"
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
                {editingQuoteId ? "Save changes" : "Create quotation"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── Status stepper (row + sheet action) ─────────────────────────── */

function StatusSelect({
  quoteId,
  status,
  disabled,
}: {
  quoteId: QuoteId;
  status: QuoteStatus;
  disabled?: boolean;
}) {
  const setStatus = useMutation(api.quotes.setStatus);
  const [isPending, setIsPending] = useState(false);

  const allowed: QuoteStatus[] =
    status === "draft"
      ? ["sent", "accepted", "rejected", "expired"]
      : status === "sent"
        ? ["accepted", "rejected", "expired"]
        : status === "rejected" || status === "expired"
          ? ["sent"]
          : [];

  const handleChange = async (next: QuoteStatus) => {
    setIsPending(true);
    try {
      await setStatus({ id: quoteId, status: next });
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
      onValueChange={(v) => handleChange(v as QuoteStatus)}
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

export default function Quotes() {
  const { hasBusiness } = useBusiness();
  const { canCreate } = useUsage();
  const navigate = useNavigate();
  const convertQuote = useMutation(api.invoices.convertQuote);
  const [convertingId, setConvertingId] = useState<QuoteId | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | "all">("all");
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingQuoteId, setEditingQuoteId] = useState<QuoteId | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: QuoteId;
    number: string;
  } | null>(null);

  const duplicateQuote = useMutation(api.quotes.duplicate);
  const removeQuote = useMutation(api.quotes.remove);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const result = useQuery(
    api.quotes.list,
    hasBusiness
      ? { search: search || undefined, status: statusFilter === "all" ? undefined : statusFilter }
      : "skip",
  );

  const quotes = result?.quotes ?? [];
  const counts = result?.counts;

  const requireQuota = () => {
    if (!canCreate) {
      setUpgradeOpen(true);
      return false;
    }
    return true;
  };

  const handleDuplicate = async (id: QuoteId) => {
    if (!requireQuota()) return;
    setIsDuplicating(true);
    try {
      const res = await duplicateQuote({ id });
      toast.success(`Created draft ${res.documentNumber}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not duplicate.");
    } finally {
      setIsDuplicating(false);
    }
  };

  const handleConvert = async (id: QuoteId) => {
    setConvertingId(id);
    try {
      const res = await convertQuote({ quoteId: id });
      toast.success(`Invoice ${res.documentNumber} created.`);
      navigate(`/invoices/${res.invoiceId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not convert.");
    } finally {
      setConvertingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await removeQuote({ id: deleteTarget.id });
      toast.success(`Quotation ${deleteTarget.number} removed.`);
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
              SikaFlow · The quotation book
            </div>
            <h1 className="letterpress mt-1 font-serif text-2xl font-bold tracking-tight sm:text-3xl">
              Quotations
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {result
                ? `${result.total} ${result.total === 1 ? "quotation" : "quotations"} on file`
                : "Loading…"}
            </p>
          </div>
          <Button
            onClick={() => {
              if (!requireQuota()) return;
              setEditingQuoteId(null);
              setBuilderOpen(true);
            }}
          >
            <Plus className="mr-2 size-4" />
            New quotation
          </Button>
        </header>

        {/* Search + status filter */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by number or customer…"
              className="pl-9"
              aria-label="Search quotations"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as QuoteStatus | "all")}
          >
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {(Object.keys(STATUS_META) as QuoteStatus[]).map((s) => (
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
            Opening the quotation book…
          </div>
        ) : quotes.length === 0 ? (
          <Card className="glass glass-card paper-card parchment-edge border-border/60 border-dashed bg-glass/40 p-6 shadow-xl backdrop-blur-md">
            <CardHeader className="items-center text-center">
              <div className="stamp mx-auto flex size-14 items-center justify-center rounded-full text-primary/70">
                <FileText className="size-7" />
              </div>
              <CardTitle className="font-serif text-lg">
                {search || statusFilter !== "all"
                  ? "Nothing matches"
                  : "No quotations yet"}
              </CardTitle>
              <CardDescription>
                {search || statusFilter !== "all"
                  ? "Try a different search or status."
                  : "Build your first quote in under a minute — pick a customer, add lines from your register."}
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <ul className="space-y-3">
            {quotes.map((quote) => (
              <li
                key={quote._id}
                className="animate-fade-in-up"
                style={{ animationDelay: `${Math.min(quotes.indexOf(quote), 8) * 50}ms` }}
              >
                <Card className="glass glass-card paper-card border-border/60 bg-glass/40 p-4 shadow-lg">
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
                        <FileText className="size-5" />
                      </div>

                      {/* Signature status flow: draft -> sent -> accepted -> paid */}
                      <div className="flex shrink-0 items-center gap-2">
                        {([
                          "draft",
                          "sent",
                          "accepted",
                        ] as const).map((step, index) => {
                          const done =
                            step === "accepted"
                              ? quote.status === "accepted"
                              : step === "sent"
                                ? quote.status === "sent"
                                : false;
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
                            to={`/quotes/${quote._id}`}
                            className="font-mono text-sm font-semibold underline-offset-2 hover:underline"
                          >
                            {quote.documentNumber}
                          </Link>
                          <StatusSelect
                            quoteId={quote._id}
                            status={quote.status}
                          />
                        </div>
                        <div className="mt-0.5 truncate text-sm text-muted-foreground">
                          {quote.customerName} ·{" "}
                          {formatDate(quote.quoteDate)} →{" "}
                          {formatDate(quote.expiryDate)}
                        </div>
                      </div>
                      <div className="ml-auto text-right">
                        <div className="font-mono text-base font-bold">
                          {formatMoney(quote.grandTotalCents, { compact: true })}
                        </div>
                        <div className="ledger-label text-muted-foreground">
                          incl. VAT
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="mt-1 size-7"
                              aria-label={`Actions for ${quote.documentNumber}`}
                            >
                              <MoreVertical className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => navigate(`/quotes/${quote._id}`)}
                            >
                              <ExternalLink className="mr-2 size-4" /> View &
                              share
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={quote.status !== "draft"}
                              onClick={() => {
                                setEditingQuoteId(quote._id);
                                setBuilderOpen(true);
                              }}
                            >
                              <Pencil className="mr-2 size-4" /> Edit draft
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={
                                convertingId === quote._id ||
                                quote.status === "draft" ||
                                quote.status === "rejected" ||
                                quote.status === "expired" ||
                                quote.convertedInvoiceId !== undefined
                              }
                              onClick={() => handleConvert(quote._id)}
                            >
                              {convertingId === quote._id ? (
                                <Loader2 className="mr-2 size-4 animate-spin" />
                              ) : (
                                <ReceiptText className="mr-2 size-4" />
                              )}
                              {quote.convertedInvoiceId !== undefined
                                ? "Converted ✓"
                                : "Convert to invoice"}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={isDuplicating}
                              onClick={() => handleDuplicate(quote._id)}
                            >
                              <Copy className="mr-2 size-4" /> Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              disabled={isDeleting}
                              onClick={() =>
                                setDeleteTarget({
                                  id: quote._id,
                                  number: quote.documentNumber,
                                })
                              }
                            >
                              <Trash2 className="mr-2 size-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>

      <QuoteBuilderDialog
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        editingQuoteId={editingQuoteId}
      />

      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">
              Remove quotation {deleteTarget?.number}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              It will be hidden from the book. Your numbering sequence is not
              affected, and records are kept for your audit trail.
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
              Remove quotation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
