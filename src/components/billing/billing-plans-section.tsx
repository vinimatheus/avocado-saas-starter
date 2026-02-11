"use client";

import { useMemo, useState } from "react";
import { CheckIcon, InfoIcon, SparklesIcon } from "lucide-react";

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
  organizationsLimitLabel: string;
  usersLimitLabel: string;
  featureLabels: string[];
};

type BillingPlansSectionProps = {
  plans: BillingPlanCardViewModel[];
  effectivePlanCode: BillingPlanCode;
  currentIsPaidPlan: boolean;
  canRenewCurrentPlan: boolean;
  billingDefaults: {
    name: string;
    cellphone: string;
    taxId: string;
  };
};

type ComparisonRow = {
  label: string;
  hint: string;
  valueForPlan: (plan: BillingPlanCardViewModel) => string;
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

function getValueStory(planCode: BillingPlanCode): string {
  if (planCode === "STARTER_50") {
    return "Operacao enxuta";
  }

  if (planCode === "PRO_100") {
    return "Times em crescimento";
  }

  if (planCode === "SCALE_400") {
    return "Escala operacional";
  }

  return "Validacao inicial";
}

export function BillingPlansSection({
  plans,
  effectivePlanCode,
  currentIsPaidPlan,
  canRenewCurrentPlan,
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

  const featuredPlan = useMemo(
    () => plans.find((plan) => plan.code === featuredPlanCode) ?? null,
    [featuredPlanCode, plans],
  );

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

  const comparisonRows: ComparisonRow[] = useMemo(
    () => [
      {
        label: "Organizacoes",
        hint: "Contabiliza todas as organizacoes ativas no workspace.",
        valueForPlan: (plan) => plan.organizationsLimitLabel,
      },
      {
        label: "Usuarios",
        hint: "Usuarios convidados tambem contam no limite.",
        valueForPlan: (plan) => plan.usersLimitLabel,
      },
      {
        label: "Perfil ideal",
        hint: "Use esta referencia para escolher o plano com menor friccao operacional.",
        valueForPlan: (plan) => getValueStory(plan.code),
      },
    ],
    [],
  );

  const openBillingDialog = (planCode: BillingPlanCode) => {
    setSelectedPlanCode(planCode);
    setIsBillingDialogOpen(true);
  };

  const resolveButtonLabel = (planCode: BillingPlanCode): string => {
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
            Um plano principal em destaque para facilitar decisao em segundos. O Free vira baseline,
            e voce evolui com clareza.
          </p>
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
            O ciclo anual aplica 20% de desconto e gera cobranca anual no checkout. No ciclo mensal,
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
                      Ate {plan.organizationsLimitLabel} organizacoes
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckIcon className="text-primary size-3.5" />
                      Ate {plan.usersLimitLabel} usuarios
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
                  >
                    {resolveButtonLabel(plan.code)}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>

        <Card className="rounded-xl border">
          <CardHeader>
            <CardTitle className="text-base">Comparacao rapida</CardTitle>
            <CardDescription>Sem tabela complexa, apenas os fatores que mudam a operacao.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {comparisonRows.map((row, index) => (
              <div key={row.label} className={cn("space-y-2", index > 0 && "border-t pt-3")}> 
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  {row.label}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="text-muted-foreground inline-flex" aria-label={`Ajuda sobre ${row.label}`}>
                        <InfoIcon className="size-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent sideOffset={6}>{row.hint}</TooltipContent>
                  </Tooltip>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {plans.map((plan) => (
                    <div
                      key={`${row.label}_${plan.code}`}
                      className={cn(
                        "rounded-md border p-2",
                        plan.code === featuredPlanCode && "border-primary/30 bg-primary/5",
                      )}
                    >
                      <p className="text-muted-foreground text-[11px]">{plan.name}</p>
                      <p className="text-sm font-medium">{row.valueForPlan(plan)}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {featuredPlan ? (
          <Card className="rounded-xl border-primary/30 bg-primary/5">
            <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="inline-flex items-center gap-1 text-sm font-medium">
                  <SparklesIcon className="size-4" />
                  Recomendado para acelerar resultados
                </p>
                <p className="text-muted-foreground text-sm">
                  {featuredPlan.name}: equilibrio entre capacidade e custo para crescer sem gargalos.
                </p>
              </div>
              <Button type="button" size="lg" onClick={() => openBillingDialog(featuredPlan.code)}>
                Desbloquear recursos
              </Button>
            </CardContent>
          </Card>
        ) : null}
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
              Confirme os dados de cobranca para concluir o ciclo escolhido no checkout seguro.
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
              <p className="text-sm font-medium">Dados de cobranca e checkout</p>
              <p className="text-muted-foreground text-xs">
                Preencha os campos abaixo e avance direto para o checkout em um unico passo.
              </p>
              <BillingProfileForm
                action={createPlanCheckoutAction}
                defaultName={billingDefaults.name}
                defaultCellphone={billingDefaults.cellphone}
                defaultTaxId={billingDefaults.taxId}
                submitLabel={selectedPlanIsRenewAction ? "Regularizar pagamento" : "Salvar e ir para checkout"}
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
                ? "O checkout mostra o valor anual com desconto e ativa cobertura por 12 meses."
                : "O checkout mostra os valores finais e ativa cobranca recorrente automatica mensal."}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
