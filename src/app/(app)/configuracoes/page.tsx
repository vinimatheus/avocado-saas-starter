import type { Metadata } from "next";
import { SparklesIcon } from "lucide-react";

import { AppPageContainer } from "@/components/app/app-page-container";
import { ThemeAppearanceSection } from "@/components/app/theme-appearance-section";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Configuracoes",
  description: "Preferencias visuais do usuario para personalizar a experiencia no app.",
  alternates: {
    canonical: "/configuracoes",
  },
};

export default function ConfiguracoesPage() {
  return (
    <AppPageContainer className="gap-4">
      <Card className="relative overflow-hidden border-primary/30 bg-gradient-to-br from-background via-background to-primary/10">
        <span className="bg-primary/15 pointer-events-none absolute -top-12 -right-10 size-44 rounded-full blur-3xl" />
        <span className="bg-primary/8 pointer-events-none absolute -bottom-14 left-6 size-36 rounded-full blur-3xl" />
        <CardContent className="relative space-y-3 px-5 py-5 sm:px-6">
          <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
            Configuracoes
          </p>
          <div className="bg-primary/12 text-primary ring-primary/30 inline-flex size-9 items-center justify-center rounded-lg ring-1">
            <SparklesIcon className="size-4" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight sm:text-xl">
            Escolha o tema ideal para sua experiencia
          </h1>
          <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
            Comecamos com o essencial: alternancia refinada entre modo claro e escuro para conforto
            visual em qualquer ambiente.
          </p>
        </CardContent>
      </Card>

      <ThemeAppearanceSection />
    </AppPageContainer>
  );
}
