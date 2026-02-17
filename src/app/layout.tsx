import type { Metadata } from "next";
import { Geist, Geist_Mono, Outfit } from "next/font/google";
import NextTopLoader from "nextjs-toploader";
import { Analytics } from "@vercel/analytics/next";

import { Toaster } from "@/components/ui/sonner";
import { resolveSiteOrigin } from "@/lib/seo/site-url";
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

const siteOrigin = resolveSiteOrigin();
const siteName = "Avocado SaaS Starter";
const defaultTitle = "SaaS Starter em Next.js com autenticacao, multi-tenant e planos";
const defaultDescription =
  "Template SaaS pronto para producao com Next.js App Router, autenticacao, multi-tenant por organizacao, planos e painel.";
const defaultSocialImage = `${siteOrigin}/img/social-card.png`;

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  applicationName: siteName,
  title: {
    default: defaultTitle,
    template: "%s | Avocado SaaS Starter",
  },
  description: defaultDescription,
  keywords: [
    "nextjs saas starter",
    "saas starter template",
    "next.js boilerplate",
    "multi-tenant saas",
    "saas com planos",
    "better auth",
    "prisma postgresql",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName,
    title: defaultTitle,
    description: defaultDescription,
    url: "/",
    images: [
      {
        url: defaultSocialImage,
        width: 1200,
        height: 630,
        alt: "Logo do Avocado SaaS Starter em fundo branco",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: defaultTitle,
    description: defaultDescription,
    images: [defaultSocialImage],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
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
        <Analytics />
      </body>
    </html>
  );
}
