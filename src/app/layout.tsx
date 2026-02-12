import type { Metadata } from "next";
import { Geist, Geist_Mono, Outfit } from "next/font/google";
import NextTopLoader from "nextjs-toploader";

import { Toaster } from "@/components/ui/sonner";
import { THEME_STORAGE_KEY } from "@/lib/theme";

import "./globals.css";

const outfit = Outfit({ subsets: ['latin'], variable: '--font-sans' });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const themeInitScript = `
(() => {
  const storageKey = "${THEME_STORAGE_KEY}";
  const root = document.documentElement;
  const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  let activeTheme = systemTheme;

  try {
    const storedTheme = localStorage.getItem(storageKey);
    if (storedTheme === "light" || storedTheme === "dark") {
      activeTheme = storedTheme;
    }
  } catch {
    activeTheme = systemTheme;
  }

  const isDark = activeTheme === "dark";
  root.classList.toggle("dark", isDark);
  root.dataset.theme = activeTheme;
  root.style.colorScheme = activeTheme;
})();
`;

export const metadata: Metadata = {
  title: "avocado SaaS",
  description: "Plataforma SaaS com autenticacao, organizacoes e gestao de equipe.",
  icons: {
    icon: "/img/logo.png",
    shortcut: "/img/logo.png",
    apple: "/img/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={outfit.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <NextTopLoader color="var(--primary)" showSpinner={false} />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
