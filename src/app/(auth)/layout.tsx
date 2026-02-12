import { ShieldCheckIcon, SparklesIcon, WorkflowIcon } from "lucide-react";

import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-background">
      <div className="absolute right-6 top-6 z-40">
        <ThemeToggle />
      </div>

      {/* Dynamic Background Elements */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-28 -top-28 size-[32rem] rounded-full bg-primary/15 blur-[120px] animate-pulse"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-28 -bottom-28 size-[36rem] rounded-full bg-accent/25 blur-[130px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-[40rem] rounded-full bg-primary/5 blur-[100px]"
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl items-center px-6 py-12 lg:px-12">
        <section className="hidden w-full max-w-2xl pr-12 lg:block">
          <div className="border-border/50 bg-card/50 rounded-[2.5rem] border p-12 shadow-[0_48px_100px_-50px_rgba(59,47,47,0.2)] backdrop-blur-2xl transition-all hover:shadow-[0_56px_110px_-40px_rgba(59,47,47,0.3)]">
            <Logo size="lg" className="mb-10 scale-110 origin-left" />

            <h1 className="text-foreground text-4xl font-black tracking-tight leading-[1.1] lg:text-5xl">
              Controle do seu SaaS <br />
              <span className="text-primary italic">com clareza absoluta.</span>
            </h1>
            <p className="text-muted-foreground mt-6 max-w-md text-lg leading-relaxed font-medium">
              Um workspace premium pensado para quem busca eficiência sem abrir mão do design.
              Faturamento, organização e gestão em um só lugar.
            </p>

            <div className="mt-12 grid gap-5">
              {[
                { icon: ShieldCheckIcon, title: "Segurança de Elite", desc: "Autenticação robusta e gestão de permissões detalhada." },
                { icon: WorkflowIcon, title: "Fluxo Inteligente", desc: "Multi-tenant nativo com contextos centralizados por organização." },
                { icon: SparklesIcon, title: "Design de Ponta", desc: "Interface otimizada para produtividade com estética refinada." }
              ].map((item, i) => (
                <div key={i} className="group border-border/40 bg-background/40 hover:bg-background/60 flex items-start gap-4 rounded-2xl border p-4 transition-all hover:translate-x-1 hover:shadow-sm">
                  <span className="bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white inline-flex size-10 items-center justify-center rounded-xl transition-colors shrink-0">
                    <item.icon className="size-5" />
                  </span>
                  <div>
                    <p className="text-base font-bold tracking-tight">{item.title}</p>
                    <p className="text-muted-foreground text-sm leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="w-full lg:ml-auto lg:max-w-md">
          <div className="mx-auto w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-700">
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
