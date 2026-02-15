"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRightIcon,
  BarChart3Icon,
  BadgeCheckIcon,
  BlocksIcon,
  BotIcon,
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
  UsersIcon,
  WorkflowIcon,
} from "lucide-react";

import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";

type ShowcaseCard = {
  title: string;
  description: string;
  label: string;
  metrics: Array<{ name: string; value: string; hint: string }>;
  highlights: string[];
  flow: string[];
};

const showcaseCards: ShowcaseCard[] = [
  {
    title: "Autenticacao pronta para producao",
    description:
      "Login por e-mail/senha, verificacao de e-mail, Google OAuth, reset de senha e suporte a 2FA sem montar do zero.",
    label: "Better Auth + UX completa",
    metrics: [
      { name: "Fluxo", value: "6 telas", hint: "login ate redefinicao" },
      { name: "Seguranca", value: "2FA", hint: "TOTP + codigo de backup" },
      { name: "Primeiro acesso", value: "1 passo", hint: "organizacao no primeiro acesso" },
    ],
    highlights: ["verificacao de e-mail", "login social", "2FA", "validacao de formulario"],
    flow: ["Cadastro", "Verificacao", "Login", "Primeiro acesso"],
  },
  {
    title: "Multi-tenant com organizacoes",
    description:
      "Contexto por organizacao, alternador na sidebar, convites de equipe e papeis para controlar quem acessa cada modulo.",
    label: "Contexto de organizacao centralizado",
    metrics: [
      { name: "Papeis", value: "proprietario/admin/membro", hint: "acesso por permissao" },
      { name: "Convites", value: "status real", hint: "pendente, ativo, expirado" },
      { name: "Espaco", value: "dinamico", hint: "troca de organizacao imediata" },
    ],
    highlights: [
      "alternador de organizacao",
      "convites de equipe",
      "controle de papeis",
      "sincronizacao da organizacao ativa",
    ],
    flow: ["Criar organizacao", "Convidar", "Aceitar convite", "Operar em equipe"],
  },
  {
    title: "Planos integrados com AbacatePay",
    description:
      "Planos Gratuito/Starter/Pro/Scale, periodo de teste, upgrade/downgrade, dunning, webhook com assinatura HMAC e idempotencia.",
    label: "Assinaturas + governanca",
    metrics: [
      { name: "Planos", value: "4 niveis", hint: "R$0, R$50, R$100, R$400" },
      { name: "Webhook", value: "HMAC", hint: "segredo + assinatura" },
      { name: "Ciclo", value: "mensal/anual", hint: "pagamento com redirecionamento seguro" },
    ],
    highlights: ["periodo de teste", "periodo de graca", "direitos por plano", "limites de uso"],
    flow: ["Escolher plano", "Pagamento", "Webhook", "Permissao atualizada"],
  },
];

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
    title: "Seguranca de elite",
    description:
      "Fluxo de autenticacao completo com verificacao de e-mail, suporte a login social e protecao 2FA para contas sensiveis.",
    icon: LockIcon,
    bars: [36, 58, 44],
  },
  {
    title: "Fluxo inteligente",
    description:
      "Tenant context, organizacoes e membros com papeis reais para operar times sem gambiarras de autorizacao.",
    icon: WorkflowIcon,
    bars: [40, 64, 52],
  },
  {
    title: "Planos escalaveis",
    description:
      "Permissoes por plano, controle de limites, dunning e restricoes operacionais em caso de excedente ou atraso.",
    icon: CreditCardIcon,
    bars: [48, 72, 66],
  },
  {
    title: "Base pronta para evoluir",
    description:
      "Prisma + PostgreSQL, comandos de configuracao e arquitetura clara para adicionar novos modulos sem quebrar a base.",
    icon: DatabaseIcon,
    bars: [34, 49, 61],
  },
];

const docsItems = [
  {
    title: "Rotas de autenticacao prontas",
    description:
      "`/sign-in`, `/sign-up`, `/forgot-password` e `/reset-password` com validacao, mensagens e estados de erro.",
    icon: KeyRoundIcon,
  },
  {
    title: "Espaco com painel",
    description:
      "`/dashboard`, `/billing`, `/profile` e `/produtos` com layout compartilhado e contexto da organizacao.",
    icon: LayersIcon,
  },
  {
    title: "Webhook protegido",
    description:
      "`POST /api/webhooks/abacatepay` valida segredo, assinatura HMAC, idempotencia e limite de requisicoes por IP.",
    icon: ShieldCheckIcon,
  },
  {
    title: "Configuracao rapida do ambiente",
    description:
      "Scripts para subir PostgreSQL no Docker, gerar Prisma Client e sincronizar schema em poucos comandos.",
    icon: CloudIcon,
  },
];

