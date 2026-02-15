import type { Metadata } from "next";
import { BarChart3Icon, Building2Icon, ShieldCheckIcon } from "lucide-react";

import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";

export const metadata: Metadata = {
  title: {
    default: "Autenticacao",
    template: "%s | avocado SaaS Starter",
  },
  description: "Acesse sua conta e gerencie sua area no avocado SaaS Starter.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
      "max-image-preview": "none",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const highlights = [
    "Autenticacao segura com 2FA e controle de acesso por organizacao.",
    "Fluxo multi-tenant pensado para times e operacao empresarial.",
    "Gestao unificada de produto, usuarios e assinatura em um painel.",
  ];

  return (
    <main className="relative min-h-screen overflow-hidden bg-background">
      <div className="absolute right-6 top-6 z-40">
        <ThemeToggle />
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute -left-40 top-0 size-[34rem] rounded-full bg-primary/18 blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-28 -right-28 size-[34rem] rounded-full bg-accent/20 blur-[120px]"
      />

      <div className="relative mx-auto grid min-h-screen w-full max-w-[1180px] items-center gap-8 px-6 py-10 lg:grid-cols-[1fr_420px] lg:px-10">
        <section className="hidden lg:block">
          <div className="rounded-[2rem] border border-border/65 bg-card/70 p-12 shadow-[0_40px_120px_-80px_rgba(17,35,22,0.55)] backdrop-blur-sm">
            <Logo size="lg" />

            <h1 className="mt-9 max-w-[14ch] text-5xl leading-[1.02] font-black tracking-tight text-foreground">
              Entrada limpa, forte e a altura do seu produto.
            </h1>

            <p className="text-muted-foreground mt-6 max-w-2xl text-base leading-relaxed">
              Um acesso profissional, sem excesso visual. Clareza para quem entra e
              confianca para quem opera.
            </p>

            <ul className="mt-10 space-y-4">
              {highlights.map((text, index) => {
                const Icon = [ShieldCheckIcon, Building2Icon, BarChart3Icon][index];
                return (
                  <li key={text} className="flex items-start gap-3">
                    <span className="bg-primary/12 text-primary mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg">
                      <Icon className="size-4" />
                    </span>
                    <p className="text-muted-foreground text-sm leading-relaxed">{text}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section className="flex items-center lg:justify-end">
          <div className="mx-auto w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-700">
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
