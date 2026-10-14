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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import AppShell from "@/components/AppShell";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useBusiness } from "@/hooks/use-business";
import { formatMoney } from "@/lib/money";
import { useQuery, useMutation } from "convex/react";
import { useCountUp } from "@/hooks/use-count-up";
import { toast } from "sonner";
import {
  BookUser,
  Loader2,
  Plus,
  Search,
  Pencil,
  Trash2,
  Phone,
  Mail,
  MapPin,
  MessageCircle,
  Building2,
} from "lucide-react";
import { useState } from "react";

type CustomerId = Id<"customers">;

interface CustomerFormValues {
  name: string;
  company: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  notes: string;
}

const EMPTY_FORM: CustomerFormValues = {
  name: "",
  company: "",
  phone: "",
  whatsapp: "",
  email: "",
  address: "",
  notes: "",
};

/* ── Create / edit dialog ────────────────────────────────────────── */

function CustomerFormDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: {
    _id: CustomerId;
    name: string;
    company?: string;
    phone?: string;
    whatsapp?: string;
    email?: string;
    address?: string;
    notes?: string;
  } | null;
}) {
  const createCustomer = useMutation(api.customers.create);
  const updateCustomer = useMutation(api.customers.update);
  const [values, setValues] = useState<CustomerFormValues>(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<CustomerId | "new" | null>(null);

  // Seed the form when the dialog opens for a specific customer
  if (open) {
    const key = editing?._id ?? "new";
    if (loadedFor !== key) {
      setLoadedFor(key);
      setValues(
        editing
          ? {
              name: editing.name,
              company: editing.company ?? "",
              phone: editing.phone ?? "",
              whatsapp: editing.whatsapp ?? "",
              email: editing.email ?? "",
              address: editing.address ?? "",
              notes: editing.notes ?? "",
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
      if (editing) {
        await updateCustomer({ id: editing._id, ...values });
        toast.success("Customer updated.");
      } else {
        await createCustomer(values);
        toast.success("Customer added to the book.");
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
            {editing ? "Edit customer" : "Add a customer"}
          </DialogTitle>
          <DialogDescription>
            Saved once, reused on every quote and invoice.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cust-name">Name *</Label>
            <Input
              id="cust-name"
              value={values.name}
              onChange={(e) => setValues({ ...values, name: e.target.value })}
              required
              minLength={2}
              maxLength={100}
              disabled={isSubmitting}
              placeholder="e.g. Sisekelo Primary School"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cust-company">Company (optional)</Label>
            <Input
              id="cust-company"
              value={values.company}
              onChange={(e) =>
                setValues({ ...values, company: e.target.value })
              }
              disabled={isSubmitting}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cust-phone">Phone</Label>
              <Input
                id="cust-phone"
                type="tel"
                value={values.phone}
                onChange={(e) =>
                  setValues({ ...values, phone: e.target.value })
                }
                disabled={isSubmitting}
                placeholder="+268 …"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cust-whatsapp">WhatsApp</Label>
              <Input
                id="cust-whatsapp"
                type="tel"
                value={values.whatsapp}
                onChange={(e) =>
                  setValues({ ...values, whatsapp: e.target.value })
                }
                disabled={isSubmitting}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cust-email">Email</Label>
            <Input
              id="cust-email"
              type="email"
              value={values.email}
              onChange={(e) =>
                setValues({ ...values, email: e.target.value })
              }
              disabled={isSubmitting}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cust-address">Address</Label>
            <Input
              id="cust-address"
              value={values.address}
              onChange={(e) =>
                setValues({ ...values, address: e.target.value })
              }
              disabled={isSubmitting}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cust-notes">Notes</Label>
            <Textarea
              id="cust-notes"
              rows={2}
              value={values.notes}
              onChange={(e) => setValues({ ...values, notes: e.target.value })}
              disabled={isSubmitting}
              placeholder="Anything worth remembering…"
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
              {editing ? "Save changes" : "Add customer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Detail sheet ────────────────────────────────────────────────── */

/** Animated stat tiles — a child component so the count-up hooks are never
 * called conditionally while the sheet's data loads. */
function CustomerStats({
  stats,
}: {
  stats: { invoicedCents: number; paidCents: number; outstandingCents: number };
}) {
  const invoiced = useCountUp({ value: stats.invoicedCents, duration: 200 });
  const paid = useCountUp({ value: stats.paidCents, duration: 200 });
  const owes = useCountUp({ value: stats.outstandingCents, duration: 200 });

  return (
    <div className="grid grid-cols-3 gap-2 text-center">
      <div className="glass-wall rounded-md border p-2 animate-fade-in-up">
        <div className="ledger-label text-muted-foreground">Invoiced</div>
        <div className="mt-1 font-mono text-sm font-semibold">{invoiced}</div>
      </div>
      <div
        className="glass-wall rounded-md border p-2 animate-fade-in-up"
        style={{ animationDelay: "60ms" }}
      >
        <div className="ledger-label text-muted-foreground">Paid</div>
        <div className="mt-1 font-mono text-sm font-semibold">{paid}</div>
      </div>
      <div
        className="glass-wall rounded-md border p-2 animate-fade-in-up"
        style={{ animationDelay: "120ms" }}
      >
        <div className="ledger-label text-muted-foreground">Owes</div>
        <div
          className={`mt-1 font-mono text-sm font-semibold ${
            stats.outstandingCents > 0 ? "text-destructive" : ""
          }`}
        >
          {owes}
        </div>
      </div>
    </div>
  );
}

function CustomerDetailSheet({
  customerId,
  onClose,
  onEdit,
}: {
  customerId: CustomerId | null;
  onClose: () => void;
  onEdit: () => void;
}) {
  const data = useQuery(
    api.customers.get,
    customerId ? { id: customerId } : "skip",
  );
  const removeCustomer = useMutation(api.customers.remove);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!customerId) return;
    setIsDeleting(true);
    try {
      await removeCustomer({ id: customerId });
      toast.success("Customer removed from the book.");
      setConfirmOpen(false);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Sheet open={customerId !== null} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {data ? (
            <div className="flex flex-col gap-5">
              <SheetHeader>
                <SheetTitle className="font-serif text-xl">
                  {data.customer.name}
                </SheetTitle>
                <SheetDescription>
                  {data.customer.company || "Customer record"}
                </SheetDescription>
              </SheetHeader>

              {/* Stats */}
              <CustomerStats stats={data.stats} />

              {/* Contact details */}
              <div className="space-y-2 text-sm">
                {data.customer.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="size-4 text-muted-foreground" />
                    <a
                      href={`tel:${data.customer.phone}`}
                      className="hover:underline"
                    >
                      {data.customer.phone}
                    </a>
                  </div>
                )}
                {data.customer.whatsapp && (
                  <div className="flex items-center gap-2">
                    <MessageCircle className="size-4 text-muted-foreground" />
                    <span>{data.customer.whatsapp}</span>
                  </div>
                )}
                {data.customer.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="size-4 text-muted-foreground" />
                    <a
                      href={`mailto:${data.customer.email}`}
                      className="hover:underline"
                    >
                      {data.customer.email}
                    </a>
                  </div>
                )}
                {data.customer.address && (
                  <div className="flex items-center gap-2">
                    <MapPin className="size-4 text-muted-foreground" />
                    <span>{data.customer.address}</span>
                  </div>
                )}
                {data.customer.notes && (
                  <p className="glass-wall rounded-md border p-3 text-xs leading-5 text-muted-foreground">
                    {data.customer.notes}
                  </p>
                )}
              </div>

              <Separator />

              {/* History */}
              <div>
                <div className="ledger-label text-muted-foreground">Recent documents</div>
                {data.recentQuotes.length === 0 &&
                data.recentInvoices.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    No quotes or invoices yet.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {data.recentInvoices.map((inv) => (
                      <li
                        key={inv._id}
                        className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-sm"
                      >
                        <span className="font-mono text-xs">
                          {inv.documentNumber}
                        </span>
                        <span className="font-mono text-xs">
                          {formatMoney(inv.grandTotalCents, { compact: true })}
                        </span>
                      </li>
                    ))}
                    {data.recentQuotes.map((qt) => (
                      <li
                        key={qt._id}
                        className="flex items-center justify-between rounded-md border border-dashed px-3 py-2 text-sm"
                      >
                        <span className="font-mono text-xs">
                          {qt.documentNumber}
                        </span>
                        <span className="font-mono text-xs">
                          {formatMoney(qt.grandTotalCents, { compact: true })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="mt-auto flex gap-2">
                <Button variant="outline" className="flex-1" onClick={onEdit}>
                  <Pencil className="mr-2 size-4" />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setConfirmOpen(true)}
                >
                  <Trash2 className="mr-2 size-4" />
                  Delete
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">
              Remove this customer?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {data?.customer.name} will be hidden from your customer book. Past
              quotes and invoices are kept for your records.
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
              Remove customer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ── Page ────────────────────────────────────────────────────────── */

export default function Customers() {
  const { hasBusiness } = useBusiness();
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<
    | {
        _id: CustomerId;
        name: string;
        company?: string;
        phone?: string;
        whatsapp?: string;
        email?: string;
        address?: string;
        notes?: string;
      }
    | null
  >(null);
  const [detailId, setDetailId] = useState<CustomerId | null>(null);

  const customersResult = useQuery(
    api.customers.list,
    hasBusiness ? { search: search || undefined } : "skip",
  );

  const customers = customersResult?.customers ?? [];

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="ledger-label text-muted-foreground">
              SikaFlow · The customer book
            </div>
            <h1 className="letterpress mt-1 font-serif text-2xl font-bold tracking-tight sm:text-3xl">
              Customers
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {customersResult
                ? `${customersResult.total} in the book`
                : "Loading…"}
            </p>
          </div>
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="mr-2 size-4" />
            Add customer
          </Button>
        </header>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, company, phone…"
            className="pl-9"
            aria-label="Search customers"
          />
        </div>

        {/* List */}
        {!customersResult ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="mr-2 size-5 animate-spin" />
            Opening the book…
          </div>
        ) : customers.length === 0 ? (
          <Card className="paper-card parchment-edge border-dashed">
            <CardHeader className="items-center text-center">
              <div className="stamp mx-auto flex size-14 items-center justify-center rounded-full text-primary/70">
                <BookUser className="size-7" />
              </div>
              <CardTitle className="font-serif text-lg">
                {search ? "No customers match" : "The book is empty"}
              </CardTitle>
              <CardDescription>
                {search
                  ? "Try a different name, company or number."
                  : "Add your first customer to start quoting in under a minute."}
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {customers.map((customer) => (
              <li key={customer._id}>
                <Card
                  className="glass glass-card paper-card cursor-pointer transition-colors hover:border-primary/40"
                  onClick={() => setDetailId(customer._id)}
                >
                  <CardContent className="flex items-start gap-3 p-4">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent font-serif text-sm font-bold text-accent-foreground">
                      {customer.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-serif font-semibold">
                          {customer.name}
                        </span>
                        {customer.company && (
                          <Badge
                            variant="outline"
                            className="hidden shrink-0 font-normal sm:inline-flex"
                          >
                            <Building2 className="mr-1 size-3" />
                            Company
                          </Badge>
                        )}
                      </div>
                      <div className="mt-0.5 truncate text-sm text-muted-foreground">
                        {customer.company || customer.phone || customer.email || "—"}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${customer.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditing(customer);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>

      <CustomerFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
      />
      <CustomerDetailSheet
        customerId={detailId}
        onClose={() => setDetailId(null)}
        onEdit={() => {
          const customer = customers.find((c) => c._id === detailId);
          if (customer) {
            setEditing(customer);
            setFormOpen(true);
            setDetailId(null);
          }
        }}
      />
    </AppShell>
  );
}
