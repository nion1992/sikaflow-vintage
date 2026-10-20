# SikaFlow — Quotes & Invoices for Eswatini Businesses

The simple ledger for the kingdom's makers and traders: quotations, invoices,
customers, payment tracking and WhatsApp follow-ups in one tidy place.
Currency is **SZL (emalangeni, "E")** and VAT is configurable per business
(15% default). Kept simply, kept well.

## Features

| Module | What it does |
| --- | --- |
| **Quotes** | Numbered quotations (`QT-2026-0001`) with item register lines, per-line VAT & discounts, live totals, status workflow, duplicate & one-tap conversion to invoice |
| **Invoices** | Tax invoices (`INV-2026-0001`), Amount-due box, print-ready A4 sheets, WhatsApp / copy sharing |
| **Payments** | Cash, MoMo & bank receipts with balance guards; statuses flow `sent → partially_paid → paid` automatically |
| **Follow-ups** | The reminder desk: overdue nudges, due-soon pings, expiring & awaiting quotes — with `wa.me` deep links |
| **Reports** | Invoiced vs collected, outstanding, overdue, quote funnel & acceptance rate, monthly series, top customers |
| **Plans** | Free / Business / Pro with monthly document quotas, usage meter, instant activation (Stripe checkout wired, deferred — see below) |
| **PWA** | Installable on phones & desktops: real PNG icon set (any + maskable), offline banner, standalone display |

## Tech stack

Vite · React 19 · TypeScript · Tailwind CSS 4 · shadcn/ui · Convex
(backend & database) · Supabase Auth (email OTP, magic link, password) · Bun.

Supabase owns identity; Convex owns app data. The browser hands Convex the
Supabase access token (`ConvexReactClient.setAuth`), Convex verifies it against
the Supabase JWKS, and every function reads the caller with
`ctx.auth.getUserIdentity()` — no per-request header plumbing, no service-role
key on the request path.

## Getting started

```bash
bun install
bun dev            # frontend (managed by the platform in this workspace)
bunx convex dev    # backend & codegen
```

The Convex deployment is configured via `CONVEX_DEPLOYMENT` and
`VITE_CONVEX_URL`.

### Deploying to Vercel

The frontend is a static Vite build; Vercel serves it and nothing else —
the Convex backend is deployed separately with `bunx convex deploy`.

- **Project:** `sikaflow` (team `nion1992s-projects`), production alias
  <https://sikaflow-six.vercel.app>.
- **Build:** `vercel.json` pins `buildCommand: npm run build`
  (`tsc -b && vite build`), output directory `dist`, plus an SPA rewrite so
  react-router deep links (`/auth`, `/quotes/...`) survive a refresh.
- **Environment variables** (Project → Settings → Environment Variables,
  Production *and* Preview — all three are public and baked in at build time):

  ```bash
  VITE_CONVEX_URL=https://<deployment>.convex.cloud
  VITE_SUPABASE_URL=https://<project>.supabase.co
  VITE_SUPABASE_ANON_KEY=<publishable / anon key>
  ```

- **Uploads:** `.vercelignore` excludes `.env.local`, `.env.keys` and scratch
  artifacts from deploy bundles.
- **Deploy:** `npx vercel deploy --prod` from the repo root (or connect the
  GitHub repo for push-to-deploy).
- **Auth redirects:** Supabase → Authentication → URL Configuration must
  include the deployed origin (`https://<project>-<team>.vercel.app/**`) so
  email sign-in links return to the app.

### Auth configuration

Browser (`.env.local`, public — the anon key is safe to ship):

```bash
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable / anon key>
```

Convex deployment (server-side, never `VITE_`-prefixed):

```bash
bunx convex env set SUPABASE_URL https://<project>.supabase.co
# only for off-site snapshots:
bunx convex env set SUPABASE_SERVICE_ROLE_KEY <service-role / secret key>
```

Auth emails (confirmation, magic link / email code, password reset) are branded
in `emails/` — see `emails/README.md`. They can only be applied to the project
once custom SMTP is configured; Supabase no longer allows template
customisation on the default mailer.

