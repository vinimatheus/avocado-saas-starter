"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, type ReactNode } from "react";
import {
  ArrowRightIcon,
  BarChart3Icon,
  BadgeCheckIcon,
  BlocksIcon,
  CheckIcon,
  CircleDollarSignIcon,
  CloudIcon,
  CreditCardIcon,
  DatabaseIcon,
  KeyRoundIcon,
  LayersIcon,
  LockIcon,
  MailCheckIcon,
  ServerCogIcon,
  ShieldCheckIcon,
  WorkflowIcon,
} from "lucide-react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";

gsap.registerPlugin(ScrollTrigger);

const stackBadges = [
  { label: "Next.js 16", icon: LayersIcon },
  { label: "Better Auth", icon: ShieldCheckIcon },
  { label: "Prisma", icon: DatabaseIcon },
  { label: "PostgreSQL", icon: ServerCogIcon },
  { label: "AbacatePay", icon: CircleDollarSignIcon },
  { label: "Recharts", icon: BarChart3Icon },
  { label: "Shadcn UI", icon: BlocksIcon },
  { label: "Docker", icon: CloudIcon },
];

const bentoFeatures = [
  {
    title: "Segurança de elite",
    description: "Fluxo completo, email, auth social e 2FA prontos.",
    icon: LockIcon,
  },
  {
    title: "Fluxo inteligente",
    description: "Tenant context, orgs e papéis reais sem gambiarras.",
    icon: WorkflowIcon,
  },
  {
    title: "Planos escaláveis",
    description: "Limites, permissões e dunning inclusos no pacote.",
    icon: CreditCardIcon,
  },
  {
    title: "Pronto para evoluir",
    description: "Prisma + Postgres com arquitetura para escalar rápido.",
    icon: DatabaseIcon,
  },
];

const docsItems = [
  {
    title: "Rotas de autenticação prontas",
    description: "Telas de login, cadastro e redefinição blindadas.",
    icon: KeyRoundIcon,
  },
  {
    title: "Dashboard Multi-tenant",
    description: "Gerencie dados com contexto isolado por organização.",
    icon: LayersIcon,
  },
  {
    title: "Webhooks Integrados",
    description: "Webhook seguro para AbacatePay, Stripe ou similares.",
    icon: ShieldCheckIcon,
  },
  {
    title: "Docker Ready",
    description: "Levante bancos localmente com 1 comando via container.",
    icon: CloudIcon,
  },
];



const plans = [
  {
    name: "Gratuito",
    price: "R$ 0",
    subtitle: "mensal",
    description: "Ideal para iniciar seu piloto.",
    features: ["1 organização", "1 usuário", "Base do produto"],
    highlight: false,
  },
  {
    name: "Starter",
    price: "R$ 50",
    subtitle: "mensal",
    description: "Para times decolando.",
    features: ["Até 5 organizações", "Até 50 usuários", "Ações em lote"],
    highlight: false,
  },
  {
    name: "Pro",
    price: "R$ 100",
    subtitle: "mensal",
    description: "Scale absoluto.",
    features: ["Até 10 organizações", "Até 100 usuários", "Acesso à API"],
    highlight: true,
  },
  {
    name: "Scale",
    price: "R$ 400",
    subtitle: "mensal",
    description: "Sem limites.",
    features: ["Tudo ilimitado", "Gerente dedicado", "SLA 99.9%"],
    highlight: false,
  },
];



function Badge({ icon, text, className }: { icon: ReactNode; text: string; className?: string }) {
  return (
    <div className={`inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 shadow-[0_0_0_3px_hsl(var(--primary)/0.08)] ${className || ""}`}>
      <span className="text-primary">{icon}</span>
      <span className="text-foreground text-xs font-semibold tracking-wide">{text}</span>
    </div>
  );
}

