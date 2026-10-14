import { Separator } from "@/components/ui/separator";
import logo from "@/assets/logo.svg";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { formatMoney } from "@/lib/money";

type Quote = Doc<"quotes">;
type QuoteItem = Doc<"quoteItems">;

/**
 * The printed quotation sheet — an A4 vintage ledger page.
 *
 * Pure presentation: everything it needs arrives via props so it can render
 * on the preview page today and inside print windows later. Layout is fixed
 * to A4 proportions; `@media print` rules in index.css make it fill the page.
 */
export default function QuoteDocument({
  quote,
  items,
  customer,
  business,
}: {
  quote: Quote;
  items: QuoteItem[];
  customer: Doc<"customers"> | null;
  business: {
    name: string;
    address?: string;
    phone?: string;
    email?: string;
    website?: string;
    taxNumber?: string;
    logoUrl?: string | null;
  };
}) {
  const statusLabel =
    quote.status.charAt(0).toUpperCase() + quote.status.slice(1);

  return (
    <article
      className="quote-sheet paper-card mx-auto w-full border bg-card text-card-foreground shadow-sm"
      aria-label={`Quotation ${quote.documentNumber}`}
    >
      <div className="p-6 sm:p-10">
        {/* Head: business vs document — no date/time at top */}
        <header className="flex items-start justify-between gap-6">
          <div className="flex items-start gap-3">
            {business.logoUrl ? (
              <img
                src={business.logoUrl}
                alt=""
                className="size-14 rounded-md object-contain"
              />
            ) : (
              <img src={logo} alt="" className="size-12 rounded-md" />
            )}
            <div>
              <div className="font-serif text-xl font-bold leading-tight">
                {business.name}
              </div>
              <div className="mt-1 space-y-0.5 text-xs leading-4 text-muted-foreground">
                {business.address && <div>{business.address}</div>}
                {business.phone && <div>{business.phone}</div>}
                {business.email && <div>{business.email}</div>}
                {business.website && <div>{business.website}</div>}
                {business.taxNumber && (
                  <div className="pt-1 font-mono">
                    VAT No. {business.taxNumber}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="ledger-label text-muted-foreground">
              Quotation
            </div>
            <div className="font-mono text-lg font-bold">
              {quote.documentNumber}
            </div>
            <div
              className="stamp mt-2 inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-primary/80"
              role="status"
            >
              {statusLabel}
            </div>
          </div>
        </header>

        <div className="rule-double mt-6" />

        {/* Parties only — no dates at top */}
        <section className="mt-6">
          <div>
            <div className="ledger-label text-muted-foreground">Prepared for</div>
            <div className="mt-1.5 font-serif text-base font-bold">
              {customer?.name ?? "—"}
            </div>
            <div className="mt-1 space-y-0.5 text-xs leading-4 text-muted-foreground">
              {customer?.company && <div>{customer.company}</div>}
              {customer?.address && <div>{customer.address}</div>}
              {customer?.phone && <div>{customer.phone}</div>}
              {customer?.email && <div>{customer.email}</div>}
            </div>
          </div>
        </section>

        {/* Items table */}
        <table className="mt-8 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-foreground/25 text-left">
              <th className="w-8 pb-2 pr-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                #
              </th>
              <th className="pb-2 pr-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Description
              </th>
              <th className="pb-2 pr-2 text-right font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Qty
              </th>
              <th className="pb-2 pr-2 text-right font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Price
              </th>
              <th className="pb-2 pr-2 text-right font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Disc
              </th>
              <th className="pb-2 text-right font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item._id} className="border-b border-border/70 align-top">
                <td className="py-2.5 pr-2 font-mono text-xs text-muted-foreground">
                  {index + 1}
                </td>
                <td className="py-2.5 pr-2">
                  <div className="font-medium">{item.name}</div>
                  {item.description && (
                    <div className="mt-0.5 text-xs leading-4 text-muted-foreground">
                      {item.description}
                    </div>
                  )}
                  {item.unit && (
                    <div className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground/80">
                      per {item.unit}
                    </div>
                  )}
                </td>
                <td className="py-2.5 pr-2 text-right font-mono">
                  {item.quantity}
                </td>
                <td className="py-2.5 pr-2 text-right font-mono">
                  {formatMoney(item.unitPriceCents)}
                </td>
                <td className="py-2.5 pr-2 text-right font-mono text-muted-foreground">
                  {item.discountBps > 0
                    ? `${(item.discountBps / 100).toFixed(1).replace(/\.0$/, "")}%`
                    : "—"}
                </td>
                <td className="py-2.5 text-right font-mono font-medium">
                  {formatMoney(item.lineSubtotalCents - item.discountCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <section className="mt-6 flex justify-end">
          <dl className="w-full max-w-xs space-y-1.5 text-sm">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="font-mono">{formatMoney(quote.subtotalCents)}</dd>
            </div>
            {quote.discountTotalCents > 0 && (
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted-foreground">Discounts</dt>
                <dd className="font-mono">
                  −{formatMoney(quote.discountTotalCents)}
                </dd>
              </div>
            )}
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">VAT</dt>
              <dd className="font-mono">{formatMoney(quote.taxTotalCents)}</dd>
            </div>
            <Separator className="my-2" />
            <div className="flex items-baseline justify-between gap-4">
              <dt className="font-serif text-base font-bold">Total due</dt>
              <dd className="font-mono text-lg font-bold">
                {formatMoney(quote.grandTotalCents)}
              </dd>
            </div>
          </dl>
        </section>

      </div>
    </article>
  );
}

export type { Quote, QuoteItem, Id };
