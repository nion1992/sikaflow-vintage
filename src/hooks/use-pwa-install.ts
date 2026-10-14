import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Outcome = "accepted" | "dismissed" | "unavailable";

// Module-level cache so the one-shot browser event is never lost across
// component mounts, plus a small listener set so every consumer stays in sync.
let cachedEvent: InstallPromptEvent | null = null;
const listeners = new Set<(available: boolean) => void>();

function setEvent(event: InstallPromptEvent | null) {
  cachedEvent = event;
  for (const notify of listeners) notify(event !== null);
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    setEvent(e as InstallPromptEvent);
  });
  window.addEventListener("appinstalled", () => setEvent(null));
}

export function usePwaInstall() {
  const [canInstall, setCanInstall] = useState(cachedEvent !== null);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    listeners.add(setCanInstall);
    setCanInstall(cachedEvent !== null);

    const mq = window.matchMedia("(display-mode: standalone)");
    const sync = () =>
      setIsStandalone(
        mq.matches ||
          (window.navigator as Navigator & { standalone?: boolean })
            .standalone === true,
      );
    sync();
    mq.addEventListener("change", sync);
    return () => {
      listeners.delete(setCanInstall);
      mq.removeEventListener("change", sync);
    };
  }, []);

  const install = async (): Promise<Outcome> => {
    if (!cachedEvent) return "unavailable";
    const event = cachedEvent;
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === "accepted") setEvent(null);
    return outcome;
  };

  return { canInstall, isStandalone, install };
}
