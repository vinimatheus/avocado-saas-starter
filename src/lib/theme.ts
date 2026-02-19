export const THEME_STORAGE_KEY = "avocado-theme";

export type Theme = "light" | "dark";

export function resolveThemeFromDom(): Theme {
  if (typeof document === "undefined") {
    return "light";
  }

  const domTheme = document.documentElement.dataset.theme;
  if (domTheme === "dark" || domTheme === "light") {
    return domTheme;
  }

  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function applyThemeToDom(theme: Theme): void {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  const isDark = theme === "dark";

  root.classList.toggle("dark", isDark);
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

export function persistTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage restrictions.
  }
}
