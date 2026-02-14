"use client";

import { useMemo, useState } from "react";
import { CheckIcon, InfoIcon } from "lucide-react";

import { createPlanCheckoutAction } from "@/actions/billing-actions";
import { BillingProfileForm } from "@/components/billing/billing-profile-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getAnnualPricing } from "@/lib/billing/plans";
import { cn } from "@/lib/shared/utils";

type BillingPlanCode = "FREE" | "STARTER_50" | "PRO_100" | "SCALE_400";

type BillingPlanCardViewModel = {
  code: BillingPlanCode;
  name: string;
  description: string;
  monthlyPriceCents: number;
  usersLimitLabel: string;
  featureLabels: string[];
};

type BillingPlansSectionProps = {
  plans: BillingPlanCardViewModel[];
  effectivePlanCode: BillingPlanCode;
  currentIsPaidPlan: boolean;
  canRenewCurrentPlan: boolean;
  checkoutInProgress?: boolean;
  billingDefaults: {
    name: string;
    cellphone: string;
    taxId: string;
  };
};

function formatBrlFromCents(valueCents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(valueCents / 100);
}

function getPlanBadge(planCode: BillingPlanCode, isFeatured: boolean): string | null {
  if (isFeatured) {
    return "Mais popular";
  }

  if (planCode === "STARTER_50") {
    return "Economico";
  }

  if (planCode === "SCALE_400") {
    return "Escala";
  }

  return null;
}

