import type { Metadata } from "next";
import { BoxesIcon, UsersIcon } from "lucide-react";
import Image from "next/image";
import { redirect } from "next/navigation";

import { syncInvoicesAction } from "@/actions/billing-actions";
import { AppPageContainer } from "@/components/app/app-page-container";
import { BillingPlansSection } from "@/components/billing/billing-plans-section";
import { BillingProfileDialog } from "@/components/billing/billing-profile-dialog";
import { CancelSubscriptionDialog } from "@/components/billing/cancel-subscription-dialog";
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
import { isTrustedAbacateCheckoutUrl } from "@/lib/billing/abacatepay";
import { getBillingPageData, listOwnerInvoices } from "@/lib/billing/subscription-service";
import { isOrganizationOwnerRole } from "@/lib/organization/helpers";
import { getTenantContext } from "@/lib/organization/tenant-context";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type SearchParamsInput =
  | Record<string, string | string[] | undefined>
  | Promise<Record<string, string | string[] | undefined>>;
const BILLING_TIME_ZONE = "America/Sao_Paulo";

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
    timeZone: BILLING_TIME_ZONE,
  }).format(date);
}

function statusLabel(status: string): string {
  if (status === "ACTIVE") {
    return "Ativa";
  }
  if (status === "TRIALING") {
    return "Teste";
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

  return "Gratuito";
}

function formatLimitValue(value: number | null): string {
  if (isUnlimitedLimit(value)) {
    return "Ilimitado";
  }

  return String(value);
}

function formatInvoiceAmount(amountCents: number, currency: string): string {
  const normalizedCurrency = currency.trim().toUpperCase();

  if (normalizedCurrency === "BRL") {
    return formatBrlFromCents(amountCents);
  }

  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: normalizedCurrency,
    }).format(amountCents / 100);
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${normalizedCurrency}`;
  }
}

function resolveInvoiceLink(input: {
  receiptUrl: string | null;
  providerTransactionId: string | null;
  providerBillingId: string | null;
}): { href: string; label: string } | null {
  const receiptUrl = input.receiptUrl?.trim() ?? "";
  if (receiptUrl && isTrustedAbacateCheckoutUrl(receiptUrl)) {
    return {
      href: receiptUrl,
      label: "Ver comprovante",
    };
  }

  const providerTransactionId = input.providerTransactionId?.trim() ?? "";
  if (providerTransactionId.startsWith("tran_")) {
    const inferredReceiptUrl = `https://app.abacatepay.com/receipt/${providerTransactionId}`;
    if (!isTrustedAbacateCheckoutUrl(inferredReceiptUrl)) {
      return null;
    }

    return {
      href: inferredReceiptUrl,
      label: "Ver comprovante",
    };
  }

  const providerBillingId = input.providerBillingId?.trim() ?? "";
  if (providerBillingId.startsWith("bill_")) {
    const inferredReceiptUrl = `https://app.abacatepay.com/receipt/${providerBillingId}`;
    if (!isTrustedAbacateCheckoutUrl(inferredReceiptUrl)) {
      return null;
    }

    return {
      href: inferredReceiptUrl,
      label: "Ver comprovante",
    };
  }

  return null;
}

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Plano",
  description:
    "Gestao interna de assinatura, planos e renovacao da area no avocado SaaS Starter.",
  alternates: {
    canonical: "/billing",
  },
};

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

  const [billingData, invoices] = await Promise.all([
    getBillingPageData(tenantContext.organizationId, {
      checkoutId: checkoutId || null,
    }),
    listOwnerInvoices(tenantContext.organizationId),
  ]);

  const paidInvoices = invoices
    .filter((invoice) => invoice.status === "PAID")
    .sort((left, right) => {
      const leftReference = left.paidAt ?? left.createdAt;
      const rightReference = right.paidAt ?? right.createdAt;
      return rightReference.getTime() - leftReference.getTime();
    });
  const effectivePlanCode = billingData.entitlements.effectivePlanCode;
  const currentPlan = getPlanDefinition(effectivePlanCode);
  const checkoutState = billingData.checkoutState;
  const checkoutTargetPlan = checkoutState ? getPlanDefinition(checkoutState.targetPlanCode) : null;
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
  const isCheckoutProcessing = Boolean(checkoutState?.isProcessing);
  const isCheckoutFailure = Boolean(
    checkoutState &&
      (checkoutState.status === "FAILED" ||
        checkoutState.status === "EXPIRED" ||
        checkoutState.status === "CANCELED" ||
        checkoutState.status === "CHARGEBACK"),
  );
  const restrictionHints = [
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
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Plano</h1>
        <p className="text-muted-foreground text-sm sm:text-base">
          Escolha um plano para a sua organizacao e escale usuarios sem perder controle.
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

      {isCheckoutProcessing ? (
        <Card className="border-primary/40 bg-primary/10">
          <CardContent className="space-y-1 py-3 text-sm">
            <p className="font-medium">Pagamento em processamento</p>
            <p>
              Seu pagamento para <strong>{checkoutTargetPlan?.name ?? "plano selecionado"}</strong> foi
              recebido e estamos aguardando confirmacao do AbacatePay.
            </p>
            <p className="text-xs">
              Assim que o webhook for processado, seu plano sera atualizado. Pagamento:{" "}
              <code>{checkoutState?.id}</code>.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {isCheckoutFailure ? (
        <Card className="border-destructive/40 bg-destructive/10">
          <CardContent className="space-y-1 py-3 text-sm">
            <p className="font-medium">Pagamento nao confirmado</p>
            <p>
              O pagamento para <strong>{checkoutTargetPlan?.name ?? "plano selecionado"}</strong> terminou
              com status <strong>{checkoutState?.status}</strong>. Voce pode iniciar um novo pagamento.
            </p>
            <p className="text-xs">
              Ultima tentativa: {formatDate(checkoutState?.createdAt ?? null)}. Pagamento:{" "}
              <code>{checkoutState?.id}</code>.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card className="overflow-hidden border-primary/30 bg-gradient-to-br from-background via-background to-primary/10">
        <CardContent className="p-0">
          <div className="grid items-center gap-4 md:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-2 px-5 py-5 sm:px-6">
              <div className="mb-1 inline-flex items-center justify-center rounded-full border border-primary/20 bg-card/80 px-3 py-1.5 shadow-sm">
                <Image
                  src="/img/abacate%20pay.png"
                  alt="AbacatePay"
                  width={98}
                  height={28}
                  className="h-auto w-auto object-contain"
                  priority
                />
              </div>
              <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[0.12em]">
                Financeiro estrategico
              </p>
              <h2 className="text-xl font-semibold tracking-tight">
                Controle financeiro com visao clara para crescer com seguranca
              </h2>
              <p className="text-muted-foreground text-sm">
                Gerencie assinatura, recorrencia e status dos planos em um fluxo unico e objetivo.
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

      {isPastDueInGrace ? (
        <Card className="border-amber-500/40 bg-amber-500/10">
          <CardContent className="space-y-1 py-3 text-sm">
            <p className="font-medium">Pagamento em atraso.</p>
            <p>
              Seu acesso atual continua ate <strong>{formatDate(dunning.graceEndsAt)}</strong>. Apos essa data,
              o plano cai para Gratuito automaticamente.
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
          checkoutInProgress={isCheckoutProcessing}
          billingDefaults={billingDefaults}
        />
      ) : (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>Voce ja esta no maior plano publicado</CardTitle>
            <CardDescription>
              Mantenha os dados do plano em dia e fale com comercial se precisar de capacidade extra.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Resumo da assinatura</CardTitle>
          <CardDescription>Informacoes essenciais do plano atual e status dos planos.</CardDescription>
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
            {isDowngradeScheduled ? <Badge variant="destructive">Rebaixamento para Gratuito agendado</Badge> : null}
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
              <p className="text-muted-foreground text-xs">Produtos cadastrados</p>
              <p className="font-semibold">
                <BoxesIcon className="mr-1 inline size-3.5" />
                {usage.projects} / {formatLimitValue(currentPlan.limits.maxProjects)}
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
              <CancelSubscriptionDialog
                disabled={isDowngradeScheduled}
                currentPeriodEndLabel={formatDate(subscription.currentPeriodEnd)}
              />
              <p className="text-muted-foreground text-xs">
                O cancelamento e aplicado no fim do periodo. Usamos dialog com confirmacao para reduzir
                cancelamentos acidentais.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recibos de pagamento</CardTitle>
          <CardDescription>
            Abrimos apenas comprovantes em `receipt/...` (ex.: `tran_...` ou `bill_...`) para evitar novo checkout.
          </CardDescription>
          <CardAction>
            <form action={syncInvoicesAction}>
              <FormSubmitButton variant="outline" size="sm" pendingLabel="Sincronizando...">
                Sincronizar recibos
              </FormSubmitButton>
            </form>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-3">
          {paidInvoices.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhum pagamento confirmado ainda. Quando houver planos pagos, os recibos aparecerao aqui.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Referencia</TableHead>
                  <TableHead className="text-right">Comprovante</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paidInvoices.map((invoice) => {
                  const invoiceLink = resolveInvoiceLink({
                    receiptUrl: invoice.receiptUrl,
                    providerTransactionId: invoice.providerTransactionId,
                    providerBillingId: invoice.providerBillingId,
                  });
                  const transactionReference =
                    invoice.providerTransactionId && invoice.providerTransactionId.startsWith("tran_")
                      ? invoice.providerTransactionId
                      : null;
                  const reference = transactionReference ?? invoice.providerBillingId ?? invoice.id;

                  return (
                    <TableRow key={invoice.id}>
                      <TableCell>{formatDate(invoice.paidAt ?? invoice.createdAt)}</TableCell>
                      <TableCell>{formatInvoiceAmount(invoice.amountCents, invoice.currency)}</TableCell>
                      <TableCell>
                        <code className="text-xs">{reference}</code>
                      </TableCell>
                      <TableCell className="text-right">
                        {invoiceLink ? (
                          <a
                            href={invoiceLink.href}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="text-primary text-sm font-medium hover:underline"
                          >
                            {invoiceLink.label}
                          </a>
                        ) : (
                          <span className="text-muted-foreground text-sm">Indisponivel</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </AppPageContainer>
  );
}
