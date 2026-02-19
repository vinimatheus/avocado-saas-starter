export const THEME_STORAGE_KEY = "avocado-theme";
const THEME_CHANGE_EVENT = "avocado-theme-change";

export type Theme = "light" | "dark";

type ThemeChangeEventDetail = {
  theme: Theme;
};

function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

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

function notifyThemeChange(theme: Theme): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<ThemeChangeEventDetail>(THEME_CHANGE_EVENT, {
      detail: { theme },
    }),
  );
}

export function setTheme(theme: Theme): void {
  applyThemeToDom(theme);
  persistTheme(theme);
  notifyThemeChange(theme);
}

export function subscribeToThemeChange(listener: (theme: Theme) => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleThemeEvent = (event: Event): void => {
    const customEvent = event as CustomEvent<ThemeChangeEventDetail>;
    const nextTheme = customEvent.detail?.theme;
    listener(isTheme(nextTheme) ? nextTheme : resolveThemeFromDom());
  };

  const handleStorageEvent = (event: StorageEvent): void => {
    if (event.key !== THEME_STORAGE_KEY) {
      return;
    }

    const storageTheme = event.newValue;
    listener(isTheme(storageTheme) ? storageTheme : resolveThemeFromDom());
  };

  window.addEventListener(THEME_CHANGE_EVENT, handleThemeEvent);
  window.addEventListener("storage", handleStorageEvent);

  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, handleThemeEvent);
    window.removeEventListener("storage", handleStorageEvent);
  };
}
