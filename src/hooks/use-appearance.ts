import { useSyncExternalStore, useEffect } from "react";
import {
  getAppearance,
  setAppearance,
  subscribeAppearance,
  watchSystemTheme,
  type Appearance,
} from "@/lib/appearance";

/**
 * Shared appearance state (colour scheme, mode, fonts).
 * Every consumer sees the same values — changing one updates all.
 */
export function useAppearance(): {
  appearance: Appearance;
  setAppearance: (patch: Partial<Appearance>) => void;
} {
  const appearance = useSyncExternalStore(
    subscribeAppearance,
    getAppearance,
    getAppearance,
  );

  // Follow OS light/dark changes while mode is "system".
  useEffect(() => watchSystemTheme(), []);

  return { appearance, setAppearance };
}
