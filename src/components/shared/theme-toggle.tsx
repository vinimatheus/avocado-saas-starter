"use client";

import { MoonStarIcon, SunMediumIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/shared/utils";
import { THEME_STORAGE_KEY, type Theme } from "@/lib/theme";

function resolveThemeFromDom(): Theme {
  if (typeof document === "undefined") {
    return "light";
  }

  const domTheme = document.documentElement.dataset.theme;
  if (domTheme === "dark" || domTheme === "light") {
    return domTheme;
  }

  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  const isDark = theme === "dark";

  root.classList.toggle("dark", isDark);
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

type ThemeToggleProps = {
  className?: string;
};

export function ThemeToggle({ className }: ThemeToggleProps) {
  const [mounted, setMounted] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const currentTheme = resolveThemeFromDom();
      setIsDark(currentTheme === "dark");
      setMounted(true);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, []);

  function onCheckedChange(checked: boolean): void {
    setIsDark(checked);

    const nextTheme: Theme = checked ? "dark" : "light";
    applyTheme(nextTheme);

    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // Ignore storage restrictions.
    }
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/85 px-2 py-1 shadow-[0_10px_30px_-20px_rgba(20,18,18,0.7)] backdrop-blur transition-[background-color,border-color,box-shadow] duration-300",
        !mounted && "opacity-0",
        className,
      )}
    >
      <SunMediumIcon
        className={cn(
          "size-3.5 transition-all duration-300",
          isDark ? "text-amber-500/35" : "text-amber-500",
        )}
      />
      <Switch
        checked={isDark}
        onCheckedChange={onCheckedChange}
        disabled={!mounted}
        aria-label="Alternar entre modo claro e escuro"
        className="h-7 w-12 border border-border/60 bg-background/90 data-[state=checked]:bg-primary/35 data-[state=unchecked]:bg-muted/60"
      />
      <MoonStarIcon
        className={cn(
          "size-3.5 transition-all duration-300",
          isDark ? "text-sky-400" : "text-sky-400/35",
        )}
      />
    </div>
  );
}