In Supabase → Authentication → JWT Keys, use **asymmetric** signing keys
(ES256 or RS256). Convex verifies tokens against
`<SUPABASE_URL>/auth/v1/.well-known/jwks.json` (see `src/convex/auth.config.ts`);
the legacy HS256 shared secret cannot be verified that way. If your project
signs with RS256, change `ALGORITHM` in `auth.config.ts`.

The service-role key is **not** used for authentication — it is only read by
the snapshot actions in `src/convex/supabaseSync.ts`. Keep it out of `.env`;
set it on the Convex deployment only.

## Money & data conventions

- **All money is integer thebe/cents** — never floats. Client helpers live in
  `src/lib/money.ts`; the server mirror is `src/convex/docMath.ts`.
- **Percentages are integer basis points** (100 bps = 1%). VAT 15% = `1500`.
- Every Convex function re-checks membership with `src/convex/authz.ts`
  (`requireMembership`, `requireBusinessAdmin`); document numbers are
  allocated atomically per business and year.
- Free text is length-capped server-side via `src/convex/text.ts`.

## PWA icons

Real PNGs are required for Chrome installability. They are generated from the
archival seal (`public/logo.svg`) with a dependency-free script:

```bash
bun scripts/generate-icons.ts
```

Outputs `public/icons/icon-{192,512}.png`, `public/icons/maskable-{192,512}.png`,
`public/apple-touch-icon.png` and `public/favicon-32.png`. The script is
one-shot; regenerate only if the seal changes.

## Plans & Stripe checkout (wired, activation deferred)

Plan upgrades work today with **instant activation** (no payment). The hosted
Stripe checkout and signature-verified webhook are already implemented — add
these keys when you are ready to charge, and checkout takes over
automatically (the upgrade dialog detects whether checkout is configured):

| Env var (Keys tab) | Purpose |
| --- | --- |
| `STRIPE_SECRET_KEY` | Creates hosted checkout sessions |
| `STRIPE_WEBHOOK_SECRET` | Verifies `checkout.session.completed` events |
| `STRIPE_PRICE_BUSINESS` | Price ID for the Business plan |
| `STRIPE_PRICE_PRO` | Price ID for the Pro plan |

The webhook endpoint is `POST /stripe/webhook` (registered in
`src/convex/http.ts`); paid events activate plans through the trusted
internal `billing.applyPaidPlan`.

## Off-site snapshots (Supabase)

Settings → **Off-site backup** writes a JSON snapshot of a business's whole
ledger (customers, items, quotes, invoices, payments, settings) to your own
Supabase Postgres database — one row per business, upserted, so a snapshot
always reflects the latest state. Runs are logged in the Convex `backupRuns`
table (last four kept) and shown in Settings. Owner/admin only; the service
role key never leaves the server.

Keys (Keys tab): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

Create the table in the Supabase SQL editor:

```sql
create table if not exists public.sikaflow_snapshots (
  business_id  text primary key,
  kind         text not null default 'backup',
  snapshot     jsonb not null,
  record_count integer not null default 0,
  created_at   timestamptz not null default now()
);
alter table public.sikaflow_snapshots enable row level security;
-- No policies on purpose: only the service_role key (server-side) touches this.
```

Implementation: `src/convex/supabaseSync.ts` (node actions) +
`src/convex/backupsData.ts` (snapshot collection, run log, UI query).

## Project structure

```
src/
  convex/        schema (16 tables), authz, docMath, business modules,
                 payments, reports, followups, billing, crons, stripe, http
  components/    AppShell (nav + usage + install), documents, UpgradeDialog
  pages/         Landing, Auth, Dashboard, Customers, Products, Quotes,
                 Invoices, Payments, Reports, FollowUps, Settings, previews
  hooks/         use-auth, use-business, use-usage, use-online-status,
                 use-pwa-install, use-appearance
  lib/           money.ts (money math & formatting), appearance.ts
                 (colour schemes, fonts, sounds), click-sound.ts (UI sounds)
public/          manifest.webmanifest, logo.svg, icons/, sounds/
```

## Credits & licences

