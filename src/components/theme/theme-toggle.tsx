"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import { useIsClient } from "@/hooks/use-is-client";

const THEMES = ["light", "dark", "system"] as const;
type Theme = (typeof THEMES)[number];

const ICONS: Record<Theme, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useIsClient();

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-hidden="true"
        tabIndex={-1}
        className="opacity-0"
      />
    );
  }

  const current = (theme ?? "system") as Theme;
  const Icon = ICONS[current];

  function cycleTheme() {
    const nextIndex = (THEMES.indexOf(current) + 1) % THEMES.length;
    setTheme(THEMES[nextIndex] ?? "system");
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={cycleTheme}
      aria-label={`Theme: ${current}. Activate to switch theme.`}
    >
      <Icon aria-hidden="true" className="size-4" />
    </Button>
  );
}