const starterFit = [
  {
    title: "Fundadores",
    description:
      "Lance um SaaS com autenticacao, planos e multi-tenant sem gastar semanas montando infraestrutura basica.",
  },
  {
    title: "Times de produto",
    description:
      "Comece com uma base padronizada para focar na feature de negocio, nao em plumbing de plataforma.",
  },
  {
    title: "Consultorias e agencias",
    description:
      "Entregue MVPs SaaS com stack moderna e componentes reutilizaveis para reduzir prazo e retrabalho.",
  },
];

const plans = [
  {
    name: "Gratuito",
    price: "R$ 0",
    subtitle: "mensal",
    description: "Ideal para validacao inicial e uso individual.",
    features: ["1 organizacao", "1 usuario", "Base do produto"],
    highlight: false,
  },
  {
    name: "Plano R$ 50",
    price: "R$ 50",
    subtitle: "mensal",
    description: "Para equipes pequenas que estao saindo do piloto.",
    features: ["Ate 5 organizacoes", "Ate 50 usuarios", "Convites + acoes em lote"],
    highlight: false,
  },
  {
    name: "Plano R$ 100",
    price: "R$ 100",
    subtitle: "mensal",
    description: "Escala com analytics e API para integrar operacao.",
    features: ["Ate 10 organizacoes", "Ate 100 usuarios", "Analytics + acesso a API"],
    highlight: true,
  },
  {
    name: "Plano R$ 400",
    price: "R$ 400",
    subtitle: "mensal",
    description: "Operacao sem limites com suporte prioritario.",
    features: ["Usuarios ilimitados", "Organizacoes ilimitadas", "Suporte prioritario"],
    highlight: false,
  },
];

const faq = [
  {
    question: "Esse starter ja exige verificacao de e-mail no login?",
    answer:
      "Sim. O fluxo ja bloqueia login sem verificacao e permite reenviar o link direto da tela de login.",
  },
  {
    question: "Como funciona o multi-tenant por organizacao?",
    answer:
      "Cada usuario opera em uma organizacao ativa, com alternador, convites e papeis de acesso controlados no servidor.",
  },
  {
    question: "Planos e webhook ja estao prontos?",
    answer:
      "Sim. O modulo de planos contempla periodo de teste, upgrade/downgrade e webhook AbacatePay com assinatura HMAC.",
  },
  {
    question: "Posso usar esse starter como base para um SaaS real?",
    answer:
      "Sim. A estrutura foi feita para producao e pode ser expandida com novos modulos mantendo a base de autenticacao, tenant e gestao de planos.",
  },
];

function Badge({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 shadow-[0_0_0_3px_hsl(var(--primary)/0.08)]">
      <span className="text-primary">{icon}</span>
      <span className="text-foreground text-xs font-semibold tracking-wide">{text}</span>
    </div>
  );
}

function DiagonalRail() {
  return (
    <div className="relative h-full w-8 overflow-hidden sm:w-10 md:w-12">
      <div className="absolute -top-36 left-[-54px] flex w-[160px] flex-col">
        {Array.from({ length: 66 }).map((_, index) => (
          <div key={index} className="h-4 rotate-[-45deg] border border-border/55" />
        ))}
      </div>
    </div>
  );
}

