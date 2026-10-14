import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Check, Moon, Sun, SunMoon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppearance } from "@/hooks/use-appearance";
import {
  BODY_FONTS,
  HEADING_FONTS,
  MODES,
  PALETTES,
  type ModeId,
} from "@/lib/appearance";

const MODE_ICONS: Record<ModeId, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: SunMoon,
};

/**
 * Personal appearance picker — colour scheme, light/dark mode and fonts.
 * Preferences are saved per device and apply instantly.
 */
export default function AppearanceCard() {
  const { appearance, setAppearance } = useAppearance();

  return (
    <Card className="paper-card">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <Sun className="size-5" />
          </div>
          <div>
            <CardTitle className="font-serif text-lg">Appearance</CardTitle>
            <CardDescription>
              Pick a colour scheme, light or dark mode, and the fonts that suit
              you. Saved on this device and applied everywhere.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* ── Colour scheme ──────────────────────────────── */}
        <div className="space-y-2">
          <Label>Colour scheme</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {PALETTES.map((palette) => {
              const active = appearance.palette === palette.id;
              return (
                <button
                  key={palette.id}
                  type="button"
                  onClick={() => setAppearance({ palette: palette.id })}
                  aria-pressed={active}
                  className={cn(
                    "group relative flex h-20 flex-col justify-between rounded-md border p-2.5 text-left transition-shadow",
                    active
                      ? "border-primary ring-2 ring-ring"
                      : "hover:border-foreground/30",
                  )}
                  style={{ backgroundColor: palette.swatch.bg }}
                >
                  <span className="flex items-center justify-between">
                    <span
                      className="h-2.5 w-9 rounded-full"
                      style={{ backgroundColor: palette.swatch.primary }}
                    />
                    {active && (
                      <Check
                        className="size-4"
                        style={{ color: palette.swatch.primary }}
                      />
                    )}
                  </span>
                  <span>
                    <span
                      className="block text-xs font-semibold"
                      style={{ color: palette.swatch.ink }}
                    >
                      {palette.name}
                    </span>
                    <span
                      className="block text-[10px] leading-tight opacity-70"
                      style={{ color: palette.swatch.ink }}
                    >
                      {palette.blurb}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <Separator />

        {/* ── Light / dark ───────────────────────────────── */}
        <div className="space-y-2">
          <Label>Mode</Label>
          <div className="inline-flex rounded-md border p-0.5">
            {MODES.map((mode) => {
              const Icon = MODE_ICONS[mode.id];
              const active = appearance.mode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setAppearance({ mode: mode.id })}
                  aria-pressed={active}
                  className={cn(
                    "flex items-center gap-1.5 rounded-[calc(var(--radius)-2px)] px-3 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5" />
                  {mode.name}
                </button>
              );
            })}
          </div>
        </div>

        <Separator />

        {/* ── Fonts ──────────────────────────────────────── */}
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Heading font</Label>
            <div className="space-y-1.5">
              {HEADING_FONTS.map((font) => {
                const active = appearance.headingFont === font.id;
                return (
                  <button
                    key={font.id}
                    type="button"
                    onClick={() => setAppearance({ headingFont: font.id })}
                    aria-pressed={active}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md border px-3 py-2 text-left transition-colors",
                      active
                        ? "border-primary bg-primary/5"
                        : "hover:bg-accent/50",
                    )}
                  >
                    <span
                      className="truncate text-lg"
                      style={{ fontFamily: font.stack }}
                    >
                      {font.name}
                    </span>
                    {active && <Check className="size-4 shrink-0 text-primary" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Body font</Label>
            <div className="space-y-1.5">
              {BODY_FONTS.map((font) => {
                const active = appearance.bodyFont === font.id;
                return (
                  <button
                    key={font.id}
                    type="button"
                    onClick={() => setAppearance({ bodyFont: font.id })}
                    aria-pressed={active}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left transition-colors",
                      active
                        ? "border-primary bg-primary/5"
                        : "hover:bg-accent/50",
                    )}
                  >
                    <span className="min-w-0">
                      <span
                        className="block truncate text-sm font-medium"
                        style={{ fontFamily: font.stack }}
                      >
                        {font.name}
                      </span>
                      <span
                        className="block truncate text-xs text-muted-foreground"
                        style={{ fontFamily: font.stack }}
                      >
                        {font.sample} · E1,250.00
                      </span>
                    </span>
                    {active && <Check className="size-4 shrink-0 text-primary" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <Separator />

        {/* ── Interface sounds ───────────────────────────── */}
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="ui-sounds">Interface sounds</Label>
            <p className="text-xs text-muted-foreground">
              A soft click whenever you press a button.
            </p>
          </div>
          <Switch
            id="ui-sounds"
            checked={appearance.sounds}
            onCheckedChange={(checked) => setAppearance({ sounds: checked })}
          />
        </div>
      </CardContent>
    </Card>
  );
}
