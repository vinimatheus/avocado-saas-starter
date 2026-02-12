import { Building2Icon, CircleCheckIcon, ShieldCheckIcon, UsersIcon } from "lucide-react";
import Image from "next/image";
import { redirect } from "next/navigation";

import { cancelSubscriptionAction } from "@/actions/billing-actions";
import { AppPageContainer } from "@/components/app/app-page-container";
import { BillingPlansSection } from "@/components/billing/billing-plans-section";
import { BillingProfileDialog } from "@/components/billing/billing-profile-dialog";
import { FormSubmitButton } from "@/components/shared/form-submit-button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  FEATURE_LABELS,
  formatBrlFromCents,
  getPlanDefinition,
  isPaidPlan,
  isUnlimitedLimit,
} from "@/lib/billing/plans";
import { getBillingPageData } from "@/lib/billing/subscription-service";
import { isOrganizationOwnerRole } from "@/lib/organization/helpers";
import { getTenantContext } from "@/lib/organization/tenant-context";

type SearchParamsInput =
  | Record<string, string | string[] | undefined>
  | Promise<Record<string, string | string[] | undefined>>;

function getSingleSearchParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function formatDate(value: Date | string | null): string {
  if (!value) {
    return "-";
  }

  const date = typeof value === "string" ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function statusLabel(status: string): string {
  if (status === "ACTIVE") {
    return "Ativa";
  }
  if (status === "TRIALING") {
    return "Trial";
  }
  if (status === "CANCELED") {
    return "Cancelada";
  }
  if (status === "EXPIRED") {
    return "Expirada";
  }
  if (status === "PAST_DUE") {
    return "Em carencia";
  }

  return "Free";
}

function formatLimitValue(value: number | null): string {
  if (isUnlimitedLimit(value)) {
    return "Ilimitado";
  }

  return String(value);
}

export const dynamic = "force-dynamic";

export default async function BillingPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const successMessage = getSingleSearchParam(resolvedSearchParams.success).trim();
  const errorMessage = getSingleSearchParam(resolvedSearchParams.error).trim();
  const checkoutId = getSingleSearchParam(resolvedSearchParams.checkout).trim();

  const tenantContext = await getTenantContext();
  const user = tenantContext.session?.user;

  if (!user) {
    return null;
  }

  if (!tenantContext.organizationId || !isOrganizationOwnerRole(tenantContext.role)) {
    redirect("/dashboard");
  }

  const billingData = await getBillingPageData(user.id, {
    checkoutId: checkoutId || null,
  });
  const effectivePlanCode = billingData.entitlements.effectivePlanCode;
  const currentPlan = getPlanDefinition(effectivePlanCode);
  const subscription = billingData.entitlements.subscription;
  const usage = billingData.entitlements.usage;
  const dunning = billingData.entitlements.dunning;
  const restriction = billingData.entitlements.restriction;
  const currentIsPaidPlan = isPaidPlan(effectivePlanCode);
  const isPastDueInGrace = subscription.status === "PAST_DUE" && dunning.inGracePeriod;
  const usersInUse = usage.users + usage.pendingInvitations;
  const isDowngradeScheduled = Boolean(subscription.cancelAtPeriodEnd && currentIsPaidPlan);
  const currentPlanIndex = billingData.plans.findIndex((plan) => plan.code === effectivePlanCode);
  const canRenewCurrentPlan = isPastDueInGrace && currentIsPaidPlan;
  const billingCycleLabel = isPastDueInGrace ? "Fim da carencia" : "Fim do ciclo atual";
  const restrictionHints = [
    restriction.exceededOrganizations > 0
      ? `${restriction.exceededOrganizations} organizacao(oes) acima do limite`
      : null,
    restriction.exceededUsers > 0 ? `${restriction.exceededUsers} usuario(s) acima do limite` : null,
  ].filter((value): value is string => Boolean(value));

  const visiblePlans = currentIsPaidPlan
    ? billingData.plans.filter((plan, index) => {
        if (!isPaidPlan(plan.code)) {
          return false;
        }

        if (canRenewCurrentPlan) {
          return index >= currentPlanIndex;
        }

        return index > currentPlanIndex;
      })
    : billingData.plans.filter((plan) => isPaidPlan(plan.code));

  const visiblePlanCards = visiblePlans.map((plan) => ({
    code: plan.code,
    name: plan.name,
    description: plan.description,
    monthlyPriceCents: plan.monthlyPriceCents,
    organizationsLimitLabel: formatLimitValue(plan.limits.maxOrganizations),
    usersLimitLabel: formatLimitValue(plan.limits.maxUsers),
    featureLabels: plan.features.map((featureKey) => FEATURE_LABELS[featureKey]),
  }));

  const billingDefaults = {
    name: subscription.billingName ?? user.name ?? "",
    cellphone: subscription.billingCellphone ?? "",
    taxId: subscription.billingTaxId ?? "",
  };

  return (
    <AppPageContainer className="gap-6">
      <section className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Pagamentos</h1>
        <p className="text-muted-foreground text-sm sm:text-base">
          Escolha um plano e escale usuarios, organizacoes e resultados sem perder controle.
        </p>
      </section>

      {successMessage ? (
        <Card className="border-emerald-500/40 bg-emerald-500/10">
          <CardContent className="py-2 text-sm">{successMessage}</CardContent>
        </Card>
      ) : null}

      {errorMessage ? (
        <Card className="border-destructive/40 bg-destructive/10">
          <CardContent className="py-2 text-sm">{errorMessage}</CardContent>
        </Card>
      ) : null}

      <Card className="overflow-hidden border-primary/30 bg-gradient-to-br from-background via-background to-primary/10">
        <CardContent className="p-0">
          <div className="grid items-center gap-4 md:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-2 px-5 py-5 sm:px-6">
              <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[0.12em]">
                Financeiro estrategico
              </p>
              <h2 className="text-xl font-semibold tracking-tight">
                Controle financeiro com visao clara para crescer com seguranca
              </h2>
              <p className="text-muted-foreground text-sm">
                Gerencie assinatura, recorrencia e status de cobranca em um fluxo unico e objetivo.
              </p>
            </div>

            <div className="relative h-48 w-full md:h-full md:min-h-[220px]">
              <Image
                src="/img/financeiro.png"
                alt="Avocato controlando pagamentos no computador"
                fill
                priority
                sizes="(max-width: 768px) 100vw, 34vw"
                className="object-cover object-center md:object-[58%_center]"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="space-y-1 py-3 text-sm">
          <p className="font-medium">Ciclo de cobranca</p>
          <p>
            No checkout, o ciclo mensal usa recorrencia automatica no AbacatePay e o ciclo anual
            aplica cobranca unica com cobertura de 12 meses.
          </p>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-background to-background">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <Badge className="gap-1 border-emerald-500/40 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300" variant="outline">
              <ShieldCheckIcon className="size-3.5" />
              Financeiro protegido
            </Badge>
            <div className="space-y-1">
              <p className="text-base font-semibold">
                Seu financeiro esta sendo controlado pela AbacatePay
              </p>
              <p className="text-muted-foreground text-sm">
                Pagamentos, recorrencia e confirmacao da assinatura sao processados com seguranca
                pela infraestrutura da AbacatePay.
              </p>
            </div>
            <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1.5">
                <CircleCheckIcon className="text-emerald-600 size-3.5 dark:text-emerald-400" />
                Checkout seguro
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CircleCheckIcon className="text-emerald-600 size-3.5 dark:text-emerald-400" />
                Cobranca automatica
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CircleCheckIcon className="text-emerald-600 size-3.5 dark:text-emerald-400" />
                Confirmacao em tempo real
              </span>
            </div>
          </div>

          <div className="relative flex h-16 min-w-40 items-center justify-center rounded-lg border border-emerald-500/25 bg-card/80 px-4 shadow-sm">
            <Image
              src="/img/abacate%20pay.png"
              alt="AbacatePay"
              width={156}
              height={44}
              className="h-auto max-h-9 w-auto object-contain"
              priority
            />
          </div>
        </CardContent>
      </Card>

      {isPastDueInGrace ? (
        <Card className="border-amber-500/40 bg-amber-500/10">
          <CardContent className="space-y-1 py-3 text-sm">
            <p className="font-medium">Pagamento em atraso.</p>
            <p>
              Seu acesso atual continua ate <strong>{formatDate(dunning.graceEndsAt)}</strong>. Apos essa data,
              o plano cai para Free automaticamente.
            </p>
            {dunning.daysUntilDowngrade !== null ? (
              <p className="text-xs">
                Restam {dunning.daysUntilDowngrade} dia(s) para regularizar.
                {dunning.reminderCheckpointDay
                  ? ` Lembrete comercial D+${dunning.reminderCheckpointDay} aplicado.`
                  : ""}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {restriction.isRestricted ? (
        <Card className="border-destructive/40 bg-destructive/10">
          <CardContent className="space-y-1 py-3 text-sm">
            <p className="font-medium">Conta em modo restrito.</p>
            <p>
              Sua conta esta acima dos limites do plano atual. Crescimento e alteracoes operacionais ficam
              bloqueados ate regularizacao.
            </p>
            {restrictionHints.length > 0 ? (
              <p className="text-xs">Excedentes: {restrictionHints.join(" | ")}.</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {visiblePlanCards.length > 0 ? (
        <BillingPlansSection
          plans={visiblePlanCards}
          effectivePlanCode={effectivePlanCode}
          currentIsPaidPlan={currentIsPaidPlan}
          canRenewCurrentPlan={canRenewCurrentPlan}
          billingDefaults={billingDefaults}
        />
      ) : (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>Voce ja esta no maior plano publicado</CardTitle>
            <CardDescription>
              Mantenha seus dados de cobranca em dia e fale com comercial se precisar de capacidade extra.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Resumo da assinatura</CardTitle>
          <CardDescription>Informacoes essenciais do plano atual e status da cobranca.</CardDescription>
          <CardAction>
            <BillingProfileDialog
              defaultName={billingDefaults.name}
              defaultCellphone={billingDefaults.cellphone}
              defaultTaxId={billingDefaults.taxId}
            />
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{currentPlan.name}</Badge>
            <Badge variant="outline">Status: {statusLabel(subscription.status)}</Badge>
            {isPastDueInGrace ? <Badge variant="destructive">Carencia ativa</Badge> : null}
            {restriction.isRestricted ? <Badge variant="destructive">Modo restrito</Badge> : null}
            {isDowngradeScheduled ? <Badge variant="destructive">Downgrade para Free agendado</Badge> : null}
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border p-2">
              <p className="text-muted-foreground text-xs">Preco mensal</p>
              <p className="font-semibold">{formatBrlFromCents(currentPlan.monthlyPriceCents)}</p>
            </div>
            <div className="rounded-md border p-2">
              <p className="text-muted-foreground text-xs">{billingCycleLabel}</p>
              <p className="font-semibold">{formatDate(subscription.currentPeriodEnd)}</p>
            </div>
            <div className="rounded-md border p-2">
              <p className="text-muted-foreground text-xs">Organizacoes</p>
              <p className="font-semibold">
                <Building2Icon className="mr-1 inline size-3.5" />
                {usage.organizations} / {formatLimitValue(currentPlan.limits.maxOrganizations)}
              </p>
            </div>
            <div className="rounded-md border p-2">
              <p className="text-muted-foreground text-xs">Usuarios (inclui convites)</p>
              <p className="font-semibold">
                <UsersIcon className="mr-1 inline size-3.5" />
                {usersInUse} / {formatLimitValue(currentPlan.limits.maxUsers)}
              </p>
            </div>
          </div>

          {currentIsPaidPlan && subscription.status !== "PAST_DUE" ? (
            <div className="space-y-2">
              <form action={cancelSubscriptionAction}>
                <input type="hidden" name="immediate" value="false" />
                <FormSubmitButton
                  variant="destructive"
                  disabled={isDowngradeScheduled}
                  pendingLabel="Processando cancelamento..."
                >
                  Cancelar assinatura
                </FormSubmitButton>
              </form>
              <p className="text-muted-foreground text-xs">
                O cancelamento e aplicado no fim do periodo. Seu plano atual permanece ativo ate{" "}
                {formatDate(subscription.currentPeriodEnd)}.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </AppPageContainer>
  );
}
