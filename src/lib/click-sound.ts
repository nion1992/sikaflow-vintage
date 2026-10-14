// Global interface click sound — plays /sounds/click.wav (soft WAV click)
// whenever a button-like control is pressed. Uses the Web Audio API so rapid
// clicks overlap naturally and there is no media-element latency.
//
// The listener is capture-phase on <document>, so it works everywhere
// (landing, auth, app shell, dialogs, dropdown menus) without touching
// individual components. Sound can be turned off in Settings → Appearance.

import { getAppearance } from "@/lib/appearance";

const SOUND_URL = "/sounds/click.wav";
const VOLUME = 0.35;

// Buttons plus the roles shadcn/ui (Radix) controls use for pressable parts.
const CLICKABLE_SELECTOR = [
  "button",
  '[role="button"]',
  '[role="tab"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="combobox"]',
  '[data-slot="button"]',
  '[data-slot="switch"]',
  "summary",
].join(", ");

let audioContext: AudioContext | null = null;
let clickBuffer: AudioBuffer | null = null;
let priming = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!audioContext) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;
      // Safe to create outside a gesture; it just starts suspended and is
      // resumed inside the click handler below.
      audioContext = new Ctor();
    }
    return audioContext;
  } catch {
    return null;
  }
}

/** Fetch and decode the click sound once, as early as possible. */
async function prime(): Promise<void> {
  if (priming) return;
  priming = true;
  try {
    const [response, context] = await Promise.all([
      fetch(SOUND_URL),
      Promise.resolve(getAudioContext()),
    ]);
    if (!response.ok || !context) return;
    const bytes = await response.arrayBuffer();
    clickBuffer = await context.decodeAudioData(bytes);
  } catch {
    clickBuffer = null; // never break the app over a sound
  }
}

function playClick(): void {
  if (!getAppearance().sounds) return;
  const context = getAudioContext();
  if (!context || !clickBuffer) return;
  try {
    if (context.state === "suspended") void context.resume();
    const source = context.createBufferSource();
    source.buffer = clickBuffer;
    const gain = context.createGain();
    gain.gain.value = VOLUME;
    source.connect(gain).connect(context.destination);
    source.start();
  } catch {
    /* ignore */
  }
}

/** Install once from main.tsx — starts prefetch and listens for clicks. */
export function installClickSounds(): void {
  if (typeof document === "undefined") return;
  void prime();

  document.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const pressed = target.closest(CLICKABLE_SELECTOR);
      if (!pressed) return;
      if (pressed.closest("[disabled], [aria-disabled='true'], [data-disabled]"))
        return;
      playClick();
    },
    { capture: true, passive: true },
  );
}
