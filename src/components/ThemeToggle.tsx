import { Button } from "@/components/ui/button";
import { useAppearance } from "@/hooks/use-appearance";
import { Moon, Sun } from "lucide-react";

/** Two-state theme toggle (dusk = dark, daylight = light). Persisted via useAppearance. */
export function ThemeToggle() {
  const { appearance, setAppearance } = useAppearance();

  const toggle = () => {
    const next: "light" | "dark" = appearance.mode === "dark" ? "light" : "dark";
    setAppearance({ mode: next });
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Switch to ${appearance.mode === "dark" ? "light" : "dark"} mode`}
      onClick={toggle}
      className="size-8"
    >
      <Sun className="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">{appearance.mode === "dark" ? "Light mode" : "Dark mode"}</span>
    </Button>
  );
}
