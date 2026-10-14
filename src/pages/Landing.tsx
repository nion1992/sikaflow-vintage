import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.svg";
import {
  ArrowRight,
  Banknote,
  BarChart3,
  BookUser,
  Boxes,
  Check,
  FileText,
  WifiOff,
} from "lucide-react";
import { Link } from "react-router";

const FEATURES = [
  {
    icon: FileText,
    title: "Quotes & invoices",
    body: "Clean, numbered documents with your logo, VAT and terms — built in under a minute.",
  },
  {
    icon: BookUser,
    title: "Customer book",
    body: "Names, companies, phones and WhatsApp numbers kept in one tidy register.",
  },
  {
    icon: Boxes,
    title: "Saved items",
    body: "Your products and services with prices, so quoting is taps, not typing.",
  },
  {
    icon: Banknote,
    title: "Payment tracking",
    body: "Record cash, MoMo or bank payments and see who still owes what.",
  },
  {
    icon: BarChart3,
    title: "Simple reports",
    body: "Revenue, outstanding balances and converted quotes — without the accounting jargon.",
  },
  {
    icon: WifiOff,
    title: "Built for real connections",
    body: "Light, fast pages that behave on inexpensive phones and inconsistent internet.",
  },
] as const;

const TRADES = [
  "Printers",
  "Contractors",
  "Caterers",
  "Mechanics",
  "Tailors",
  "Photographers",
  "Cleaners",
  "Event crews",
  "Designers",
  "Freelancers",
] as const;

const PLANS = [
  {
    name: "Free",
    price: "E0",
    note: "to get started",
    features: ["A handful of documents a month", "Basic business profile", "Customer book"],
    cta: "Start free",
    highlight: false,
  },
  {
    name: "Business",
    price: "TBD",
    note: "per month, at launch",
    features: [
      "Unlimited quotes & invoices",
      "Logo & branding on documents",
      "PDF sharing & WhatsApp send",
      "Full payment tracking",
    ],
    cta: "Start free, upgrade later",
    highlight: true,
  },
  {
    name: "Pro",
    price: "TBD",
    note: "per month, at launch",
    features: ["Advanced reports", "Multiple users", "Priority support"],
    cta: "Talk to us",
    highlight: false,
  },
] as const;

const SPECIMEN_ROWS = [
  { item: "DTF T-shirt printing", qty: "20 × E150.00", total: "E3,000.00" },
  { item: "Vinyl banner, 2m × 1m", qty: "2 × E450.00", total: "E900.00" },
  { item: "Delivery — Mbabane", qty: "1 × E120.00", total: "E120.00" },
] as const;

