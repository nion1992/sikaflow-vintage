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
import { Switch } from "@/components/ui/switch";
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
import AppShell from "@/components/AppShell";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useBusiness } from "@/hooks/use-business";
import { formatMoney, parseMoneyToCents, BPS_PER_PERCENT } from "@/lib/money";
import { useQuery, useMutation } from "convex/react";
import { toast } from "sonner";
import {
  Boxes,
  Loader2,
  Plus,
  Search,
  Pencil,
  Trash2,
  Archive,
  ArchiveRestore,
} from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import QRCode from "qrcode";

type ProductId = Id<"products">;

interface ProductDoc {
  _id: ProductId;
  name: string;
  description?: string;
  sku?: string;
  category?: string;
  unit?: string;
  unitPriceCents: number;
  taxRateBps?: number;
  active: boolean;
  qrCode?: string | null; // QR code data URL (generated client-side)
}

interface ProductFormValues {
  name: string;
  description: string;
  sku: string;
  category: string;
  unit: string;
  price: string;
  taxPercent: string;
  active: boolean;
}

const EMPTY_FORM: ProductFormValues = {
  name: "",
  description: "",
  sku: "",
  category: "",
  unit: "",
  price: "",
  taxPercent: "",
  active: true,
};

/* ── Create / edit dialog ────────────────────────────────────────── */

function ProductFormDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: ProductDoc | null;
}) {
  const createProduct = useMutation(api.products.create);
  const updateProduct = useMutation(api.products.update);
  const [values, setValues] = useState<ProductFormValues>(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<ProductId | "new" | null>(null);

  if (open) {
    const key = editing?._id ?? "new";
    if (loadedFor !== key) {
      setLoadedFor(key);
      setValues(
        editing
          ? {
              name: editing.name,
              description: editing.description ?? "",
              sku: editing.sku ?? "",
              category: editing.category ?? "",
              unit: editing.unit ?? "",
              price: (editing.unitPriceCents / 100).toFixed(2),
              taxPercent:
                editing.taxRateBps !== undefined
                  ? String(editing.taxRateBps / BPS_PER_PERCENT)
                  : "",
              active: editing.active,
            }
          : EMPTY_FORM,
      );
      setError(null);
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const cents = parseMoneyToCents(values.price);
      if (cents === null) {
        throw new Error("Enter a price like 150 or 150.50.");
      }
      let taxBps: number | undefined;
      if (values.taxPercent.trim()) {
        const pct = Number(values.taxPercent);
        if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
          throw new Error("Tax rate must be between 0 and 100%.");
        }
        taxBps = Math.round(pct * BPS_PER_PERCENT);
      }
      if (editing) {
        await updateProduct({
          id: editing._id,
          name: values.name,
          description: values.description || undefined,
          sku: values.sku || undefined,
          category: values.category || undefined,
          unit: values.unit || undefined,
          unitPriceCents: cents,
          taxRateBps: taxBps,
          active: values.active,
        });
        toast.success("Item updated.");
      } else {
        await createProduct({
          name: values.name,
          description: values.description || undefined,
          sku: values.sku || undefined,
          category: values.category || undefined,
          unit: values.unit || undefined,
          unitPriceCents: cents,
          taxRateBps: taxBps,
          active: values.active,
        });
        toast.success("Item added to the register.");
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">
            {editing ? "Edit item" : "Add an item"}
          </DialogTitle>
          <DialogDescription>
            Products and services you quote or invoice again and again.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="prod-name">Name *</Label>
            <Input
              id="prod-name"
              value={values.name}
              onChange={(e) => setValues({ ...values, name: e.target.value })}
              required
              minLength={2}
              maxLength={120}
              disabled={isSubmitting}
              placeholder="e.g. DTF T-shirt printing"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="prod-price">Price (E) *</Label>
              <Input
                id="prod-price"
                inputMode="decimal"
                value={values.price}
                onChange={(e) =>
                  setValues({ ...values, price: e.target.value })
                }
                required
                disabled={isSubmitting}
                placeholder="150.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prod-unit">Unit</Label>
              <Input
                id="prod-unit"
                value={values.unit}
                onChange={(e) =>
                  setValues({ ...values, unit: e.target.value })
                }
                disabled={isSubmitting}
                placeholder="each, hour, m²…"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="prod-category">Category</Label>
              <Input
                id="prod-category"
                value={values.category}
                onChange={(e) =>
                  setValues({ ...values, category: e.target.value })
                }
                disabled={isSubmitting}
                placeholder="e.g. Printing"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prod-sku">SKU / reference</Label>
              <Input
                id="prod-sku"
                value={values.sku}
                onChange={(e) =>
                  setValues({ ...values, sku: e.target.value })
                }
                disabled={isSubmitting}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prod-tax">
              VAT rate (%) — leave blank for the business default
            </Label>
            <Input
              id="prod-tax"
              inputMode="decimal"
              value={values.taxPercent}
              onChange={(e) =>
                setValues({ ...values, taxPercent: e.target.value })
              }
              disabled={isSubmitting}
              placeholder="15"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prod-desc">Description</Label>
            <Textarea
              id="prod-desc"
              rows={2}
              value={values.description}
              onChange={(e) =>
                setValues({ ...values, description: e.target.value })
              }
              disabled={isSubmitting}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border/60 bg-card/60 p-3">
            <div>
              <div className="text-sm font-medium">Active</div>
              <p className="text-xs text-muted-foreground">
                Inactive items are hidden when building documents.
              </p>
            </div>
            <Switch
              checked={values.active}
              onCheckedChange={(checked) =>
                setValues({ ...values, active: checked })
              }
              disabled={isSubmitting}
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
              {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              {editing ? "Save changes" : "Add item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Page ────────────────────────────────────────────────────────── */

export default function Products() {
  const { hasBusiness } = useBusiness();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProductDoc | null>(null);
  const [deleting, setDeleting] = useState<ProductDoc | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const products = useQuery(
    api.products.list,
    hasBusiness
      ? {
          search: search || undefined,
          category: category || undefined,
          activeOnly: !showInactive,
        }
      : "skip",
  );

  const categories = useQuery(api.products.categories, hasBusiness ? {} : "skip");

  const removeProduct = useMutation(api.products.remove);
  const setActive = useMutation(api.products.setActive);

  const visible = useMemo(
    () => (products ?? []).filter((p) => showInactive || p.active),
    [products, showInactive],
  );

  const handleDelete = async () => {
    if (!deleting) return;
    setIsDeleting(true);
    try {
      await removeProduct({ id: deleting._id });
      toast.success("Item removed from the register.");
      setDeleting(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleActive = async (product: ProductDoc) => {
    try {
      await setActive({ id: product._id, active: !product.active });
      toast.success(product.active ? "Item archived." : "Item restored.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update.");
    }
  };

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="ledger-label text-muted-foreground">
              SikaFlow · The item register
            </div>
            <h1 className="letterpress mt-1 font-serif text-2xl font-bold tracking-tight sm:text-3xl">
              Products &amp; services
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {products ? `${products.length} in the register` : "Loading…"}
            </p>
          </div>
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="mr-2 size-4" />
            Add item
          </Button>
        </header>

        {/* Search + filters */}
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, SKU, category…"
              className="pl-9"
              aria-label="Search items"
            />
          </div>
          {categories && categories.length > 0 && (
            <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              <button
                type="button"
                onClick={() => setCategory("")}
                className={`ledger-label shrink-0 rounded-full border px-3 py-1.5 transition-colors ${
                  category === ""
                    ? "border-primary bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() =>
                    setCategory(category === cat ? "" : cat)
                  }
                  className={`ledger-label shrink-0 rounded-full border px-3 py-1.5 transition-colors ${
                    category === cat
                      ? "border-primary bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {cat}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowInactive(!showInactive)}
                className={`ledger-label ml-auto shrink-0 rounded-full border px-3 py-1.5 transition-colors ${
                  showInactive
                    ? "border-primary bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Archive className="mr-1 inline size-3" />
                Archived
              </button>
            </div>
          )}
        </div>

        {/* List */}
        {!products ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="mr-2 size-5 animate-spin" />
            Opening the register…
          </div>
        ) : visible.length === 0 ? (
          <Card className="paper-card parchment-edge border-dashed">
            <CardHeader className="items-center text-center">
              <div className="stamp mx-auto flex size-14 items-center justify-center rounded-full text-primary/70">
                <Boxes className="size-7" />
              </div>
              <CardTitle className="font-serif text-lg">
                {search || category ? "No items match" : "The register is empty"}
              </CardTitle>
              <CardDescription>
                {search || category
                  ? "Try a different search or category."
                  : "Save your products and services once — then quoting is taps, not typing."}
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {visible.map((product) => (
              <li key={product._id}>
                <Card className="glass glass-card paper-card">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-serif font-semibold">
                            {product.name}
                          </span>
                          {!product.active && (
                            <Badge variant="outline" className="font-normal">
                              Archived
                            </Badge>
                          )}
                        </div>
                        {product.category && (
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {product.category}
                            {product.sku ? ` · ${product.sku}` : ""}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-sm font-semibold">
                          {formatMoney(product.unitPriceCents)}
                        </div>
                        {product.unit && (
                          <div className="text-xs text-muted-foreground">
                            per {product.unit}
                          </div>
                        )}
                      </div>
                    </div>

                    {product.description && (
                      <p className="mt-2 line-clamp-2 text-sm leading-5 text-muted-foreground">
                        {product.description}
                      </p>
                    )}

                    {/* QR Code for the product */}
                    {product._id && (
                      <div className="mt-3 flex justify-center">
                        <QrCodeBlock product={product} />
                      </div>
                    )}

                    <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5">
                      <span className="text-xs text-muted-foreground">
                        {product.taxRateBps !== undefined
                          ? `VAT ${product.taxRateBps / BPS_PER_PERCENT}%`
                          : "Default VAT"}
                      </span>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={
                            product.active
                              ? `Archive ${product.name}`
                              : `Restore ${product.name}`
                          }
                          onClick={() => handleToggleActive(product)}
                        >
                          {product.active ? (
                            <Archive className="size-4" />
                          ) : (
                            <ArchiveRestore className="size-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Edit ${product.name}`}
                          onClick={() => {
                            setEditing(product);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${product.name}`}
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleting(product)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ProductFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
      />

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">
              Remove this item?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.name} will be removed from the register. Lines on existing
              quotes and invoices keep their recorded prices.
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
              Remove item
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

/** Generate a deep link URL for a product. */
function productDeepLink(productId: string): string {
  const baseUrl = window.location.origin || "https://sikaflow.app";
  return `${baseUrl}/products/${productId}`;
}

/** Component that renders a QR code for a product, generating it client-side. */
function QrCodeBlock({ product }: { product: ProductDoc }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function generateQr() {
      try {
        const url = productDeepLink(product._id);
        const dataUrl = await QRCode.toDataURL(url, {
          errorCorrectionLevel: "H",
          width: 200,
          margin: 1,
          color: {
            dark: "#1a1a24",
            light: "#ffffff",
          },
        });
        setQrDataUrl(dataUrl);
      } catch (err) {
        console.error("Failed to generate QR code:", err);
        setQrDataUrl(null);
      } finally {
        setIsLoading(false);
      }
    }
    generateQr();
  }, [product._id]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!qrDataUrl) {
    return (
      <div className="rounded border border-dashed py-4 text-center text-xs text-muted-foreground">
        QR unavailable
      </div>
    );
  }

  return (
    <div className="relative">
      <img
        src={qrDataUrl}
        alt={`QR code for ${product.name}`}
        className="size-20 rounded border"
      />
      <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 ledger-label text-[10px] text-muted-foreground whitespace-nowrap">
        Scan to view product
      </div>
    </div>
  );
}
