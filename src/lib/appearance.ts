// SikaFlow look & feel — colour scheme, light/dark mode, font choices and
// interface sounds. Preferences are per-device (localStorage); the visual
// ones are applied to <html> via data attributes that override the CSS
// variables in index.css.

export type PaletteId =
  | "vintage"
  | "forest"
  | "ocean"
  | "indigo"
  | "clay"
  | "slate";

export type ModeId = "light" | "dark" | "system";

export type HeadingFontId =
  | "playfair"
  | "fraunces"
  | "lora"
  | "dmserif"
  | "inter";

export type BodyFontId = "source" | "inter" | "nunito" | "plex";

export type Appearance = {
  palette: PaletteId;
  mode: ModeId;
  headingFont: HeadingFontId;
  bodyFont: BodyFontId;
  /** Play a soft click when pressing buttons (see lib/click-sound.ts). */
  sounds: boolean;
};

const STORAGE_KEY = "sikaflow.appearance";

export const DEFAULT_APPEARANCE: Appearance = {
  palette: "vintage",
  mode: "system",
  headingFont: "playfair",
  bodyFont: "source",
  sounds: true,
};

/** Colour schemes — swatch colours are only for the picker preview. */
export const PALETTES: {
  id: PaletteId;
  name: string;
  blurb: string;
  swatch: { bg: string; ink: string; primary: string };
}[] = [
  {
    id: "vintage",
    name: "Vintage",
    blurb: "Aged paper & sepia ink",
    swatch: { bg: "#F2EBDD", ink: "#4A3620", primary: "#8F6B42" },
  },
  {
    id: "forest",
    name: "Forest",
    blurb: "Sage paper & green ink",
    swatch: { bg: "#E9F1E7", ink: "#1F3B2A", primary: "#2F6B45" },
  },
  {
    id: "ocean",
    name: "Ocean",
    blurb: "Cool paper & teal ink",
    swatch: { bg: "#E9F1F5", ink: "#1F3442", primary: "#276A85" },
  },
  {
    id: "indigo",
    name: "Indigo",
    blurb: "Pale blue & deep blue ink",
    swatch: { bg: "#EAEAF5", ink: "#2A2A55", primary: "#3D3D8F" },
  },
  {
    id: "clay",
    name: "Clay",
    blurb: "Warm blush & terracotta",
    swatch: { bg: "#F6ECE7", ink: "#5A2E1F", primary: "#B4552F" },
  },
  {
    id: "slate",
    name: "Slate",
    blurb: "Clean neutral & graphite",
    swatch: { bg: "#F4F5F7", ink: "#2E3138", primary: "#4A5260" },
  },
];

export const MODES: { id: ModeId; name: string }[] = [
  { id: "light", name: "Light" },
  { id: "dark", name: "Dark" },
  { id: "system", name: "System" },
];

/** Heading fonts — stacks must match the overrides in index.css. */
export const HEADING_FONTS: {
  id: HeadingFontId;
  name: string;
  stack: string;
}[] = [
  { id: "playfair", name: "Playfair", stack: '"Playfair Display", serif' },
  { id: "fraunces", name: "Fraunces", stack: '"Fraunces", serif' },
  { id: "lora", name: "Lora", stack: '"Lora", serif' },
  { id: "dmserif", name: "DM Serif", stack: '"DM Serif Display", serif' },
  { id: "inter", name: "Inter", stack: '"Inter", sans-serif' },
];

/** Body fonts — stacks must match the overrides in index.css. */
export const BODY_FONTS: {
  id: BodyFontId;
  name: string;
  stack: string;
  sample: string;
}[] = [
  {
    id: "source",
    name: "Source Sans",
    stack: '"Source Sans 3", sans-serif',
    sample: "Invoices, quotes & payments",
  },
  {
    id: "inter",
    name: "Inter",
    stack: '"Inter", sans-serif',
    sample: "Invoices, quotes & payments",
  },
  {
    id: "nunito",
    name: "Nunito",
    stack: '"Nunito Sans", sans-serif',
    sample: "Invoices, quotes & payments",
  },
  {
    id: "plex",
    name: "Plex Sans",
    stack: '"IBM Plex Sans", sans-serif',
    sample: "Invoices, quotes & payments",
  },
];

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === "string" && (options as readonly string[]).includes(value);
}

export function readAppearance(): Appearance {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_APPEARANCE };
    const parsed = JSON.parse(raw) as Partial<Appearance>;
    return {
      palette: isOneOf(parsed.palette, PALETTES.map((p) => p.id))
        ? parsed.palette
        : DEFAULT_APPEARANCE.palette,
      mode: isOneOf(parsed.mode, MODES.map((m) => m.id))
        ? parsed.mode
        : DEFAULT_APPEARANCE.mode,
      headingFont: isOneOf(parsed.headingFont, HEADING_FONTS.map((f) => f.id))
        ? parsed.headingFont
        : DEFAULT_APPEARANCE.headingFont,
      bodyFont: isOneOf(parsed.bodyFont, BODY_FONTS.map((f) => f.id))
        ? parsed.bodyFont
        : DEFAULT_APPEARANCE.bodyFont,
      sounds:
        typeof parsed.sounds === "boolean"
          ? parsed.sounds
          : DEFAULT_APPEARANCE.sounds,
    };
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

export function isDarkActive(appearance: Appearance): boolean {
  if (appearance.mode === "dark") return true;
  if (appearance.mode === "light") return false;
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

export function applyAppearance(appearance: Appearance): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-palette", appearance.palette);
  root.setAttribute("data-heading-font", appearance.headingFont);
  root.setAttribute("data-body-font", appearance.bodyFont);
  root.classList.toggle("dark", isDarkActive(appearance));
}

/* ── Tiny external store so every consumer (Settings card, Toaster)
      stays in sync without prop drilling or duplicate state. ─────── */

let current: Appearance =
  typeof localStorage !== "undefined" ? readAppearance() : { ...DEFAULT_APPEARANCE };

const listeners = new Set<() => void>();

export function getAppearance(): Appearance {
  return current;
}

export function subscribeAppearance(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setAppearance(patch: Partial<Appearance>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* private mode — still applies for this session */
  }
  applyAppearance(current);
  for (const listener of listeners) listener();
}

/** Follow the OS preference when mode is "system". Wired once from the hook. */
export function watchSystemTheme(): () => void {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    if (current.mode === "system") applyAppearance(current);
  };
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
