"use client";

import { CheckIcon, MoonStarIcon, PaletteIcon, SunMediumIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/shared/utils";
import { resolveThemeFromDom, setTheme, subscribeToThemeChange, type Theme } from "@/lib/theme";

type ThemeOption = {
  value: Theme;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
};

const THEME_OPTIONS: ThemeOption[] = [
  {
    value: "light",
    title: "Claro",
    description: "Visual limpo e iluminado para jornadas longas durante o dia.",
    icon: SunMediumIcon,
  },
  {
    value: "dark",
    title: "Escuro",
    description: "Contraste suave para reduzir fadiga visual em ambientes com pouca luz.",
    icon: MoonStarIcon,
  },
];

export function ThemeAppearanceSection() {
  const [mounted, setMounted] = useState(false);
  const [activeTheme, setActiveTheme] = useState<Theme>("light");

  useEffect(() => {
    const unsubscribe = subscribeToThemeChange((theme) => {
      setActiveTheme(theme);
    });

    const frame = window.requestAnimationFrame(() => {
      setActiveTheme(resolveThemeFromDom());
      setMounted(true);
    });

    return () => {
      unsubscribe();
      window.cancelAnimationFrame(frame);
    };
  }, []);

  function handleThemeSelect(theme: Theme): void {
    setActiveTheme(theme);
    setTheme(theme);
  }

  return (
    <Card className="overflow-hidden border-primary/25 bg-gradient-to-br from-background via-background to-primary/10 shadow-[0_20px_45px_-35px_hsl(var(--primary)/0.7)]">
      <CardHeader className="space-y-2">
        <div className="bg-primary/12 text-primary ring-primary/30 inline-flex size-8 items-center justify-center rounded-lg ring-1">
          <PaletteIcon className="size-4" />
        </div>
        <CardTitle>Aparencia</CardTitle>
        <CardDescription>
          Escolha como o produto deve ser exibido. A preferencia e aplicada e salva automaticamente.
        </CardDescription>
      </CardHeader>

      <CardContent className="grid gap-3 sm:grid-cols-2">
        {THEME_OPTIONS.map((option) => {
          const isActive = activeTheme === option.value;
          const OptionIcon = option.icon;

          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={isActive}
              onClick={() => {
                handleThemeSelect(option.value);
              }}
              disabled={!mounted}
              className={cn(
                "relative overflow-hidden rounded-2xl border px-4 py-4 text-left outline-none transition-all duration-300 focus-visible:border-ring focus-visible:ring-ring/30 focus-visible:ring-2",
                option.value === "light"
                  ? "from-slate-100/80 via-white to-amber-50/80 border-slate-300/70 bg-gradient-to-br hover:border-amber-400/50"
                  : "from-slate-950/95 via-slate-900 to-sky-950/85 border-sky-200/15 bg-gradient-to-br text-slate-100 hover:border-sky-300/50",
                !mounted && "cursor-wait opacity-80",
                isActive
                  ? "border-primary/70 shadow-[0_20px_40px_-30px_hsl(var(--primary)/0.85)] ring-1 ring-primary/50"
                  : "hover:-translate-y-0.5 hover:shadow-[0_22px_38px_-34px_hsl(var(--foreground)/0.65)]",
              )}
            >
              <span
                className={cn(
                  "absolute top-3 right-3 inline-flex size-6 items-center justify-center rounded-full border text-[0.625rem] transition-all",
                  isActive
                    ? "border-primary/50 bg-primary/12 text-primary"
                    : option.value === "light"
                      ? "border-slate-300/75 bg-white/85 text-slate-500"
                      : "border-sky-200/20 bg-slate-950/65 text-slate-300",
                )}
              >
                {isActive ? <CheckIcon className="size-3.5" /> : <span className="size-2 rounded-full bg-current/45" />}
              </span>

              <div className="space-y-1">
                <OptionIcon className={cn("size-4", option.value === "light" ? "text-amber-500" : "text-sky-300")} />
                <p className={cn("text-sm font-semibold", option.value === "light" ? "text-slate-900" : "text-slate-100")}>
                  {option.title}
                </p>
                <p
                  className={cn(
                    "max-w-[30ch] text-xs leading-relaxed",
                    option.value === "light" ? "text-slate-600" : "text-slate-300",
                  )}
                >
                  {option.description}
                </p>
              </div>

              <div
                className={cn(
                  "mt-4 grid gap-1.5 rounded-xl border p-3",
                  option.value === "light" ? "border-slate-300/70 bg-white/90" : "border-white/15 bg-black/25",
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-16 rounded-full",
                    option.value === "light" ? "bg-slate-900/85" : "bg-slate-100/85",
                  )}
                />
                <span
                  className={cn(
                    "h-1.5 w-24 rounded-full",
                    option.value === "light" ? "bg-slate-400/60" : "bg-slate-300/55",
                  )}
                />
                <span
                  className={cn(
                    "h-1.5 w-12 rounded-full",
                    option.value === "light" ? "bg-amber-400/70" : "bg-sky-300/70",
                  )}
                />
              </div>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