export function BillingPlansSection({
  plans,
  effectivePlanCode,
  currentIsPaidPlan,
  canRenewCurrentPlan,
  checkoutInProgress = false,
  billingDefaults,
}: BillingPlansSectionProps) {
  const [annualBillingPreview, setAnnualBillingPreview] = useState(false);
  const [isBillingDialogOpen, setIsBillingDialogOpen] = useState(false);
  const [selectedPlanCode, setSelectedPlanCode] = useState<BillingPlanCode | null>(null);

  const featuredPlanCode = useMemo<BillingPlanCode | null>(() => {
    if (plans.some((plan) => plan.code === "PRO_100")) {
      return "PRO_100";
    }

    return plans[0]?.code ?? null;
  }, [plans]);

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.code === selectedPlanCode) ?? null,
    [plans, selectedPlanCode],
  );
  const selectedPlanAnnualPricing = useMemo(
    () => (selectedPlan ? getAnnualPricing(selectedPlan.monthlyPriceCents) : null),
    [selectedPlan],
  );

  const selectedPlanIsRenewAction = Boolean(
    selectedPlan && canRenewCurrentPlan && selectedPlan.code === effectivePlanCode,
  );

  const openBillingDialog = (planCode: BillingPlanCode) => {
    if (checkoutInProgress) {
      return;
    }

    setSelectedPlanCode(planCode);
    setIsBillingDialogOpen(true);
  };

  const resolveButtonLabel = (planCode: BillingPlanCode): string => {
    if (checkoutInProgress) {
      return "Pagamento em processamento";
    }

    if (canRenewCurrentPlan && planCode === effectivePlanCode) {
      return "Regularizar pagamento";
    }

    if (currentIsPaidPlan) {
      return "Evoluir para este plano";
    }

    return "Comecar agora";
  };

  if (plans.length === 0) {
    return null;
  }

  return (
    <TooltipProvider>
      <section className="space-y-4">
        <div className="space-y-2 text-center">
          <h2 className="text-lg font-semibold">Escolha o plano e acelere sua operacao</h2>
          <p className="text-muted-foreground mx-auto max-w-2xl text-sm">
            Um plano principal em destaque para facilitar decisao em segundos. O plano gratuito vira base,
            e voce evolui com clareza.
          </p>
          {checkoutInProgress ? (
            <p className="text-muted-foreground mx-auto max-w-2xl text-xs">
              Um pagamento recente ainda esta pendente de confirmacao. Aguarde a validacao para liberar
              novos pedidos.
            </p>
          ) : null}
        </div>

        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-3 text-sm">
          <div className="flex items-center gap-3">
            <span className={cn(!annualBillingPreview && "font-semibold")}>Mensal</span>
            <Switch
              checked={annualBillingPreview}
              onCheckedChange={setAnnualBillingPreview}
              aria-label="Alternar para visualizacao anual"
            />
            <span className={cn("inline-flex items-center gap-2", annualBillingPreview && "font-semibold")}>
              Anual
              <Badge variant="secondary">-20%</Badge>
            </span>
          </div>
          <p className="text-muted-foreground text-center text-xs">
            O ciclo anual aplica 20% de desconto e gera cobranca anual no pagamento. No ciclo mensal,
            a cobranca permanece recorrente automatica no AbacatePay.
          </p>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          {plans.map((plan) => {
            const isFeatured = plan.code === featuredPlanCode;
            const annualPricing = getAnnualPricing(plan.monthlyPriceCents);
            const displayedPriceCents = annualBillingPreview
              ? annualPricing.annualTotalCents
              : plan.monthlyPriceCents;
            const displayedPricePeriodLabel = annualBillingPreview ? "/ano" : "/mes";
            const planBadge = getPlanBadge(plan.code, isFeatured);

            return (
              <Card
                key={plan.code}
                className={cn(
                  "relative rounded-xl border",
                  isFeatured && "border-primary/40 bg-primary/5 shadow-lg",
                )}
              >
                {planBadge ? (
                  <Badge className="absolute top-3 right-3" variant={isFeatured ? "default" : "outline"}>
                    {planBadge}
                  </Badge>
                ) : null}

                <CardHeader className="space-y-2">
                  <CardTitle className="text-base">{plan.name}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div>
                    <p className="text-3xl font-semibold tracking-tight">
                      {formatBrlFromCents(displayedPriceCents)}
                      <span className="text-muted-foreground ml-1 text-xs font-medium">
                        {displayedPricePeriodLabel}
                      </span>
                    </p>
                    {annualBillingPreview ? (
                      <p className="text-muted-foreground text-xs">
                        Equivale a {formatBrlFromCents(annualPricing.monthlyEquivalentCents)} por mes.
                      </p>
                    ) : (
                      <p className="text-muted-foreground text-xs">
                        Cobranca recorrente automatica mensal.
                      </p>
                    )}
                  </div>

                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center gap-2">
                      <CheckIcon className="text-primary size-3.5" />
                      Ate {plan.usersLimitLabel} usuarios por organizacao
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="text-muted-foreground inline-flex" aria-label="Ajuda sobre limite de usuarios">
                            <InfoIcon className="size-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent sideOffset={6}>
                          Usuarios convidados tambem contam no limite contratado.
                        </TooltipContent>
                      </Tooltip>
                    </li>
                    {plan.featureLabels.slice(0, 2).map((featureLabel) => (
                      <li key={`${plan.code}_${featureLabel}`} className="flex items-center gap-2">
                        <CheckIcon className="text-primary size-3.5" />
                        {featureLabel}
                      </li>
                    ))}
                  </ul>
                </CardContent>

                <CardFooter className="pt-1">
                  <Button
                    type="button"
                    className="w-full"
                    variant={isFeatured ? "default" : "outline"}
                    onClick={() => openBillingDialog(plan.code)}
                    disabled={checkoutInProgress}
                  >
                    {resolveButtonLabel(plan.code)}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>

      </section>

      <Dialog open={isBillingDialogOpen} onOpenChange={setIsBillingDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {selectedPlan
                ? `Finalizar escolha: ${selectedPlan.name}`
                : "Finalizar escolha do plano"}
            </DialogTitle>
            <DialogDescription>
              Confirme os dados de cobranca para concluir o ciclo escolhido no pagamento seguro.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-6 pb-6">
            {selectedPlan ? (
              <Card size="sm" className="border-primary/30 bg-primary/5">
                <CardContent className="space-y-1 py-1">
                  <p className="text-xs font-medium">Plano selecionado</p>
                  <p className="text-sm">{selectedPlan.name}</p>
                  <p className="text-xs">
                    {annualBillingPreview && selectedPlanAnnualPricing
                      ? `${formatBrlFromCents(selectedPlanAnnualPricing.annualTotalCents)}/ano (equivale a ${formatBrlFromCents(selectedPlanAnnualPricing.monthlyEquivalentCents)}/mes)`
                      : `${formatBrlFromCents(selectedPlan.monthlyPriceCents)}/mes`}
                  </p>
                </CardContent>
              </Card>
            ) : null}

            <div className="space-y-3">
              <p className="text-sm font-medium">Dados de cobranca e pagamento</p>
              <p className="text-muted-foreground text-xs">
                Preencha os campos abaixo e avance direto para o pagamento em um unico passo.
              </p>
              <BillingProfileForm
                action={createPlanCheckoutAction}
                defaultName={billingDefaults.name}
                defaultCellphone={billingDefaults.cellphone}
                defaultTaxId={billingDefaults.taxId}
                submitLabel={selectedPlanIsRenewAction ? "Regularizar pagamento" : "Salvar e ir para pagamento"}
                pendingLabel="Redirecionando para pagamento..."
                submitClassName="w-full"
                submitDisabled={!selectedPlan}
              >
                <input type="hidden" name="planCode" value={selectedPlan?.code ?? ""} />
                <input
                  type="hidden"
                  name="billingCycle"
                  value={annualBillingPreview ? "ANNUAL" : "MONTHLY"}
                />
                <input
                  type="hidden"
                  name="forceCheckout"
                  value={selectedPlanIsRenewAction ? "true" : "false"}
                />
              </BillingProfileForm>
            </div>
            <p className="text-muted-foreground text-xs">
              {annualBillingPreview
                ? "O pagamento mostra o valor anual com desconto e ativa cobertura por 12 meses."
                : "O pagamento mostra os valores finais e ativa cobranca recorrente automatica mensal."}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