export function MarketingLanding() {
  const container = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    // Hero Entrance
    const tl = gsap.timeline({ defaults: { ease: "power4.out" } });

    tl.fromTo(".hero-badge", { y: -20, opacity: 0 }, { y: 0, opacity: 1, duration: 1 })
      .fromTo(".hero-title", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 1.2 }, "-=0.8")
      .fromTo(".hero-subtitle", { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 1 }, "-=1")
      .fromTo(".hero-cta", { y: 20, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.2, duration: 0.8 }, "-=0.8");

    // Dashboard Mockup 3D and Scroll Parallax
    gsap.fromTo(".dash-mockup",
      { rotationX: 15, scale: 0.9, y: 50, opacity: 0 },
      {
        rotationX: 0, scale: 1, y: 0, opacity: 1, duration: 1.5, ease: "power3.out",
        scrollTrigger: {
          trigger: ".dash-section",
          start: "top 80%",
        }
      }
    );

    // Fade Up Sections Elements Staggered
    const sections = gsap.utils.toArray<HTMLElement>(".fade-up-section");
    sections.forEach((sec) => {
      const els = sec.querySelectorAll(".fade-up-item");
      gsap.fromTo(els,
        { y: 50, opacity: 0 },
        {
          y: 0, opacity: 1, stagger: 0.15, duration: 1, ease: "power3.out",
          scrollTrigger: {
            trigger: sec,
            start: "top 85%",
          }
        }
      );
    });

  }, { scope: container });

  return (
    <main ref={container} className="bg-background text-foreground relative min-h-screen overflow-x-hidden">
      {/* Dynamic Backgrounds */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="bg-primary/20 absolute -left-20 -top-20 h-[500px] w-[500px] rounded-full blur-[120px]" />
        <div className="bg-accent/20 absolute right-[-10%] top-[30%] h-[400px] w-[400px] rounded-full blur-[120px]" />
        <div className="bg-primary/10 absolute bottom-0 left-[20%] h-[500px] w-[500px] rounded-full blur-[150px]" />
      </div>

      <div className="relative mx-auto max-w-[1200px] px-4 pb-20 sm:px-6 lg:px-8">

        {/* Navigation */}
        <header className="bg-background/70 sticky top-4 z-50 mx-auto flex w-full max-w-5xl items-center justify-between gap-2 rounded-full border border-border/50 px-3 py-2.5 shadow-xl backdrop-blur-md sm:gap-4 md:px-4">
          <div className="flex items-center gap-2 sm:gap-6">
            <Link href="/" className="rounded-full px-1.5 py-1 transition hover:bg-primary/5 sm:px-2">
              <Logo size="sm" showGlow={true} />
            </Link>
            <nav className="text-muted-foreground hidden items-center gap-6 text-sm font-medium sm:flex">
              <a href="#produto" className="transition hover:text-primary">Visão Geral</a>
              <a href="#stack" className="transition hover:text-primary">Stack</a>
              <a href="#precos" className="transition hover:text-primary">Preços</a>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle className="hidden sm:inline-flex" />
            <Link
              href="/sign-in"
              className="text-foreground hover:text-primary hidden text-sm font-semibold transition sm:inline-block"
            >
              Entrar
            </Link>
            <Link
              href="/sign-up"
              className="bg-primary text-primary-foreground inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-xs font-bold shadow-[0_0_15px_hsl(var(--primary)/0.4)] transition hover:shadow-[0_0_25px_hsl(var(--primary)/0.6)] hover:scale-105 sm:px-5 sm:text-sm"
            >
              Acesso Exclusivo <ArrowRightIcon className="size-4" />
            </Link>
          </div>
        </header>

        {/* Hero Section */}
        <section className="relative flex flex-col items-center justify-center pb-16 pt-32 text-center lg:pb-32 lg:pt-48">
          <div className="hero-badge">
            <Badge icon={<BadgeCheckIcon className="size-4" />} text="Nova Versão Avocado Turbo 2.0" />
          </div>
          <h1 className="hero-title mt-6 max-w-4xl text-balance text-4xl font-black leading-[1.1] tracking-tight sm:text-6xl md:text-7xl lg:text-[5rem]">
            Construa seu SaaS{" "}<br className="hidden md:block" />
            <span className="from-primary via-primary to-accent bg-gradient-to-r bg-clip-text text-transparent">em um final de semana</span>
          </h1>
          <p className="hero-subtitle text-muted-foreground mt-6 max-w-2xl text-balance text-lg font-medium leading-relaxed sm:text-xl">
            Pare de reinventar a roda. Autenticação, métricas, multi-tenant e planos
            já prontos para você focar exclusivamente na regra de negócio do seu produto.
          </p>

          <div className="mt-10 flex w-full max-w-md flex-col items-center justify-center gap-4 sm:max-w-none sm:flex-row">
            <Link
              href="/sign-up"
              className="hero-cta bg-foreground text-background inline-flex w-full items-center justify-center gap-2 rounded-full px-8 py-4 text-base font-bold shadow-xl transition hover:scale-105 sm:w-auto"
            >
              Começar a codar
              <ArrowRightIcon className="size-5" />
            </Link>
            <a
              href="#produto"
              className="hero-cta border-border bg-card/60 text-foreground inline-flex w-full items-center justify-center gap-2 rounded-full border px-8 py-4 text-base font-bold backdrop-blur-sm transition hover:bg-card sm:w-auto"
            >
              Ver Dashboard
              <MailCheckIcon className="size-5" />
            </a>
          </div>
        </section>

        {/* App Mockup Presentation */}
        <section id="produto" className="dash-section relative mx-auto w-full max-w-6xl pb-24">
          <div className="dash-mockup relative z-10 mx-auto w-full rounded-[2rem] border border-border/60 bg-card p-2 shadow-2xl xl:p-4">
            <div className="relative overflow-hidden rounded-[1.5rem] border border-border/40 bg-background">
              <Image
                src="/assets/dash-mockup.png"
                width={1200}
                height={800}
                alt="Dashboard Mockup"
                className="w-full h-auto object-cover"
                priority
              />
            </div>
            {/* Soft Glow Behind Image */}
            <div className="absolute -inset-4 -z-10 rounded-[3rem] bg-gradient-to-b from-primary/30 to-accent/10 opacity-50 blur-2xl" />
          </div>
        </section>

        {/* Stack section */}
        <section id="stack" className="fade-up-section relative border-y border-border py-20 lg:py-32">
          <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
            <h2 className="fade-up-item text-3xl font-black tracking-tight sm:text-5xl">
              Stack Premium de Produção
            </h2>
            <p className="fade-up-item text-muted-foreground mt-4 text-lg">
              As melhores e mais modernas ferramentas configuradas juntas perfeitamente.
            </p>
          </div>

          <div className="mt-16 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:gap-6">
            {stackBadges.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="fade-up-item bg-card/40 border-border/60 flex h-32 flex-col items-center justify-center gap-3 rounded-2xl border backdrop-blur-sm transition hover:scale-[1.03] hover:border-primary/50 hover:bg-card">
                  <div className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-xl border border-primary/20">
                    <Icon className="size-6" />
                  </div>
                  <span className="text-foreground font-semibold">{item.label}</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Bento Grid */}
        <section className="fade-up-section py-20 lg:py-32">
          <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
            <Badge icon={<LayersIcon className="size-3.5" />} text="Recursos Completos" className="fade-up-item" />
            <h2 className="fade-up-item mt-4 text-3xl font-black tracking-tight sm:text-5xl">
              Design que <span className="text-primary">impressiona</span>
            </h2>
          </div>

          <div className="mt-16 grid gap-6 md:grid-cols-2">
            {bentoFeatures.map((feat) => {
              const Icon = feat.icon;
              return (
                <article key={feat.title} className="fade-up-item group bg-card/30 border-border/80 relative overflow-hidden rounded-3xl border p-8 transition hover:bg-card">
                  <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/10 blur-3xl transition group-hover:bg-primary/20" />
                  <Icon className="text-primary size-8" />
                  <h3 className="mt-6 text-xl font-bold tracking-tight">{feat.title}</h3>
                  <p className="text-muted-foreground mt-2 text-base leading-relaxed">{feat.description}</p>
                </article>
              );
            })}
          </div>
        </section>

        {/* Docs / Modules Built */}
        <section className="fade-up-section border-t border-border py-20 lg:py-32">
          <div className="grid gap-12 lg:grid-cols-[1fr_2fr]">
            <div className="fade-up-item">
              <h2 className="text-3xl font-black tracking-tight sm:text-5xl">Módulos Funcionais Reais</h2>
              <p className="text-muted-foreground mt-4 text-lg">
                Não é apenas um template estético. É código real operando autenticação,
                banco e multi-tenant no back-end.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {docsItems.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="fade-up-item bg-card/60 rounded-2xl border border-border p-6 shadow-sm transition hover:shadow-md">
                    <div className="bg-primary/10 text-primary mb-4 flex size-10 items-center justify-center rounded-lg">
                      <Icon className="size-5" />
                    </div>
                    <h4 className="font-bold">{item.title}</h4>
                    <p className="text-muted-foreground mt-2 text-sm">{item.description}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="precos" className="fade-up-section border-t border-border py-20 lg:py-32">
          <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
            <h2 className="fade-up-item text-3xl font-black tracking-tight sm:text-5xl">Invista no seu tempo</h2>
            <p className="fade-up-item text-muted-foreground mt-4 text-lg">Escolha o plano que faz sentido para você.</p>
          </div>

          <div className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => (
              <div key={plan.name} className={`fade-up-item flex flex-col justify-between rounded-3xl border p-8 transition hover:-translate-y-1 ${plan.highlight
                ? "border-primary bg-primary/5 shadow-[0_10px_30px_hsl(var(--primary)/0.15)] ring-1 ring-primary/50"
                : "border-border bg-card/40 hover:bg-card"
                }`}>
                <div>
                  {plan.highlight && (
                    <span className="bg-primary text-primary-foreground mb-4 inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider">
                      Mais Popular
                    </span>
                  )}
                  <h3 className="text-xl font-bold">{plan.name}</h3>
                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="text-4xl font-black">{plan.price}</span>
                    <span className="text-muted-foreground text-sm">/{plan.subtitle}</span>
                  </div>
                  <p className="text-muted-foreground mt-4 text-sm">{plan.description}</p>

                  <ul className="mt-6 space-y-3">
                    {plan.features.map(f => (
                      <li key={f} className="flex gap-2 text-sm font-medium">
                        <CheckIcon className="text-primary size-5 shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <Link
                  href="/sign-up"
                  className={`mt-8 flex w-full justify-center rounded-xl py-3 font-semibold transition ${plan.highlight
                    ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                    }`}
                >
                  Adquirir Agora
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ & CTA Footer */}
        <section className="fade-up-section py-20">
          <div className="bg-primary/5 border-primary/20 relative overflow-hidden rounded-[3rem] border p-12 text-center lg:p-24">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10" />
            <div className="relative z-10 mx-auto max-w-3xl">
              <h2 className="fade-up-item text-4xl font-black sm:text-6xl">
                Pronto para lançar?
              </h2>
              <p className="fade-up-item text-muted-foreground mt-6 text-xl">
                Assuma o controle e não perca tempo configurando rotas.
              </p>
              <Link
                href="/sign-up"
                className="fade-up-item bg-primary text-primary-foreground mt-10 inline-flex items-center justify-center gap-2 rounded-full px-10 py-5 text-lg font-bold shadow-2xl transition hover:scale-105"
              >
                Obter Acesso Imediato
                <ArrowRightIcon className="size-5" />
              </Link>
            </div>
          </div>
        </section>

        <footer className="fade-up-section mt-10 flex flex-col items-center justify-between gap-6 border-t border-border/50 pt-8 pb-4 text-center sm:flex-row">
          <div className="flex items-center gap-3">
            <Logo size="sm" showGlow={true} />
            <p className="text-muted-foreground text-sm font-medium">© {new Date().getFullYear()} Avocado SaaS. Todos os direitos reservados.</p>
          </div>
          <div className="text-muted-foreground flex gap-6 text-sm font-semibold">
            <a href="#produto" className="hover:text-primary transition">Produto</a>
            <a href="#precos" className="hover:text-primary transition">Preços</a>
            <a href="#faq" className="hover:text-primary transition">FAQ</a>
          </div>
        </footer>
      </div>
    </main>
  );
}
