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
import { Separator } from "@/components/ui/separator";
import AppShell from "@/components/AppShell";
import AppearanceCard from "@/components/AppearanceCard";
import { useBusiness } from "@/hooks/use-business";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { formatDate, formatMoney, BPS_PER_PERCENT } from "@/lib/money";
import { useUsage } from "@/hooks/use-usage";
import UpgradeDialog from "@/components/UpgradeDialog";
import { Badge } from "@/components/ui/badge";
import {
  CreditCard,
  DatabaseBackup,
  Loader2,
  Save,
  ImagePlus,
  Trash2,
  Landmark,
  ScrollText,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

type ProfileForm = {
  name: string;
  description: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  website: string;
  taxNumber: string;
};

type SettingsForm = {
  taxPercent: string;
  paymentTerms: string;
  quoteValidity: string;
  quotePrefix: string;
  invoicePrefix: string;
  defaultNotes: string;
  defaultTerms: string;
};

export default function Settings() {
  const { user } = useAuth();
  const {
    business,
    settings,
    logoUrl,
    role,
    isLoading,
  } = useBusiness();

  const updateBusiness = useMutation(api.businesses.updateBusiness);
  const updateSettings = useMutation(api.businesses.updateBusinessSettings);
  const generateUploadUrl = useMutation(api.businesses.generateLogoUploadUrl);
  const setLogo = useMutation(api.businesses.setBusinessLogo);
  const removeLogo = useMutation(api.businesses.removeBusinessLogo);

  const canEdit = role === "owner" || role === "admin";

  const [profile, setProfile] = useState<ProfileForm | null>(null);
  const [docSettings, setDocSettings] = useState<SettingsForm | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Seed local form state from the server once loaded
  useEffect(() => {
    if (business && profile === null) {
      setProfile({
        name: business.name ?? "",
        description: business.description ?? "",
        phone: business.phone ?? "",
        whatsapp: business.whatsapp ?? "",
        email: business.email ?? "",
        address: business.address ?? "",
        website: business.website ?? "",
        taxNumber: business.taxNumber ?? "",
      });
    }
  }, [business, profile]);

  useEffect(() => {
    if (settings && docSettings === null) {
      setDocSettings({
        taxPercent: String(settings.defaultTaxRateBps / BPS_PER_PERCENT),
        paymentTerms: String(settings.defaultPaymentTermsDays),
        quoteValidity: String(settings.defaultQuoteValidityDays),
        quotePrefix: settings.quotePrefix,
        invoicePrefix: settings.invoicePrefix,
        defaultNotes: settings.defaultNotes ?? "",
        defaultTerms: settings.defaultTerms ?? "",
      });
    }
  }, [settings, docSettings]);

  const handleSaveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profile) return;
    setIsSavingProfile(true);
    try {
      await updateBusiness({
        name: profile.name,
        description: profile.description || undefined,
        phone: profile.phone || undefined,
        whatsapp: profile.whatsapp || undefined,
        email: profile.email || undefined,
        address: profile.address || undefined,
        website: profile.website || undefined,
        taxNumber: profile.taxNumber || undefined,
      });
      toast.success("Business profile saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSaveSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!docSettings) return;
    setIsSavingSettings(true);
    try {
      const percent = Number(docSettings.taxPercent);
      if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
        throw new Error("Tax rate must be between 0 and 100 percent.");
      }
      await updateSettings({
        defaultTaxRateBps: Math.round(percent * BPS_PER_PERCENT),
        defaultPaymentTermsDays: Number(docSettings.paymentTerms) || 0,
        defaultQuoteValidityDays: Number(docSettings.quoteValidity) || 14,
        quotePrefix: docSettings.quotePrefix,
        invoicePrefix: docSettings.invoicePrefix,
        defaultNotes: docSettings.defaultNotes || undefined,
        defaultTerms: docSettings.defaultTerms || undefined,
      });
      toast.success("Document settings saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleLogoPick = async (file: File) => {
    if (file.size > 1024 * 1024) {
      toast.error("Logo must be smaller than 1 MB.");
      return;
    }
    setIsUploadingLogo(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error("Upload failed. Please try again.");
      const { storageId } = (await res.json()) as { storageId: string };
      await setLogo({ storageId: storageId as never });
      toast.success("Logo updated. It will appear on your documents.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setIsUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleLogoRemove = async () => {
    setIsUploadingLogo(true);
    try {
      await removeLogo({});
      toast.success("Logo removed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove logo.");
    } finally {
      setIsUploadingLogo(false);
    }
  };

  if (isLoading || !business || !profile || !docSettings) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="mr-2 size-5 animate-spin" />
          Opening the settings book…
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <header>
          <div className="ledger-label text-muted-foreground">
            SikaFlow · Business settings
          </div>
          <h1 className="letterpress mt-1 font-serif text-2xl font-bold tracking-tight sm:text-3xl">
            Business profile &amp; settings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everything here prints on your quotes and invoices.
          </p>
        </header>

        {/* ── Appearance (personal, this device) ─────────── */}
        <AppearanceCard />

        {!canEdit && (
          <Card className="glass glass-wall border-dashed">
            <CardContent className="p-4 text-sm text-muted-foreground">
              You have view-only access ({role}). Ask an owner or admin to make
              changes.
            </CardContent>
          </Card>
        )}

        {/* ── Profile ──────────────────────────────────────── */}
        <form onSubmit={handleSaveProfile}>
          <Card className="glass glass-card paper-card">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
                  <Landmark className="size-5" />
                </div>
                <div>
                  <CardTitle className="font-serif text-lg">
                    Business profile
                  </CardTitle>
                  <CardDescription>
                    Your name, contacts and VAT number as customers will see
                    them.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Logo */}
              <div className="flex items-center gap-4">
                <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-card">
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt="Business logo"
                      className="size-full object-contain"
                    />
                  ) : (
                    <Landmark className="size-8 text-muted-foreground/50" />
                  )}
                </div>
                <div className="space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleLogoPick(file);
                    }}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!canEdit || isUploadingLogo}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {isUploadingLogo ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                      ) : (
                        <ImagePlus className="mr-2 size-4" />
                      )}
                      {logoUrl ? "Replace logo" : "Upload logo"}
                    </Button>
                    {logoUrl && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={!canEdit || isUploadingLogo}
                        onClick={handleLogoRemove}
                      >
                        <Trash2 className="mr-2 size-4" />
                        Remove
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    PNG, JPG, WEBP or SVG · up to 1 MB.
                  </p>
                </div>
              </div>

              <Separator />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="biz-name">Business name</Label>
                  <Input
                    id="biz-name"
                    value={profile.name}
                    onChange={(e) =>
                      setProfile({ ...profile, name: e.target.value })
                    }
                    disabled={!canEdit || isSavingProfile}
                    required
                    minLength={2}
                    maxLength={80}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="biz-phone">Phone</Label>
                  <Input
                    id="biz-phone"
                    type="tel"
                    value={profile.phone}
                    onChange={(e) =>
                      setProfile({ ...profile, phone: e.target.value })
                    }
                    disabled={!canEdit || isSavingProfile}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="biz-whatsapp">WhatsApp</Label>
                  <Input
                    id="biz-whatsapp"
                    type="tel"
                    value={profile.whatsapp}
                    onChange={(e) =>
                      setProfile({ ...profile, whatsapp: e.target.value })
                    }
                    disabled={!canEdit || isSavingProfile}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="biz-email">Email</Label>
                  <Input
                    id="biz-email"
                    type="email"
                    value={profile.email}
                    onChange={(e) =>
                      setProfile({ ...profile, email: e.target.value })
                    }
                    disabled={!canEdit || isSavingProfile}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="biz-tax">VAT / tax number</Label>
                  <Input
                    id="biz-tax"
                    value={profile.taxNumber}
                    onChange={(e) =>
                      setProfile({ ...profile, taxNumber: e.target.value })
                    }
                    disabled={!canEdit || isSavingProfile}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="biz-address">Physical address</Label>
                  <Input
                    id="biz-address"
                    value={profile.address}
                    onChange={(e) =>
                      setProfile({ ...profile, address: e.target.value })
                    }
                    disabled={!canEdit || isSavingProfile}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="biz-website">Website</Label>
                  <Input
                    id="biz-website"
                    value={profile.website}
                    onChange={(e) =>
                      setProfile({ ...profile, website: e.target.value })
                    }
                    disabled={!canEdit || isSavingProfile}
                    placeholder="www.yourbusiness.co.sz"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="biz-description">Description</Label>
                  <Textarea
                    id="biz-description"
                    rows={2}
                    value={profile.description}
                    onChange={(e) =>
                      setProfile({ ...profile, description: e.target.value })
                    }
                    disabled={!canEdit || isSavingProfile}
                  />
                </div>
              </div>

              {canEdit && (
                <div className="flex justify-end">
                  <Button type="submit" disabled={isSavingProfile}>
                    {isSavingProfile ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 size-4" />
                    )}
                    Save profile
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </form>

        {/* ── Document settings ────────────────────────────── */}
        <form onSubmit={handleSaveSettings}>
          <Card className="glass glass-card paper-card">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
                  <ScrollText className="size-5" />
                </div>
                <div>
                  <CardTitle className="font-serif text-lg">
                    Quotes &amp; invoices
                  </CardTitle>
                  <CardDescription>
                    Defaults used on every new document.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="set-tax">VAT rate (%)</Label>
                  <Input
                    id="set-tax"
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={docSettings.taxPercent}
                    onChange={(e) =>
                      setDocSettings({
                        ...docSettings,
                        taxPercent: e.target.value,
                      })
                    }
                    disabled={!canEdit || isSavingSettings}
                  />
                  <p className="text-xs text-muted-foreground">
                    Eswatini VAT is 15%.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="set-terms-days">Payment terms (days)</Label>
                  <Input
                    id="set-terms-days"
                    type="number"
                    min={0}
                    max={365}
                    value={docSettings.paymentTerms}
                    onChange={(e) =>
                      setDocSettings({
                        ...docSettings,
                        paymentTerms: e.target.value,
                      })
                    }
                    disabled={!canEdit || isSavingSettings}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="set-validity">
                    Quote validity (days)
                  </Label>
                  <Input
                    id="set-validity"
                    type="number"
                    min={1}
                    max={365}
                    value={docSettings.quoteValidity}
                    onChange={(e) =>
                      setDocSettings({
                        ...docSettings,
                        quoteValidity: e.target.value,
                      })
                    }
                    disabled={!canEdit || isSavingSettings}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="set-qt-prefix">Quote prefix</Label>
                  <Input
                    id="set-qt-prefix"
                    value={docSettings.quotePrefix}
                    onChange={(e) =>
                      setDocSettings({
                        ...docSettings,
                        quotePrefix: e.target.value,
                    })}
                    disabled={!canEdit || isSavingSettings}
                    maxLength={5}
                  />
                  <p className="text-xs text-muted-foreground">
                    e.g. QT-2026-0001
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="set-inv-prefix">Invoice prefix</Label>
                  <Input
                    id="set-inv-prefix"
                    value={docSettings.invoicePrefix}
                    onChange={(e) =>
                      setDocSettings({
                        ...docSettings,
                        invoicePrefix: e.target.value,
                      })
                    }
                    disabled={!canEdit || isSavingSettings}
                    maxLength={5}
                  />
                  <p className="text-xs text-muted-foreground">
                    e.g. INV-2026-0001
                  </p>
                </div>
              </div>

              <Separator />

              <div className="space-y-1.5">
                <Label htmlFor="set-notes">Default notes</Label>
                <Textarea
                  id="set-notes"
                  rows={2}
                  value={docSettings.defaultNotes}
                  onChange={(e) =>
                    setDocSettings({
                      ...docSettings,
                      defaultNotes: e.target.value,
                    })
                  }
                  disabled={!canEdit || isSavingSettings}
                  placeholder="e.g. Banking details: FNB …"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="set-terms">Default terms &amp; conditions</Label>
                <Textarea
                  id="set-terms"
                  rows={3}
                  value={docSettings.defaultTerms}
                  onChange={(e) =>
                    setDocSettings({
                      ...docSettings,
                      defaultTerms: e.target.value,
                    })
                  }
                  disabled={!canEdit || isSavingSettings}
                  placeholder="e.g. Payment due within 30 days…"
                />
              </div>

              {canEdit && (
                <div className="flex justify-end">
                  <Button type="submit" disabled={isSavingSettings}>
                    {isSavingSettings ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 size-4" />
                    )}
                    Save settings
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </form>

        {/* ── Plan & usage ─────────────────────────────────── */}
        <PlanCard onUpgrade={() => setUpgradeOpen(true)} />

        {/* ── Off-site backup (Supabase) ───────────────────── */}
        {canEdit && <BackupCard />}

        {/* ── Currency note ────────────────────────────────── */}
        <Card className="glass glass-wall border-dashed">
          <CardContent className="flex flex-col gap-1 p-5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              Currency: <strong className="text-foreground">SZL (E)</strong> —
              amounts are stored exactly in thebe and formatted as{" "}
              {formatMoney(125099)}.
            </span>
            <span className="text-xs">
              Signed in as {user?.email ?? user?.name ?? "owner"}
            </span>
          </CardContent>
        </Card>
      </div>
      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} />
    </AppShell>
  );
}

