import type { Metadata } from "next";
import {
  BoxesIcon,
  Clock3Icon,
  MailPlusIcon,
  UserCheck2Icon,
  UsersIcon,
} from "lucide-react";

import { AppPageContainer } from "@/components/app/app-page-container";
import { AppPageHighlightCard } from "@/components/app/app-page-highlight-card";
import { DashboardAreaCharts } from "@/components/dashboard/dashboard-area-charts";
import { StatusBanner } from "@/components/app/status-banner";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboardInsights } from "@/lib/dashboard/analytics";
import { getTenantContext } from "@/lib/organization/tenant-context";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Painel",
  description: "Painel interno para acompanhar usuarios, equipe, produtos e sinais operacionais.",
  alternates: {
    canonical: "/dashboard",
  },
};

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value);
}

export default async function DashboardPage() {
  const tenantContext = await getTenantContext();
  const insights = await getDashboardInsights(tenantContext.organizationId!);

  return (
    <AppPageContainer className="gap-4">
      <StatusBanner message={insights.errorMessage} />

      <AppPageHighlightCard
        eyebrow="Painel"
        title="Seu painel com visao clara para decidir mais rapido"
        description="Acompanhe usuarios, time e produtos em um unico lugar e mantenha sua operacao evoluindo com previsibilidade."
        imageSrc="/img/dashboard.png"
        imageAlt="avocado mexendo no computador"
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <UsersIcon className="size-3.5" />
              Usuarios ativos
            </CardDescription>
            <CardTitle className="text-2xl">{insights.memberCount}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <MailPlusIcon className="size-3.5" />
              Convites pendentes
            </CardDescription>
            <CardTitle className="text-2xl">{insights.pendingInvitationCount}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <BoxesIcon className="size-3.5" />
              Produtos cadastrados
            </CardDescription>
            <CardTitle className="text-2xl">{insights.productCount}</CardTitle>
            <p className="text-muted-foreground text-xs">
              <UserCheck2Icon className="mr-1 inline size-3" />
              Ativos: {insights.productActiveCount}
            </p>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Clock3Icon className="size-3.5" />
              Ultima atualizacao
            </CardDescription>
            <CardTitle className="text-base">{formatDate(new Date())}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <DashboardAreaCharts data={insights.chartData} />
    </AppPageContainer>
  );
}
