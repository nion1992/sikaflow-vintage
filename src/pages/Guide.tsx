import AppShell from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Banknote,
  BarChart3,
  BellRing,
  BookUser,
  Boxes,
  FileText,
  ReceiptText,
  Settings,
} from "lucide-react";
import { Link } from "react-router";

interface Step {
  numeral: string;
  icon: typeof Settings;
  title: string;
  time: string;
  body: string;
  points: string[];
  to: string;
  cta: string;
}

const STEPS: Step[] = [
  {
    numeral: "I",
    icon: Settings,
    title: "Set up your business",
    time: "2 minutes, once",
    body: "Your name and details are printed on every quote and invoice you send, so this comes first.",
    points: [
      "Business name, phone and address under Settings → Profile",
      "Upload your logo — it heads every document",
      "Check VAT (15% default) and quotation validity days",
      "Numbering is automatic: QT-2026-0001, INV-2026-0001",
    ],
    to: "/settings",
    cta: "Open business settings",
  },
  {
    numeral: "II",
    icon: BookUser,
    title: "Add your customers",
    time: "30 seconds each",
    body: "Add a customer once and reuse them on every document — no retyping phone numbers.",
    points: [
      "Name plus company if they have one",
      "Phone number — used for WhatsApp reminders later",
      "Optional email and notes for context",
    ],
    to: "/customers",
    cta: "Open the customer book",
  },
  {
    numeral: "III",
    icon: Boxes,
    title: "Save what you sell",
    time: "20 seconds each",
    body: "Your price list lives here. Quoting becomes taps instead of typing.",
    points: [
      "Products and services with a default price each",
      "Category, unit and description are optional",
      "Prices are pre-filled when you quote — adjust per line anytime",
    ],
    to: "/products",
    cta: "Open the item register",
  },
  {
    numeral: "IV",
    icon: FileText,
    title: "Write your first quote",
    time: "under a minute",
    body: "This is the heart of SikaFlow. Pick a customer, tap in your items, and the maths is done for you.",
    points: [
      "New quote → pick a customer → add lines from your register",
      "Per-line VAT and discounts when you need them; totals update live",
      "Send it: print or PDF, copy the text, or WhatsApp straight to the customer",
      "Track it: sent → accepted / declined / expired, from the quote page",
    ],
    to: "/quotes",
    cta: "Open the quote book",
  },
  {
    numeral: "V",
    icon: ReceiptText,
    title: "Invoice and get paid",
    time: "10 seconds per invoice",
    body: "When a quote is accepted, one tap turns it into an invoice — then you watch the money come in.",
    points: [
      "Convert quote → invoice, or write a fresh one",
      "Record cash, MoMo or bank payments; the balance updates itself",
      "Statuses run sent → partially paid → paid, and overdue is marked automatically",
      "The Amount-due box always shows what is still outstanding",
    ],
    to: "/invoices",
    cta: "Open the invoice book",
  },
];

const AFTER = [
  {
    icon: BellRing,
    title: "Follow-ups",
    body: "Your chasing desk: who is overdue, who to nudge before due date, which quotes went quiet. Every row has a WhatsApp link — tap, send, done.",
    to: "/follow-ups",
  },
  {
    icon: BarChart3,
    title: "Reports",
    body: "Invoiced vs collected, outstanding and overdue totals, how many quotes become invoices, and your best customers — without the accounting jargon.",
    to: "/reports",
  },
  {
    icon: Banknote,
    title: "Payments",
    body: "Every receipt in one register. Filter by customer or method and reconcile at month-end in minutes.",
    to: "/payments",
  },
];

export default function Guide() {
  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <div className="ledger-label text-muted-foreground">
            First time here? Start on this page
          </div>
          <h1 className="letterpress font-serif text-2xl font-bold tracking-tight sm:text-3xl">
            How to run your ledger
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Five short steps, in order. Most people finish the whole loop — setup to
            a WhatsApp'd invoice — in one sitting, before the tea gets cold.
          </p>
        </header>

        <ol className="overflow-hidden rounded-md border border-border/60">
          {STEPS.map((step, index) => (
            <li
              key={step.numeral}
              className={`p-4 sm:p-5 ${index > 0 ? "border-t" : "bg-glass/40"}`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
                <div className="flex items-center gap-3 sm:w-16 sm:shrink-0 sm:flex-col sm:gap-1">
                  <span className="font-serif text-2xl font-bold text-primary">
                    {step.numeral}
                  </span>
                  <span className="flex size-8 items-center justify-center rounded-md bg-accent text-accent-foreground">
                    <step.icon className="size-4" />
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h2 className="font-serif text-lg font-bold">{step.title}</h2>
                    <Badge
                      variant="outline"
                      className="border-primary/40 font-normal text-primary"
                    >
                      {step.time}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {step.body}
                  </p>
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {step.points.map((point) => (
                      <li
                        key={point}
                        className="flex items-start gap-2 text-foreground/85"
                      >
                        <span
                          aria-hidden
                          className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/60"
                        />
                        {point}
                      </li>
                    ))}
                  </ul>
                  <Button asChild variant="outline" size="sm" className="mt-4">
                    <Link to={step.to}>
                      {step.cta}
                      <ArrowRight className="ml-2 size-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ol>

        <section>
          <h2 className="font-serif text-lg font-bold">Then, as work flows</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Three pages you will live in once the money starts moving.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {AFTER.map((item) => (
              <Link
                key={item.title}
                to={item.to}
                className="paper-card block rounded-md border border-border/60 bg-glass/30 p-4 transition-colors hover:border-primary/40"
              >
                <item.icon className="size-5 text-primary" />
                <h3 className="mt-2 font-serif font-bold">{item.title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {item.body}
                </p>
              </Link>
            ))}
          </div>
        </section>

        <section className="paper-card rounded-md border border-border/60 p-5">
          <h2 className="font-serif text-lg font-bold">
            Keep it on your phone
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            SikaFlow installs like a native app — its own icon, no browser bar, works
            on inexpensive phones. On Android and desktop, use the "Install SikaFlow"
            card in the sidebar (or your browser's install icon). On iPhone or iPad,
            Share → "Add to Home Screen".
          </p>
        </section>

        <section className="rounded-md border border-dashed p-5">
          <h2 className="font-serif text-lg font-bold">The daily rhythm</h2>
          <ul className="mt-3 space-y-2 text-sm text-foreground/85">
            <li className="flex items-start gap-2">
              <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/60" />
              Morning: open <strong className="font-semibold">Follow-ups</strong>, clear the overdue list with WhatsApp nudges.
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/60" />
              During the day: quote on the spot from your item register.
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/60" />
              When cash arrives: record it immediately so balances stay true.
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/60" />
              Month-end: check <strong className="font-semibold">Reports</strong> — invoiced, collected, outstanding.
            </li>
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