/* ── Off-site backup (Supabase) card ─────────────────────────── */

function BackupCard() {
  const backups = useQuery(api.backupsData.list);
  const testConnection = useAction(api.supabaseSync.testConnection);
  const backupNow = useAction(api.supabaseSync.backupNow);
  const [busy, setBusy] = useState<"test" | "backup" | null>(null);

  const configured = backups?.configured ?? false;
  const runs = backups?.runs ?? [];
  const lastRun = runs[0];

  const runTest = async () => {
    setBusy("test");
    try {
      const result = await testConnection();
      if (result.ok) {
        toast.success("Connection works — Supabase is reachable.");
      } else {
        toast.error(`Connection failed: ${result.error}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  const runBackup = async () => {
    setBusy("backup");
    try {
      const result = await backupNow();
      if (result.ok) {
        toast.success(
          `Snapshot saved to Supabase — ${result.totalRecords} records.`,
        );
      } else {
        toast.error(`Backup failed: ${result.error}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  return (<Card className="glass glass-card paper-card">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <DatabaseBackup className="size-5" />
          </div>
          <div>
            <CardTitle className="font-serif text-lg">
              Off-site backup</CardTitle>
            <CardDescription>
              Snapshots of your whole ledger, kept in your own Supabase
              Postgres database.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-normal">
            {configured ? "Supabase connected" : "Supabase not connected"}
          </Badge>
          {lastRun && (
            <Badge variant="outline" className="font-normal">
              Last run: {formatDate(lastRun.createdAt)} ·{" "}
              {lastRun.status === "ok"
                ? `${lastRun.totalRecords} records`
                : "failed"}
            </Badge>
          )}
        </div>

        {!configured ? (
          <p className="text-sm leading-6 text-muted-foreground">
            Add the{" "}
            <span className="font-mono text-xs">SUPABASE_URL</span> and{" "}
            <span className="font-mono text-xs">
              SUPABASE_SERVICE_ROLE_KEY
            </span>{" "}
            keys in the Keys tab to enable backups. The SQL for the snapshot
            table is in README.md.
          </p>
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">
            Customers, items, quotes, invoices and payments — everything is
            written as one JSON snapshot, one row per business. Run it after a
            good day's work; the last four runs are kept below.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={runTest}
            disabled={busy !== null}
          >
            {busy === "test" ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <DatabaseBackup className="mr-2 size-4" />
            )}
            Test connection
          </Button>
          <Button size="sm" onClick={runBackup} disabled={busy !== null}>
            {busy === "backup" ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Save className="mr-2 size-4" />
            )}
            Back up now
          </Button>
        </div>

        {runs.length > 0 && (
          <div className="rounded-md border">
            {runs.map((run, index) => (
              <div
                key={run.id}
                className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-xs ${
                  index > 0 ? "border-t" : ""
                }`}
              >
                <span
                  className={
                    run.status === "ok"
                      ? "font-semibold text-primary"
                      : "font-semibold text-destructive"
                  }
                >
                  {run.status === "ok" ? "Saved" : "Failed"}
                </span>
                <span className="text-muted-foreground">
                  {formatDate(run.createdAt)}
                </span>
                <span className="truncate font-mono text-muted-foreground">
                  {run.status === "ok"
                    ? `${run.totalRecords} records`
                    : run.error ?? ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Plan & usage card ───────────────────────────────────────── */

function PlanCard({ onUpgrade }: { onUpgrade: () => void }) {
  const { role, subscription } = useBusiness();
  const { used, limit, canCreate } = useUsage();

  const canManage = role === "owner" || role === "admin";
  const currentPlan = subscription?.plan ?? "free";
  const percentUsed =
    used !== null && limit ? Math.min(100, (used / limit) * 100) : 0;

  return (<Card className="glass glass-card paper-card">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <CreditCard className="size-5" />
          </div>
          <div>
            <CardTitle className="font-serif text-lg">
              Plan &amp; usage</CardTitle>
            <CardDescription>
              Documents this month; limits apply per calendar month.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-normal capitalize">
            {currentPlan} plan
          </Badge>
          {canManage && (
            <Button size="sm" variant="outline" onClick={onUpgrade}>
              {currentPlan === "free" ? "Upgrade" : "Change plan"}
            </Button>
          )}
        </div>
        <div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Documents created</span>
            <span
              className={`font-mono font-semibold ${
                canCreate ? "" : "text-destructive"
              }`}
            >
              {used ?? "–"}/{limit ?? "–"}
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${canCreate ? "bg-primary/70" : "bg-destructive"}`}
              style={{ width: `${percentUsed}%` }}
            />
          </div>
          {!canCreate && (
            <p className="mt-1.5 text-xs text-destructive">
              Limit reached — existing documents are safe, but new ones need an
              upgrade.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