export default function Landing() {
  return (
    <div className="min-h-screen paper-texture">
      {/* ── Header ──────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b bg-glass/85 backdrop-blur supports-[backdrop-filter]:bg-glass/90">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <img src={logo} alt="" className="size-9 rounded-md" />
            <div>
              <div className="font-serif text-lg font-bold leading-none tracking-wide">
                SikaFlow, Eswatini's SME Bookeeping Solution
              </div>
              <div className="ledger-label text-muted-foreground">
                Eswatini · Est. 2026
              </div>
            </div>
          </Link>
          <nav className="ml-auto hidden items-center gap-6 text-sm font-medium text-foreground/80 md:flex">
            <a href="#how" className="hover:text-foreground transition-colors">
              How it works
            </a>
            <a href="#features" className="hover:text-foreground transition-colors">
              Features
            </a>
            <a href="#pricing" className="hover:text-foreground transition-colors">
              Pricing
            </a>
          </nav>
          <div className="ml-auto flex items-center gap-2 md:ml-6">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link to="/auth">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/auth">
                Start free
                <ArrowRight className="ml-1.5 size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* ── Hero ────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 sm:pt-14 lg:pb-24">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
            <div>
              <p className="ledger-label text-muted-foreground">
                For small &amp; medium businesses in Eswatini
              </p>
              <h1 className="letterpress mt-3 font-serif text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
                Professional quotes &amp; invoices,{" "}
                <span className="italic text-primary">in under a minute.</span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
                SikaFlow is the simple ledger for the kingdom's makers and traders —
                quotations, invoices, customers and payments in one tidy place. Made to
                work on any phone, on any connection.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="w-full sm:w-auto">
                  <Link to="/auth">
                    Start your ledger — free
                    <ArrowRight className="ml-2 size-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                  <a href="#how">See how it works</a>
                </Button>
              </div>
              <ul className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
                {["Free plan included", "SZL first", "VAT-ready", "No card required"].map(
                  (item) => (
                    <li key={item} className="flex items-center gap-1.5">
                      <Check className="size-4 text-primary" />
                      {item}
                    </li>
                  ),
                )}
              </ul>
            </div>

            {/* Specimen invoice — dark glass */}
            <div className="relative mx-auto max-w-md">
              <div className="paper-card parchment-edge relative rounded-md border border-border/60 bg-glass/60 p-5 shadow-lg backdrop-blur-md sm:p-6">
                <div className="stamp absolute -right-3 -top-3 rotate-12 rounded-sm border-2 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-destructive/80">
                  Specimen
                </div>
                <div className="p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-serif text-lg font-bold">Mkhaya Print Studio</div>
                      <div className="text-xs text-muted-foreground">Mbabane, Eswatini</div>
                    </div>
                    <div className="text-right">
                      <div className="ledger-label text-muted-foreground">Tax invoice</div>
                      <div className="font-mono text-sm">INV-2026-0001</div>
                      <div className="text-xs text-muted-foreground">12 Mar 2026</div>
                    </div>
                  </div>

                  <div className="rule-double mt-4 pt-2" />

                  <div className="mt-3 text-xs">
                    <span className="ledger-label text-muted-foreground">Billed to</span>
                    <div className="mt-0.5 text-sm font-medium">Sisekelo Primary School</div>
                  </div>

                  <table className="mt-4 w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                        <th className="pb-1.5 font-medium">Item</th>
                        <th className="pb-1.5 text-right font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {SPECIMEN_ROWS.map((row) => (
                        <tr key={row.item} className="border-b border-border/60">
                          <td className="py-2">
                            {row.item}
                            <span className="block text-xs text-muted-foreground">{row.qty}</span>
                          </td>
                          <td className="py-2 text-right font-mono text-[13px]">{row.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="mt-3 space-y-1 text-sm">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Subtotal</span>
                      <span className="font-mono">E4,020.00</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>VAT 15%</span>
                      <span className="font-mono">E603.00</span>
                    </div>
                    <div className="flex justify-between border-t pt-1.5 font-serif text-base font-bold">
                      <span>Total due</span>
                      <span className="font-mono">E4,623.00</span>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t pt-3 text-[11px] text-muted-foreground">
                    <span>Cash · MoMo · Bank transfer</span>
                    <span className="font-serif italic">Thank you.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── How it works ────────────────────────────────────── */}
        <section id="how" className="border-y bg-card/60">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <div className="text-center">
              <p className="ledger-label text-muted-foreground">The method</p>
              <h2 className="letterpress mt-2 font-serif text-3xl font-bold tracking-tight">
                Three steps, one minute
              </h2>
            </div>
            <div className="mt-10 grid gap-8 sm:grid-cols-3">
              {[
                {
                  numeral: "I",
                  title: "Pick the customer",
                  body: "Add them once — SikaFlow remembers their name, company and WhatsApp number.",
                },
                {
                  numeral: "II",
                  title: "Add your items",
                  body: "Choose from your saved products and services, adjust quantities, done.",
                },
                {
                  numeral: "III",
                  title: "Share it",
                  body: "Send a clean PDF or a ready-made WhatsApp message in two taps.",
                },
              ].map((step, i) => (
                <div key={step.numeral} className="relative text-center">
                  <div className="mx-auto flex size-14 items-center justify-center rounded-full border-2 border-primary/40 bg-background font-serif text-xl font-bold text-primary">
                    {step.numeral}
                  </div>
                  <h3 className="mt-4 font-serif text-lg font-bold">{step.title}</h3>
                  <p className="mx-auto mt-1.5 max-w-xs text-sm leading-6 text-muted-foreground">
                    {step.body}
                  </p>
                  {i < 2 && (
                    <div className="absolute right-0 top-7 hidden h-px w-[calc(100%-4rem)] translate-x-[calc(2rem+100%*0.25)] bg-border sm:block" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Features ────────────────────────────────────────── */}
        <section id="features" className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-20">
          <div className="max-w-2xl">
            <p className="ledger-label text-muted-foreground">What's inside</p>
            <h2 className="letterpress mt-2 font-serif text-3xl font-bold tracking-tight">
              Everything a working ledger needs
            </h2>
            <p className="mt-3 text-muted-foreground">
              No accounting jargon, no clutter — just the six things a small business
              actually uses every day.
            </p>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="paper-card rounded-md border border-border/60 bg-glass/40 p-5 transition-colors hover:border-primary/40"
              >
                <div className="flex size-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
                  <f.icon className="size-5" />
                </div>
                <h3 className="mt-4 font-serif text-lg font-bold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 rounded-md border border-border/60 bg-card/60 p-5 text-center sm:p-6">
            <p className="ledger-label text-muted-foreground">Made for the kingdom</p>
            <p className="mx-auto mt-2 max-w-2xl font-serif text-lg italic leading-8 text-foreground/90">
              “Sika” — money. Flowing between you and your customers the way it always
              has, just written down properly now.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {TRADES.map((t) => (
                <Badge key={t} variant="outline" className="font-normal">
                  {t}
                </Badge>
              ))}
            </div>
          </div>
        </section>

        {/* ── Pricing ─────────────────────────────────────────── */}
        <section id="pricing" className="border-y bg-card/60">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-20">
            <div className="text-center">
              <p className="ledger-label text-muted-foreground">Fair rates</p>
              <h2 className="letterpress mt-2 font-serif text-3xl font-bold tracking-tight">
                Start free. Grow when ready.
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
                Plans are being finalised for launch — the free plan stays free, and
                you'll always be able to see your prices in emalangeni.
              </p>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {PLANS.map((plan) => (
                <div
                  key={plan.name}
                  className={cn(
                    "paper-card relative rounded-md border p-6",
                    plan.highlight && "border-primary shadow-lg",
                  )}
                >
                  {plan.highlight && (
                    <div className="stamp absolute -top-3 left-1/2 -translate-x-1/2 rounded-sm bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-primary-foreground">
                      Recommended
                    </div>
                  )}
                  <h3 className="font-serif text-xl font-bold">{plan.name}</h3>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="font-serif text-3xl font-bold">{plan.price}</span>
                    <span className="text-xs text-muted-foreground">{plan.note}</span>
                  </div>
                  <ul className="mt-5 space-y-2.5 text-sm">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                        <span className="text-foreground/85">{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Button asChild className="mt-6 w-full" variant={plan.highlight ? "default" : "outline"}>
                    <Link to="/auth">{plan.cta}</Link>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Final CTA ───────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-20">
          <div className="paper-card parchment-edge rounded-md border border-border/60 bg-glass/50 p-6 text-center shadow-lg backdrop-blur-md">
            <h2 className="font-serif text-3xl font-bold tracking-tight">
              Your ledger is waiting.
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 opacity-85">
              Open it today, add your first customer, and send your first quotation
              before the tea gets cold.
            </p>
            <Button
              asChild
              size="lg"
              variant="secondary"
              className="mt-7 bg-background text-primary hover:bg-background/90"
            >
              <Link to="/auth">
                Open your ledger — free
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      {/* ── Footer ──────────────────────────────────────────── */}
      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-8 text-center sm:flex-row sm:justify-between sm:px-6 sm:text-left">
          <div className="flex items-center gap-2.5">
            <img src={logo} alt="" className="size-8 rounded-md" />
            <div>
              <div className="font-serif text-sm font-bold">SikaFlow, Eswatini's SME Bookeeping Solution</div>
              <div className="ledger-label text-muted-foreground">Mbabane · Eswatini</div>
            </div>
          </div>
          <p className="max-w-sm text-xs leading-5 text-muted-foreground">
            Quotations, invoices and payments for small business. Kept simply, kept well.
          </p>
          <div className="flex items-center gap-4 text-sm">
            <Link to="/auth" className="text-muted-foreground hover:text-foreground transition-colors">
              Sign in
            </Link>
            <Link to="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">
              Dashboard
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