- UI click sound: **"Sly"** from [notificationsounds.com](https://notificationsounds.com)
  (Creative Commons Attribution 4.0). Shipped as `public/sounds/click.wav`;
  the original Ogg Vorbis download is kept at `public/sounds/click.ogg` and can
  be re-converted with `scripts/convert-click-sound.mjs` (Safari/iOS cannot
  decode Ogg Vorbis, hence the WAV).
- Fonts: Playfair Display, Source Sans 3, Fraunces, Lora, DM Serif Display,
  Inter, Nunito Sans and IBM Plex Sans, served by Google Fonts (OFL).

## Animation language (SikaFlow micro-interactions)

A subtle, premium motion system appended to `src/index.css` — GPU-friendly
(transforms + opacity only), sub-second durations, zero bouncing or overshoot.
Respects `prefers-reduced-motion` automatically.

### Timing / easing

| Token | Value | Use |
| --- | --- | --- |
| `--ease-out` | `cubic-bezier(0.22,1,0.36,1)` | All motion |
| `--duration-fast` | `120ms` | Backdrops, transitions |
| `--duration-mid` | `180ms` |  |
| `--duration-normal` | `250ms` | Entrance, document opens |
| `--duration-slow` | `350ms` |  |

### Entrance classes

| Class | Effect |
| --- | --- |
| `.in-serif` | Serif heading drops in (~250ms) |
| `.animate-in-up` | Card rises ~8–12px into place (dashboard stagger) |
| `.animate-fade-in-up` | Row/list item, tiny 3px rise |
| `.animate-fade-in` | Pure fade |
| `.animate-fade-opacity-in` | Subtle opacity lift |
| `.animate-count` | Digit tick toward target (450ms, finite) |
| `.animate-stagger-1..8` | `animation-delay` 30–240ms for staggered lists |

### Status flow (the signature progression)

`.animate-flow-dot` scales a dot in, and `.animate-flow-line` fades in a
connector — both fire as a status advances (`draft → sent → accepted → paid`).
Drop them on status strips and they light up automatically as the status
changes.

### Success / marks

| Class | Effect |
| --- | --- |
| `.animate-success` | Checkmark draws + scales in (toast icons) |
| `.animate-mark` | Checkmark draw, staggered |

### Document / modal

| Class | Effect |
| --- | --- |
| `.animate-document-open` | Sheet fades up + ~10px rise, `scale 0.98 → 1` |
| `.animate-modal-backdrop` | Backdrop fades in (120ms) |
| `.animate-modal` | Sheet rises + settles (~250ms) |
| `.animate-modal-exit` | Sheet slides out faster (~120ms) |

Applied on the printed preview sheet in `QuotePreview`/`InvoicePreview`,
and on Sheet / Dialog / Drawer via the shadcn `data-[state=open]:animate-in`
classes (tw-animate-css) with `AnimatePresence` so content unmounts before
the close completes.

### Micro-interactions

| Class | Effect |
| --- | --- |
| `.animate-press` | Tiny 0.98 press on tap |
| `.animate-skeleton-breathe` | Continuous subtle breath ( loaders ) |
| `.animate-stamp` | Accent ring draws around a status stamp |
| `.no-hover` / `[data-animate-hover]` | Zero-hover override on `hover:none` devices |

### Hooks

- `useReducedMotion()` (`src/hooks/use-reduced-motion.ts`) — media-query gate;
  used to skip entrance animations when the OS requests reduced motion.
- `useCountUp({ value, from, formatter, duration, smooth })`
  (`src/hooks/use-count-up.ts`) — digit stepper for dashboard stats.
- `animateNumber(from, to, durationMs, formatter)`
  (`src/lib/animate-number.ts`) — frame callback that drives `useCountUp`.

### How it fits the app

- `AppShell` moves the active sidebar pill and animates outlet page swaps.
- `Quotes`/`Invoices` list rows stagger in with `.animate-fade-in-up`,
  and each row carries a status-flow strip that advances with the status.
- Dashboard stats animate with `useCountUp`; quotes/invoices render with
  `.animate-document-open` on their printed sheets.

**V1 is complete.**
