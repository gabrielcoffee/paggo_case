"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  // Render BOTH icons and let CSS pick one via the `dark` class that next-themes
  // sets on <html> before hydration. This keeps the server/client markup identical
  // (no hydration mismatch) while still flipping with the theme. The label stays
  // static for the same reason; the click handler reads the resolved theme at runtime.
  return (
    <button
      type="button"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
      aria-label="Alternar tema"
      title="Alternar tema"
    >
      <Sun className="hidden h-3.5 w-3.5 dark:block" />
      <Moon className="h-3.5 w-3.5 dark:hidden" />
    </button>
  );
}