function DashboardMock({ card }: { card: ShowcaseCard }) {
  return (
    <div className="h-full w-full rounded-xl border border-border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[0.18em]">{card.label}</p>
          <h4 className="text-foreground mt-1 text-base font-bold sm:text-lg">{card.title}</h4>
        </div>
        <div className="bg-primary/10 text-primary rounded-full border border-primary/20 px-3 py-1 text-xs font-semibold">
          Atualizado agora
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {card.metrics.map((metric) => (
          <article key={metric.name} className="rounded-xl border border-border bg-background/80 p-3 sm:p-4">
            <p className="text-muted-foreground text-[11px] uppercase tracking-[0.16em]">{metric.name}</p>
            <p className="text-foreground mt-1 text-xl font-bold">{metric.value}</p>
            <p className="text-muted-foreground mt-1 text-xs">{metric.hint}</p>
          </article>
        ))}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[1.35fr_1fr]">
        <section className="rounded-xl border border-border bg-background/80 p-4">
          <p className="text-foreground text-sm font-semibold">Visao de saude do modulo</p>
          <div className="mt-4 flex h-32 items-end gap-2 sm:gap-3">
            {[24, 31, 29, 46, 52, 58, 63].map((value, index) => (
              <div key={`${value}-${index}`} className="bg-muted relative flex-1 rounded-md">
                <div
                  className="from-primary/80 via-primary to-accent w-full rounded-md bg-gradient-to-t"
                  style={{ height: `${value}%` }}
                />
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {card.highlights.map((item) => (
              <span
                key={item}
                className="border-border bg-card text-muted-foreground rounded-full border px-2.5 py-1 text-[11px] font-semibold"
              >
                {item}
              </span>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-background/80 p-4">
          <p className="text-foreground text-sm font-semibold">Fluxo padrao</p>
          <div className="mt-4 space-y-3">
            {card.flow.map((item, index) => (
              <div
                key={item}
                className="bg-card border-border flex items-center gap-3 rounded-lg border px-3 py-2"
              >
                <span className="bg-primary text-primary-foreground inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold">
                  {index + 1}
                </span>
                <span className="text-foreground text-xs font-semibold">{item}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function FeatureCard({
  title,
  description,
  isActive,
  progress,
  onClick,
}: {
  title: string;
  description: string;
  isActive: boolean;
  progress: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative min-h-[126px] flex-1 border px-5 py-4 text-left transition md:min-h-[136px] ${isActive
          ? "border-primary/30 bg-card shadow-[0_0_0_0.7px_hsl(var(--primary)/0.25)_inset]"
          : "border-border bg-background/70 hover:bg-card"
        }`}
    >
      {isActive ? (
        <span className="bg-primary/20 absolute inset-x-0 top-0 h-0.5">
          <span
            className="bg-primary block h-full transition-[width] duration-100"
            style={{ width: `${progress}%` }}
          />
        </span>
      ) : null}
      <span className="text-foreground block text-sm font-semibold">{title}</span>
      <span className="text-muted-foreground mt-2 block text-xs leading-5 sm:text-[13px]">{description}</span>
    </button>
  );
}

export function MarketingLanding() {
  const [activeCard, setActiveCard] = useState(0);
  const [progress, setProgress] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const timer = setInterval(() => {
      setProgress((previous) => {
        if (!mountedRef.current) {
          return previous;
        }

        if (previous >= 100) {
          setActiveCard((current) => (current + 1) % showcaseCards.length);
          return 0;
        }

        return previous + 2;
      });
    }, 100);

    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
  }, []);

  const current = showcaseCards[activeCard] ?? showcaseCards[0];

  return (
    <main className="bg-background text-foreground relative min-h-screen overflow-x-clip">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="bg-primary/12 absolute -left-24 -top-24 h-[360px] w-[360px] rounded-full blur-3xl" />
        <div className="bg-accent/18 absolute -right-20 top-[18%] h-[320px] w-[320px] rounded-full blur-3xl" />
        <div className="bg-primary/10 absolute bottom-[-130px] left-[20%] h-[280px] w-[280px] rounded-full blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-[1120px] px-4 pb-20 sm:px-6 lg:px-8">
        <div className="pointer-events-none absolute bottom-0 left-4 top-0 w-px bg-border/80 shadow-[1px_0_0_0_hsl(var(--background))] sm:left-6 lg:left-8" />
        <div className="pointer-events-none absolute bottom-0 right-4 top-0 w-px bg-border/80 shadow-[1px_0_0_0_hsl(var(--background))] sm:right-6 lg:right-8" />

        <header className="bg-background/90 sticky top-3 z-30 mx-auto flex w-full max-w-4xl items-center justify-between gap-4 rounded-full border border-border px-3 py-2 shadow-[0_0_0_2px_hsl(var(--background))] backdrop-blur">
          <div className="flex items-center gap-4">
            <Link href="/" className="rounded-full px-2 py-1 transition hover:bg-primary/5">
              <Logo size="sm" showGlow={false} />
            </Link>
            <nav className="text-muted-foreground hidden items-center gap-4 text-sm font-semibold sm:flex">
              <a href="#produto" className="transition hover:text-foreground">
                Produto
              </a>
              <a href="#stack" className="transition hover:text-foreground">
                Stack
              </a>
              <a href="#precos" className="transition hover:text-foreground">
                Precos
              </a>
              <a href="#faq" className="transition hover:text-foreground">
                FAQ
              </a>
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              href="/sign-in"
              className="border-border bg-card text-foreground rounded-full border px-4 py-2 text-xs font-semibold transition hover:bg-primary/5 sm:text-sm"
            >
              Entrar
            </Link>
            <Link
              href="/sign-up"
              className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition hover:opacity-90 sm:text-sm"
            >
              Criar conta
              <ArrowRightIcon className="size-3.5" />
            </Link>
          </div>
        </header>

        <section className="relative border-b border-border pb-10 pt-16 sm:pt-24 lg:pt-32">
          <div className="mx-auto flex max-w-3xl flex-col items-center text-center animate-in fade-in slide-in-from-bottom-5 duration-700">
            <Badge icon={<BadgeCheckIcon className="size-3.5" />} text="avocado SaaS Starter" />
            <h1 className="mt-5 text-balance text-4xl font-black leading-[1.04] tracking-tight sm:text-5xl lg:text-7xl">
              Next.js SaaS Starter pronto para sair do zero ao painel em horas
            </h1>
            <p className="text-muted-foreground mt-5 max-w-2xl text-balance text-sm font-medium leading-6 sm:text-lg sm:leading-8">
              Base completa com Next.js, Better Auth, multi-tenant por organizacao e planos com AbacatePay,
              Prisma e PostgreSQL para voce focar no produto e nao na infra.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/sign-up"
                className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition hover:opacity-90"
              >
                Comecar gratis
                <ArrowRightIcon className="size-4" />
              </Link>
              <Link
                href="/sign-in"
                className="border-border bg-card text-foreground inline-flex items-center gap-2 rounded-full border px-6 py-3 text-sm font-semibold transition hover:bg-primary/5"
              >
                Entrar na plataforma
                <MailCheckIcon className="size-4" />
              </Link>
            </div>
          </div>

          <div id="produto" className="relative mt-10 sm:mt-14">
            <div className="bg-primary/10 absolute inset-x-[7%] -top-14 h-56 rounded-[50%] blur-2xl" />

            <div className="bg-background/85 mx-auto max-w-5xl rounded-2xl border border-border p-2 sm:p-3">
              <div className="overflow-hidden rounded-xl border border-border bg-card p-3 sm:p-4">
                <DashboardMock card={current} />
              </div>
            </div>

            <div className="bg-background/80 mt-6 border-y border-border">
              <div className="flex items-stretch">
                <DiagonalRail />
                <div className="grid flex-1 gap-0 md:grid-cols-3">
                  {showcaseCards.map((card, index) => (
                    <FeatureCard
                      key={card.title}
                      title={card.title}
                      description={card.description}
                      isActive={activeCard === index}
                      progress={activeCard === index ? progress : 0}
                      onClick={() => {
                        setActiveCard(index);
                        setProgress(0);
                      }}
                    />
                  ))}
                </div>
                <DiagonalRail />
              </div>
            </div>
          </div>
        </section>

        <section id="stack" className="border-b border-border py-10 sm:py-14">
          <div className="mx-auto max-w-2xl text-center">
            <Badge icon={<BlocksIcon className="size-3.5" />} text="Stack de producao" />
            <h2 className="mt-4 text-2xl font-black tracking-tight sm:text-4xl">
              Tecnologias que ja estao conectadas no projeto base
            </h2>
            <p className="text-muted-foreground mt-4 text-sm leading-7 sm:text-base">
              Estrutura moderna para autenticar, faturar e escalar com previsibilidade desde o primeiro deploy.
            </p>
          </div>

          <div className="mt-8 border-y border-border">
            <div className="flex items-stretch">
              <DiagonalRail />
              <div className="grid flex-1 grid-cols-2 border-x border-border sm:grid-cols-4">
                {stackBadges.map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.label}
                      className={`border-border text-foreground flex h-28 items-center justify-center gap-2 sm:h-32 ${index % 2 === 0 ? "border-r" : ""
                        } ${index < stackBadges.length - 2 ? "border-b" : ""} sm:border-r sm:[&:nth-child(4n)]:border-r-0 sm:[&:nth-last-child(-n+4)]:border-b-0`}
                    >
                      <span className="bg-primary/12 text-primary inline-flex size-8 items-center justify-center rounded-full border border-primary/20">
                        <Icon className="size-4" />
                      </span>
                      <span className="text-sm font-semibold tracking-tight sm:text-base">{item.label}</span>
                    </div>
                  );
                })}
              </div>
              <DiagonalRail />
            </div>
          </div>
        </section>

        <section className="border-b border-border py-10 sm:py-14">
          <div className="mx-auto max-w-2xl text-center">
            <Badge icon={<LayersIcon className="size-3.5" />} text="Bento grid" />
            <h2 className="mt-4 text-2xl font-black tracking-tight sm:text-4xl">
              Identidade avocado aplicada em todo o fluxo
            </h2>
            <p className="text-muted-foreground mt-4 text-sm leading-7 sm:text-base">
              A mesma linguagem visual do app principal: foco em clareza, produtividade e operacao SaaS real.
            </p>
          </div>

          <div className="mt-10 border-y border-border">
            <div className="flex items-stretch">
              <DiagonalRail />
              <div className="grid flex-1 border-x border-border md:grid-cols-2">
                {bentoFeatures.map((feature, index) => {
                  const Icon = feature.icon;

                  return (
                    <article
                      key={feature.title}
                      className={`border-border p-6 sm:p-8 ${index < 2 ? "border-b" : ""} ${index % 2 === 0 ? "md:border-r" : ""}`}
                    >
                      <div className="bg-secondary text-secondary-foreground inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs font-semibold">
                        <Icon className="size-3.5" />
                        Core
                      </div>
                      <h3 className="mt-4 text-xl font-bold tracking-tight">{feature.title}</h3>
                      <p className="text-muted-foreground mt-2 text-sm leading-7">{feature.description}</p>

                      <div className="from-background via-muted/35 to-background mt-6 rounded-2xl border border-border bg-gradient-to-br p-4 sm:p-6">
                        <div className="grid grid-cols-3 gap-3">
                          {feature.bars.map((value, barIndex) => (
                            <div key={barIndex} className="bg-card rounded-lg border border-border p-3">
                              <div className="bg-muted h-20 rounded-md">
                                <div
                                  className="from-primary/80 to-primary w-full rounded-md bg-gradient-to-t"
                                  style={{ height: `${value}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
              <DiagonalRail />
            </div>
          </div>
        </section>

        <section className="border-b border-border py-10 sm:py-14">
          <div className="mx-auto max-w-2xl text-center">
            <Badge icon={<DatabaseIcon className="size-3.5" />} text="Documentacao viva" />
            <h2 className="mt-4 text-2xl font-black tracking-tight sm:text-4xl">
              O que ja vem implementado no repositorio
            </h2>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {docsItems.map((item, index) => {
              const Icon = item.icon;

              return (
                <article
                  key={item.title}
                  className="bg-card animate-in fade-in slide-in-from-bottom-4 rounded-2xl border border-border p-5 shadow-[0_2px_8px_rgba(51,45,40,0.05)]"
                  style={{ animationDelay: `${index * 120}ms` }}
                >
                  <div className="bg-primary/12 text-primary inline-flex size-9 items-center justify-center rounded-full border border-primary/20">
                    <Icon className="size-4" />
                  </div>
                  <h3 className="mt-4 text-lg font-bold">{item.title}</h3>
                  <p className="text-muted-foreground mt-2 text-sm leading-7">{item.description}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="border-b border-border py-10 sm:py-14">
          <div className="mx-auto max-w-2xl text-center">
            <Badge icon={<UsersIcon className="size-3.5" />} text="Perfil de uso" />
            <h2 className="mt-4 text-2xl font-black tracking-tight sm:text-4xl">
              Para quem esse starter foi desenhado
            </h2>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {starterFit.map((item) => (
              <article key={item.title} className="bg-card rounded-2xl border border-border p-5">
                <h3 className="text-base font-bold">{item.title}</h3>
                <p className="text-muted-foreground mt-3 text-sm leading-7">{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="precos" className="border-b border-border py-10 sm:py-14">
          <div className="mx-auto max-w-2xl text-center">
            <Badge icon={<CircleDollarSignIcon className="size-3.5" />} text="Precos do projeto" />
            <h2 className="mt-4 text-2xl font-black tracking-tight sm:text-4xl">
              Planos alinhados ao modulo de assinaturas
            </h2>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-4">
            {plans.map((plan) => (
              <article
                key={plan.name}
                className={`rounded-2xl border p-6 ${plan.highlight
                    ? "border-primary/35 bg-primary/8 shadow-[0_8px_24px_rgba(76,175,80,0.22)]"
                    : "border-border bg-card"
                  }`}
              >
                {plan.highlight ? (
                  <span className="border-primary/30 bg-primary/12 text-primary inline-flex rounded-full border px-2.5 py-1 text-xs font-bold">
                    Mais completo
                  </span>
                ) : null}
                <h3 className="mt-3 text-lg font-bold">{plan.name}</h3>
                <p className="text-muted-foreground mt-1 text-sm">{plan.description}</p>
                <div className="mt-5 flex items-end gap-2">
                  <span className="text-foreground text-3xl font-black tracking-tight">{plan.price}</span>
                  <span className="text-muted-foreground pb-1 text-sm font-medium">{plan.subtitle}</span>
                </div>

                <ul className="mt-5 space-y-2">
                  {plan.features.map((feature) => (
                    <li key={feature} className="text-muted-foreground flex items-start gap-2 text-sm">
                      <CheckIcon className="text-primary mt-0.5 size-4" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href="/sign-up"
                  className={`mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${plan.highlight
                      ? "bg-primary text-primary-foreground hover:opacity-90"
                      : "border-border bg-background text-foreground border hover:bg-primary/5"
                    }`}
                >
                  Escolher plano
                  <ArrowRightIcon className="size-4" />
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section id="faq" className="border-b border-border py-10 sm:py-14">
          <div className="mx-auto max-w-2xl text-center">
            <Badge icon={<BotIcon className="size-3.5" />} text="FAQ" />
            <h2 className="mt-4 text-2xl font-black tracking-tight sm:text-4xl">Perguntas frequentes</h2>
          </div>

          <div className="mx-auto mt-8 max-w-3xl space-y-3">
            {faq.map((item) => (
              <details key={item.question} className="bg-card group rounded-xl border border-border p-5">
                <summary className="text-foreground cursor-pointer list-none pr-8 text-sm font-bold sm:text-base">
                  {item.question}
                </summary>
                <p className="text-muted-foreground mt-3 text-sm leading-7">{item.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="py-12 sm:py-16">
          <div className="from-background via-primary/10 to-accent/18 rounded-3xl border border-border bg-gradient-to-br p-8 text-center sm:p-12">
            <h2 className="mx-auto max-w-3xl text-balance text-3xl font-black tracking-tight sm:text-5xl">
              avocado SaaS Starter: base pronta, identidade consistente e foco no que importa
            </h2>
            <p className="text-muted-foreground mx-auto mt-4 max-w-2xl text-sm leading-7 sm:text-base">
              Clone, configure variaveis, rode `db:setup` e comece a evoluir seu proprio produto com autenticacao,
              multi-tenant e modulo de planos funcionando de ponta a ponta.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/sign-up"
                className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition hover:opacity-90"
              >
                Criar conta
                <ArrowRightIcon className="size-4" />
              </Link>
              <Link
                href="/sign-in"
                className="border-border bg-card text-foreground inline-flex items-center gap-2 rounded-full border px-6 py-3 text-sm font-semibold transition hover:bg-primary/5"
              >
                Acessar demo
              </Link>
            </div>
          </div>

          <footer className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 sm:flex-row">
            <div className="flex items-center gap-3">
              <Logo size="sm" showGlow={false} />
              <p className="text-muted-foreground text-xs font-semibold">© {new Date().getFullYear()} avocado SaaS</p>
            </div>
            <div className="text-muted-foreground flex items-center gap-4 text-xs font-semibold">
              <a href="#produto" className="transition hover:text-foreground">
                Produto
              </a>
              <a href="#precos" className="transition hover:text-foreground">
                Precos
              </a>
              <a href="#faq" className="transition hover:text-foreground">
                FAQ
              </a>
            </div>
          </footer>
        </section>
      </div>
    </main>
  );
}
