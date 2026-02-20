"use client";

import {
  useActionState,
  useMemo,
  useState,
  useTransition,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  Building2Icon,
  CheckIcon,
  CreditCardIcon,
  SparklesIcon,
  UploadIcon,
  UserRoundIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import {
  createOrganizationWithPlanAction,
  completeOnboardingProfileStepAction,
  type OnboardingProfileActionState,
} from "@/actions/onboarding-actions";
import { FormFeedback } from "@/components/shared/form-feedback";
import { FormSubmitButton } from "@/components/shared/form-submit-button";
import { Logo } from "@/components/shared/logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/shared/utils";

type CompanyOnboardingFormProps = {
  userName?: string | null;
  userImage?: string | null;
  initialCompanyName?: string;
  keepCurrentActiveOrganization?: boolean;
  mode?: "onboarding" | "create";
  redirectPath?: string;
};

type OrganizationCreatePlanCode = "FREE" | "STARTER_50" | "PRO_100" | "SCALE_400";
type BillingCycle = "MONTHLY" | "ANNUAL";

const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;
const initialOnboardingProfileActionState: OnboardingProfileActionState = {
  status: "idle",
  message: "",
};

const ORGANIZATION_CREATE_PLAN_OPTIONS: Array<{
  code: OrganizationCreatePlanCode;
  name: string;
  priceLabel: string;
  description: string;
  helper: string;
}> = [
  {
    code: "FREE",
    name: "Gratis",
    priceLabel: "R$0",
    description: "Trial por 7 dias para iniciar rapido.",
    helper: "Trial disponivel apenas para a primeira organizacao.",
  },
  {
    code: "STARTER_50",
    name: "Starter",
    priceLabel: "R$50/mes",
    description: "Ate 50 usuarios por organizacao.",
    helper: "A organizacao sera criada somente apos pagamento aprovado.",
  },
  {
    code: "PRO_100",
    name: "Pro",
    priceLabel: "R$100/mes",
    description: "Ate 100 usuarios com recursos avancados.",
    helper: "A organizacao sera criada somente apos pagamento aprovado.",
  },
  {
    code: "SCALE_400",
    name: "Scale",
    priceLabel: "R$400/mes",
    description: "Usuarios ilimitados e suporte prioritario.",
    helper: "A organizacao sera criada somente apos pagamento aprovado.",
  },
];

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function formatPhoneMask(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  const ddd = digits.slice(0, 2);
  const middle = digits.length > 10 ? digits.slice(2, 7) : digits.slice(2, 6);
  const final = digits.length > 10 ? digits.slice(7, 11) : digits.slice(6, 10);

  if (!ddd) {
    return "";
  }

  let output = `(${ddd}`;
  if (ddd.length === 2) {
    output += ")";
  }

  if (middle) {
    output += ` ${middle}`;
  }

  if (final) {
    output += `-${final}`;
  }

  return output;
}

function formatTaxIdMask(value: string): string {
  const digits = onlyDigits(value).slice(0, 14);

  if (digits.length <= 11) {
    const a = digits.slice(0, 3);
    const b = digits.slice(3, 6);
    const c = digits.slice(6, 9);
    const d = digits.slice(9, 11);

    let output = a;
    if (b) {
      output += `.${b}`;
    }
    if (c) {
      output += `.${c}`;
    }
    if (d) {
      output += `-${d}`;
    }

    return output;
  }

  const a = digits.slice(0, 2);
  const b = digits.slice(2, 5);
  const c = digits.slice(5, 8);
  const d = digits.slice(8, 12);
  const e = digits.slice(12, 14);

  let output = a;
  if (b) {
    output += `.${b}`;
  }
  if (c) {
    output += `.${c}`;
  }
  if (d) {
    output += `/${d}`;
  }
  if (e) {
    output += `-${e}`;
  }

  return output;
}

function isPaidOrganizationPlan(planCode: OrganizationCreatePlanCode): boolean {
  return planCode !== "FREE";
}

function initialsFromName(name: string | null | undefined): string {
  const parts = (name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const first = parts[0]?.[0] ?? "U";
  const second = parts[1]?.[0] ?? "S";

  return `${first}${second}`.toUpperCase();
}

function normalizeImageUrl(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

function validatePaidBillingFields(input: {
  billingName: string;
  billingCellphone: string;
  billingTaxId: string;
}): string | null {
  if (input.billingName.trim().length < 2) {
    return "Informe o nome de faturamento.";
  }

  const phoneDigits = onlyDigits(input.billingCellphone);
  if (phoneDigits.length !== 10 && phoneDigits.length !== 11) {
    return "Informe um telefone valido.";
  }

  const taxIdDigits = onlyDigits(input.billingTaxId);
  if (taxIdDigits.length !== 11 && taxIdDigits.length !== 14) {
    return "Informe um CPF ou CNPJ valido.";
  }

  return null;
}

function PlanSelector({
  value,
  onChange,
}: {
  value: OrganizationCreatePlanCode;
  onChange: (value: OrganizationCreatePlanCode) => void;
}) {
  return (
    <div className="space-y-2">
      {ORGANIZATION_CREATE_PLAN_OPTIONS.map((plan) => {
        const isSelected = value === plan.code;

        return (
          <label
            key={plan.code}
            className={cn(
              "flex cursor-pointer items-start justify-between gap-3 rounded-xl border px-3 py-2 transition-colors",
              isSelected
                ? "border-primary/60 bg-primary/10"
                : "border-border/70 bg-background/70 hover:bg-muted/40",
            )}
          >
            <input
              type="radio"
              name="planCode"
              value={plan.code}
              checked={isSelected}
              onChange={() => onChange(plan.code)}
              className="sr-only"
            />

            <span className="space-y-0.5">
              <span className="flex items-center gap-2 text-sm font-semibold">
                {plan.name}
                <span className="text-muted-foreground text-xs font-medium">{plan.priceLabel}</span>
              </span>
              <span className="text-muted-foreground block text-xs">{plan.description}</span>
              <span className="text-muted-foreground/90 block text-[0.68rem]">{plan.helper}</span>
            </span>

            {isSelected ? <CheckIcon className="text-primary mt-0.5 size-4" /> : null}
          </label>
        );
      })}
    </div>
  );
}

function BillingFields({
  billingName,
  billingCellphone,
  billingTaxId,
  onBillingNameChange,
  onBillingCellphoneChange,
  onBillingTaxIdChange,
}: {
  billingName: string;
  billingCellphone: string;
  billingTaxId: string;
  onBillingNameChange: (value: string) => void;
  onBillingCellphoneChange: (value: string) => void;
  onBillingTaxIdChange: (value: string) => void;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-background/70 p-3">
      <p className="text-foreground text-xs font-semibold tracking-[0.08em] uppercase">
        Dados de pagamento
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="billingName" className="text-[0.68rem] font-semibold tracking-[0.08em] uppercase">
          Nome de faturamento
        </Label>
        <Input
          id="billingName"
          name="billingName"
          value={billingName}
          onChange={(event) => onBillingNameChange(event.target.value)}
          placeholder="Nome completo ou razao social"
          required
          className="h-10 rounded-xl border-border/80 bg-background/80 text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label
          htmlFor="billingCellphone"
          className="text-[0.68rem] font-semibold tracking-[0.08em] uppercase"
        >
          Telefone
        </Label>
        <Input
          id="billingCellphone"
          name="billingCellphone"
          value={billingCellphone}
          onChange={(event) => onBillingCellphoneChange(formatPhoneMask(event.target.value))}
          placeholder="(11) 99999-9999"
          inputMode="numeric"
          autoComplete="tel"
          required
          className="h-10 rounded-xl border-border/80 bg-background/80 text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="billingTaxId" className="text-[0.68rem] font-semibold tracking-[0.08em] uppercase">
          CPF/CNPJ
        </Label>
        <Input
          id="billingTaxId"
          name="billingTaxId"
          value={billingTaxId}
          onChange={(event) => onBillingTaxIdChange(formatTaxIdMask(event.target.value))}
          placeholder="000.000.000-00"
          inputMode="numeric"
          required
          className="h-10 rounded-xl border-border/80 bg-background/80 text-sm"
        />
      </div>
    </div>
  );
}

function NewAccountOnboardingForm({
  userName = null,
  userImage = null,
  initialCompanyName = "",
  redirectPath = "/",
}: {
  userName?: string | null;
  userImage?: string | null;
  initialCompanyName?: string;
  redirectPath?: string;
}) {
  const router = useRouter();
  const normalizedUserImage = normalizeImageUrl(userImage);
  const [isPending, startTransition] = useTransition();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [nameInput, setNameInput] = useState((userName ?? "").trim());
  const [companyNameInput, setCompanyNameInput] = useState(initialCompanyName);
  const [organizationImageFile, setOrganizationImageFile] = useState<File | null>(null);

  const [profileImageName, setProfileImageName] = useState("");
  const [profileImageError, setProfileImageError] = useState("");
  const [organizationImageName, setOrganizationImageName] = useState("");
  const [organizationImageError, setOrganizationImageError] = useState("");

  const [planCode, setPlanCode] = useState<OrganizationCreatePlanCode>("FREE");
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("MONTHLY");
  const [billingName, setBillingName] = useState(nameInput || "");
  const [billingCellphone, setBillingCellphone] = useState("");
  const [billingTaxId, setBillingTaxId] = useState("");
  const [serverMessage, setServerMessage] = useState("");

  const selectedPlanIsPaid = isPaidOrganizationPlan(planCode);

  const [profileState, profileStepAction] = useActionState(
    completeOnboardingProfileStepAction,
    initialOnboardingProfileActionState,
  );
  const currentStep: 1 | 2 | 3 =
    step === 1 && profileState.status === "success" ? 2 : step;

  const progressLabel = useMemo(() => {
    if (currentStep === 1) {
      return "33%";
    }

    if (currentStep === 2) {
      return "66%";
    }

    return "100%";
  }, [currentStep]);

  function handleImageSelection(
    event: ChangeEvent<HTMLInputElement>,
    setFileName: (value: string) => void,
    setError: (value: string) => void,
    setFile?: (file: File | null) => void,
  ) {
    const file = event.target.files?.[0];
    if (!file) {
      setFileName("");
      setError("");
      if (setFile) {
        setFile(null);
      }
      return;
    }

    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
      const message = "Arquivo muito pesado. Envie uma imagem de ate 5 MB.";
      event.target.value = "";
      setFileName("");
      setError(message);
      if (setFile) {
        setFile(null);
      }
      toast.error(message);
      return;
    }

    setFileName(file.name.trim());
    setError("");
    if (setFile) {
      setFile(file);
    }
  }

  function handleOrganizationStepSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (companyNameInput.trim().length < 2) {
      const message = "Nome da organizacao deve ter ao menos 2 caracteres.";
      setServerMessage(message);
      toast.error(message);
      return;
    }

    if (organizationImageError) {
      setServerMessage(organizationImageError);
      toast.error(organizationImageError);
      return;
    }

    if (!billingName.trim()) {
      setBillingName(nameInput.trim());
    }

    setServerMessage("");
    setStep(3);
  }

  function submitOrganizationWithPlan() {
    if (companyNameInput.trim().length < 2) {
      const message = "Nome da organizacao deve ter ao menos 2 caracteres.";
      setServerMessage(message);
      toast.error(message);
      return;
    }

    if (organizationImageError) {
      setServerMessage(organizationImageError);
      toast.error(organizationImageError);
      return;
    }

    if (selectedPlanIsPaid) {
      const billingError = validatePaidBillingFields({
        billingName,
        billingCellphone,
        billingTaxId,
      });
      if (billingError) {
        setServerMessage(billingError);
        toast.error(billingError);
        return;
      }
    }

    setServerMessage("");
    startTransition(async () => {
      const payload = new FormData();
      payload.set("companyName", companyNameInput.trim());
      payload.set("planCode", planCode);
      payload.set("billingCycle", billingCycle);
      payload.set("redirectPath", redirectPath);
      payload.set("keepCurrentActiveOrganization", "false");

      if (organizationImageFile) {
        payload.set("organizationImage", organizationImageFile);
      }

      if (selectedPlanIsPaid) {
        payload.set("billingName", billingName.trim());
        payload.set("billingCellphone", billingCellphone);
        payload.set("billingTaxId", billingTaxId);
      }

      const result = await createOrganizationWithPlanAction(payload);
      if (result.status === "error") {
        setServerMessage(result.message);
        toast.error(result.message);
        return;
      }

      toast.success(result.message);

      if (result.redirectKind === "external" && result.redirectTo) {
        window.location.assign(result.redirectTo);
        return;
      }

      router.replace(result.redirectTo ?? redirectPath);
      router.refresh();
    });
  }

  return (
    <Card className="mx-auto w-full max-w-3xl overflow-hidden rounded-[1.8rem] border border-border/75 bg-card/95 shadow-[0_45px_110px_-70px_rgba(17,34,20,0.92)] backdrop-blur-xl">
      <div aria-hidden className="h-1 w-full bg-gradient-to-r from-primary via-accent to-primary/70" />

      <CardHeader className="space-y-5 px-6 pt-6">
        <div className="flex items-center justify-between gap-3">
          <Logo size="md" />
          <span className="border-border/70 bg-background/70 text-muted-foreground inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[0.6rem] font-semibold tracking-[0.1em] uppercase">
            <SparklesIcon className="text-primary size-3.5" />
            Setup guiado
          </span>
        </div>

        <div className="space-y-2">
          <CardTitle className="text-foreground flex items-center gap-2 text-[1.72rem] font-black tracking-tight">
            {currentStep === 1 ? (
              <UserRoundIcon className="text-primary size-[1.1rem]" />
            ) : currentStep === 2 ? (
              <Building2Icon className="text-primary size-[1.1rem]" />
            ) : (
              <CreditCardIcon className="text-primary size-[1.1rem]" />
            )}
            {currentStep === 1
              ? "Seu perfil primeiro"
              : currentStep === 2
                ? "Dados da organizacao"
                : "Plano e pagamento"}
          </CardTitle>
          <CardDescription className="text-muted-foreground text-sm leading-relaxed">
            {currentStep === 1
              ? "Preencha seu nome e, se quiser, atualize seu avatar."
              : currentStep === 2
                ? "Defina o nome da organizacao e o avatar da empresa."
                : "Escolha o plano. Organizacoes pagas so sao criadas apos pagamento aprovado."}
          </CardDescription>
        </div>

        <div className="rounded-2xl border border-border/75 bg-background/70 p-3">
          <div className="text-muted-foreground flex items-center justify-between text-[0.65rem] font-semibold tracking-[0.08em] uppercase">
            <span>Progresso do onboarding</span>
            <span>{progressLabel}</span>
          </div>
          <div className="bg-muted mt-2 h-2 overflow-hidden rounded-full">
            <div
              className={cn(
                "h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-500",
                currentStep === 1 ? "w-1/3" : currentStep === 2 ? "w-2/3" : "w-full",
              )}
            />
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <div
              className={cn(
                "rounded-xl border px-3 py-2",
                currentStep === 1
                  ? "border-primary/60 bg-primary/10"
                  : "border-emerald-500/30 bg-emerald-500/10",
              )}
            >
              <p className="text-foreground flex items-center gap-2 text-sm font-semibold">
                <UserRoundIcon className="size-4" />
                1. Perfil
              </p>
              <p className="text-muted-foreground mt-1 text-xs">Nome e avatar.</p>
            </div>

            <div
              className={cn(
                "rounded-xl border px-3 py-2",
                currentStep === 2
                  ? "border-primary/60 bg-primary/10"
                  : currentStep > 2
                    ? "border-emerald-500/30 bg-emerald-500/10"
                    : "border-border/70 bg-muted/35",
              )}
            >
              <p className="text-foreground flex items-center gap-2 text-sm font-semibold">
                <Building2Icon className="size-4" />
                2. Organizacao
              </p>
              <p className="text-muted-foreground mt-1 text-xs">Nome e avatar da empresa.</p>
            </div>

            <div
              className={cn(
                "rounded-xl border px-3 py-2",
                currentStep === 3
                  ? "border-primary/60 bg-primary/10"
                  : "border-border/70 bg-muted/35",
              )}
            >
              <p className="text-foreground flex items-center gap-2 text-sm font-semibold">
                <CreditCardIcon className="size-4" />
                3. Plano
              </p>
              <p className="text-muted-foreground mt-1 text-xs">Plano e pagamento.</p>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-6 pb-6">
        {currentStep === 1 ? (
          <form action={profileStepAction} className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label
                    htmlFor="onboarding-name"
                    className="text-foreground text-[0.72rem] font-semibold tracking-[0.08em] uppercase"
                  >
                    Nome completo
                  </label>
                  <div className="relative">
                    <UserRoundIcon className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
                    <Input
                      id="onboarding-name"
                      name="name"
                      type="text"
                      placeholder="Joao Silva"
                      autoComplete="name"
                      defaultValue={nameInput}
                      onChange={(event) => setNameInput(event.target.value)}
                      minLength={3}
                      maxLength={80}
                      required
                      className="h-10 rounded-xl border-border/80 bg-background/80 pl-10 text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="onboarding-image"
                    className="text-foreground text-[0.72rem] font-semibold tracking-[0.08em] uppercase"
                  >
                    Avatar (opcional)
                  </label>
                  <div className="rounded-xl border border-dashed border-border/75 bg-background/75 p-3">
                    <Input
                      id="onboarding-image"
                      name="image"
                      type="file"
                      accept="image/*"
                      onChange={(event) =>
                        handleImageSelection(event, setProfileImageName, setProfileImageError)
                      }
                      className="h-10 rounded-lg border-border/70 bg-background/80 text-sm"
                    />
                    <p className="text-muted-foreground mt-2 text-xs">
                      PNG, JPEG, GIF ou WEBP com ate 5 MB.
                    </p>
                    {profileImageError ? (
                      <p className="text-destructive mt-1 text-xs font-medium">{profileImageError}</p>
                    ) : null}
                    {profileImageName ? (
                      <p className="text-foreground mt-1 flex items-center gap-1.5 text-xs font-medium">
                        <UploadIcon className="size-3.5" />
                        {profileImageName}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>

              <aside className="rounded-2xl border border-border/75 bg-muted/25 p-4">
                <p className="text-foreground text-sm font-semibold">Preview do perfil</p>
                <div className="mt-3 flex items-center gap-3">
                  <Avatar className="size-14 border border-border/80">
                    {normalizedUserImage ? <AvatarImage src={normalizedUserImage} alt="Avatar atual" /> : null}
                    <AvatarFallback className="text-sm font-semibold">
                      {initialsFromName(nameInput || userName)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-foreground text-sm font-semibold">{nameInput || "Seu nome"}</p>
                    <p className="text-muted-foreground text-xs">Este nome aparece para sua equipe.</p>
                  </div>
                </div>
              </aside>
            </div>

            <FormFeedback state={profileState} showInline={false} />
            {profileState.status === "error" && profileState.message ? (
              <p className="text-destructive rounded-xl border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm font-medium">
                {profileState.message}
              </p>
            ) : null}

            <FormSubmitButton
              className="h-11 w-full rounded-xl text-sm font-semibold shadow-[0_14px_30px_-20px_rgba(76,175,80,0.85)]"
              pendingLabel="Salvando perfil..."
              disabled={Boolean(profileImageError)}
            >
              Continuar para organizacao
              <ArrowRightIcon className="size-4" />
            </FormSubmitButton>
          </form>
        ) : null}

        {currentStep === 2 ? (
          <form onSubmit={handleOrganizationStepSubmit} className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label
                    htmlFor="onboarding-company-name"
                    className="text-foreground text-[0.72rem] font-semibold tracking-[0.08em] uppercase"
                  >
                    Nome da organizacao
                  </label>
                  <div className="relative">
                    <Building2Icon className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
                    <Input
                      id="onboarding-company-name"
                      type="text"
                      placeholder="Acme SaaS"
                      autoComplete="organization"
                      value={companyNameInput}
                      onChange={(event) => setCompanyNameInput(event.target.value)}
                      minLength={2}
                      maxLength={120}
                      required
                      className="h-10 rounded-xl border-border/80 bg-background/80 pl-10 text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="onboarding-organization-image"
                    className="text-foreground text-[0.72rem] font-semibold tracking-[0.08em] uppercase"
                  >
                    Avatar da empresa (opcional)
                  </label>
                  <div className="rounded-xl border border-dashed border-border/75 bg-background/75 p-3">
                    <Input
                      id="onboarding-organization-image"
                      type="file"
                      accept="image/*"
                      onChange={(event) =>
                        handleImageSelection(
                          event,
                          setOrganizationImageName,
                          setOrganizationImageError,
                          setOrganizationImageFile,
                        )
                      }
                      className="h-10 rounded-lg border-border/70 bg-background/80 text-sm"
                    />
                    <p className="text-muted-foreground mt-2 text-xs">
                      PNG, JPEG, GIF ou WEBP com ate 5 MB.
                    </p>
                    {organizationImageError ? (
                      <p className="text-destructive mt-1 text-xs font-medium">{organizationImageError}</p>
                    ) : null}
                    {organizationImageName ? (
                      <p className="text-foreground mt-1 flex items-center gap-1.5 text-xs font-medium">
                        <UploadIcon className="size-3.5" />
                        {organizationImageName}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>

              <aside className="rounded-2xl border border-border/75 bg-muted/25 p-4">
                <p className="text-foreground text-sm font-semibold">Resumo da organizacao</p>
                <div className="mt-3 rounded-lg border border-border/70 bg-background/70 p-3">
                  <p className="text-foreground text-sm font-semibold">
                    {companyNameInput.trim() || "Sua organizacao"}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                    Este nome sera exibido no painel e para membros convidados.
                  </p>
                </div>
              </aside>
            </div>

            {serverMessage ? (
              <p className="text-destructive rounded-xl border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm font-medium">
                {serverMessage}
              </p>
            ) : null}

            <Button
              type="submit"
              className="h-11 w-full rounded-xl text-sm font-semibold shadow-[0_14px_30px_-20px_rgba(76,175,80,0.85)]"
              disabled={Boolean(organizationImageError)}
            >
              Continuar para plano
              <ArrowRightIcon className="size-4" />
            </Button>
          </form>
        ) : null}

        {currentStep === 3 ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submitOrganizationWithPlan();
            }}
            className="space-y-5"
          >
            <div className="space-y-2">
              <Label className="text-[0.72rem] font-semibold tracking-[0.08em] uppercase">
                Plano inicial
              </Label>
              <PlanSelector value={planCode} onChange={setPlanCode} />
            </div>

            {selectedPlanIsPaid ? (
              <div className="space-y-3 rounded-xl border border-border/70 bg-background/60 p-3">
                <div className="space-y-1">
                  <Label className="text-[0.68rem] font-semibold tracking-[0.08em] uppercase">
                    Ciclo de cobranca
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    <label
                      className={cn(
                        "cursor-pointer rounded-lg border px-3 py-2 text-sm",
                        billingCycle === "MONTHLY"
                          ? "border-primary/60 bg-primary/10"
                          : "border-border/70 bg-background/80",
                      )}
                    >
                      <input
                        type="radio"
                        name="billingCycle"
                        value="MONTHLY"
                        checked={billingCycle === "MONTHLY"}
                        onChange={() => setBillingCycle("MONTHLY")}
                        className="sr-only"
                      />
                      Mensal
                    </label>
                    <label
                      className={cn(
                        "cursor-pointer rounded-lg border px-3 py-2 text-sm",
                        billingCycle === "ANNUAL"
                          ? "border-primary/60 bg-primary/10"
                          : "border-border/70 bg-background/80",
                      )}
                    >
                      <input
                        type="radio"
                        name="billingCycle"
                        value="ANNUAL"
                        checked={billingCycle === "ANNUAL"}
                        onChange={() => setBillingCycle("ANNUAL")}
                        className="sr-only"
                      />
                      Anual
                    </label>
                  </div>
                </div>

                <BillingFields
                  billingName={billingName}
                  billingCellphone={billingCellphone}
                  billingTaxId={billingTaxId}
                  onBillingNameChange={setBillingName}
                  onBillingCellphoneChange={setBillingCellphone}
                  onBillingTaxIdChange={setBillingTaxId}
                />

                <p className="rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-xs">
                  A organizacao sera criada somente depois que o pagamento for aprovado.
                </p>
              </div>
            ) : (
              <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs">
                Trial de 7 dias disponivel apenas para a primeira organizacao do usuario.
              </p>
            )}

            {serverMessage ? (
              <p className="text-destructive rounded-xl border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm font-medium">
                {serverMessage}
              </p>
            ) : null}

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-xl"
                onClick={() => setStep(2)}
                disabled={isPending}
              >
                <ArrowLeftIcon className="size-4" />
                Voltar
              </Button>
              <Button
                type="submit"
                className="h-11 flex-1 rounded-xl text-sm font-semibold shadow-[0_14px_30px_-20px_rgba(76,175,80,0.85)]"
                disabled={isPending}
              >
                {isPending
                  ? "Processando..."
                  : selectedPlanIsPaid
                    ? "Ir para pagamento"
                    : "Criar organizacao com trial"}
              </Button>
            </div>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}

function OrganizationCreateForm({
  userName = null,
  initialCompanyName = "",
  keepCurrentActiveOrganization = false,
  redirectPath = "/",
}: CompanyOnboardingFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [companyName, setCompanyName] = useState(initialCompanyName);
  const [organizationImageFile, setOrganizationImageFile] = useState<File | null>(null);
  const [organizationImageName, setOrganizationImageName] = useState("");
  const [organizationImageError, setOrganizationImageError] = useState("");

  const [planCode, setPlanCode] = useState<OrganizationCreatePlanCode>("FREE");
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("MONTHLY");
  const [billingName, setBillingName] = useState(userName?.trim() || "");
  const [billingCellphone, setBillingCellphone] = useState("");
  const [billingTaxId, setBillingTaxId] = useState("");
  const [serverMessage, setServerMessage] = useState("");

  const selectedPlanIsPaid = isPaidOrganizationPlan(planCode);

  function handleOrganizationImageSelection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setOrganizationImageFile(null);
      setOrganizationImageName("");
      setOrganizationImageError("");
      return;
    }

    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
      const message = "Arquivo muito pesado. Envie uma imagem de ate 5 MB.";
      event.target.value = "";
      setOrganizationImageFile(null);
      setOrganizationImageName("");
      setOrganizationImageError(message);
      setServerMessage(message);
      toast.error(message);
      return;
    }

    setOrganizationImageFile(file);
    setOrganizationImageName(file.name.trim());
    setOrganizationImageError("");
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (companyName.trim().length < 2) {
      const message = "Nome da organizacao deve ter ao menos 2 caracteres.";
      setServerMessage(message);
      toast.error(message);
      return;
    }

    if (organizationImageError) {
      setServerMessage(organizationImageError);
      toast.error(organizationImageError);
      return;
    }

    if (selectedPlanIsPaid) {
      const billingError = validatePaidBillingFields({
        billingName,
        billingCellphone,
        billingTaxId,
      });
      if (billingError) {
        setServerMessage(billingError);
        toast.error(billingError);
        return;
      }
    }

    setServerMessage("");
    startTransition(async () => {
      const payload = new FormData();
      payload.set("companyName", companyName.trim());
      payload.set("planCode", planCode);
      payload.set("billingCycle", billingCycle);
      payload.set("redirectPath", redirectPath);
      payload.set("keepCurrentActiveOrganization", String(keepCurrentActiveOrganization));

      if (organizationImageFile) {
        payload.set("organizationImage", organizationImageFile);
      }

      if (selectedPlanIsPaid) {
        payload.set("billingName", billingName.trim());
        payload.set("billingCellphone", billingCellphone);
        payload.set("billingTaxId", billingTaxId);
      }

      const result = await createOrganizationWithPlanAction(payload);
      if (result.status === "error") {
        setServerMessage(result.message);
        toast.error(result.message);
        return;
      }

      toast.success(result.message);

      if (result.redirectKind === "external" && result.redirectTo) {
        window.location.assign(result.redirectTo);
        return;
      }

      router.replace(result.redirectTo ?? redirectPath);
      router.refresh();
    });
  }

  return (
    <Card className="mx-auto w-full max-w-3xl overflow-hidden rounded-[1.8rem] border border-border/75 bg-card/95 shadow-[0_45px_110px_-70px_rgba(17,34,20,0.92)] backdrop-blur-xl">
      <div aria-hidden className="h-1 w-full bg-gradient-to-r from-primary via-accent to-primary/70" />

      <CardHeader className="space-y-4 px-6 pt-6">
        <div className="flex items-center justify-between gap-3">
          <Logo size="md" />
          <span className="border-border/70 bg-background/70 text-muted-foreground inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[0.6rem] font-semibold tracking-[0.1em] uppercase">
            <SparklesIcon className="text-primary size-3.5" />
            Setup rapido
          </span>
        </div>

        <div className="space-y-2">
          <CardTitle className="text-foreground flex items-center gap-2 text-[1.72rem] font-black tracking-tight">
            <Building2Icon className="text-primary size-[1.1rem]" />
            Nova organizacao
          </CardTitle>
          <CardDescription className="text-muted-foreground text-sm leading-relaxed">
            {userName
              ? `${userName}, informe os dados da nova organizacao e conclua o plano.`
              : "Informe os dados da nova organizacao e conclua o plano."}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 px-6 pb-6">
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="companyName" className="text-[0.72rem] font-semibold tracking-[0.08em] uppercase">
              Organizacao
            </Label>
            <div className="relative">
              <Building2Icon className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
              <Input
                id="companyName"
                name="companyName"
                type="text"
                placeholder="Acme SaaS"
                autoComplete="organization"
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                className="h-10 rounded-xl border-border/80 bg-background/80 pl-10 text-sm"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="organizationImage"
              className="text-[0.72rem] font-semibold tracking-[0.08em] uppercase"
            >
              Avatar da empresa (opcional)
            </Label>
            <div className="rounded-xl border border-dashed border-border/75 bg-background/75 p-3">
              <Input
                id="organizationImage"
                type="file"
                accept="image/*"
                onChange={handleOrganizationImageSelection}
                className="h-10 rounded-lg border-border/70 bg-background/80 text-sm"
              />
              <p className="text-muted-foreground mt-2 text-xs">PNG, JPEG, GIF ou WEBP com ate 5 MB.</p>
              {organizationImageError ? (
                <p className="text-destructive mt-1 text-xs font-medium">{organizationImageError}</p>
              ) : null}
              {organizationImageName ? (
                <p className="text-foreground mt-1 flex items-center gap-1.5 text-xs font-medium">
                  <UploadIcon className="size-3.5" />
                  {organizationImageName}
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[0.72rem] font-semibold tracking-[0.08em] uppercase">Plano inicial</Label>
            <PlanSelector value={planCode} onChange={setPlanCode} />
          </div>

          {selectedPlanIsPaid ? (
            <div className="space-y-3 rounded-xl border border-border/70 bg-background/60 p-3">
              <div className="space-y-1">
                <Label className="text-[0.68rem] font-semibold tracking-[0.08em] uppercase">
                  Ciclo de cobranca
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <label
                    className={cn(
                      "cursor-pointer rounded-lg border px-3 py-2 text-sm",
                      billingCycle === "MONTHLY"
                        ? "border-primary/60 bg-primary/10"
                        : "border-border/70 bg-background/80",
                    )}
                  >
                    <input
                      type="radio"
                      name="billingCycle"
                      value="MONTHLY"
                      checked={billingCycle === "MONTHLY"}
                      onChange={() => setBillingCycle("MONTHLY")}
                      className="sr-only"
                    />
                    Mensal
                  </label>
                  <label
                    className={cn(
                      "cursor-pointer rounded-lg border px-3 py-2 text-sm",
                      billingCycle === "ANNUAL"
                        ? "border-primary/60 bg-primary/10"
                        : "border-border/70 bg-background/80",
                    )}
                  >
                    <input
                      type="radio"
                      name="billingCycle"
                      value="ANNUAL"
                      checked={billingCycle === "ANNUAL"}
                      onChange={() => setBillingCycle("ANNUAL")}
                      className="sr-only"
                    />
                    Anual
                  </label>
                </div>
              </div>

              <BillingFields
                billingName={billingName}
                billingCellphone={billingCellphone}
                billingTaxId={billingTaxId}
                onBillingNameChange={setBillingName}
                onBillingCellphoneChange={setBillingCellphone}
                onBillingTaxIdChange={setBillingTaxId}
              />

              <p className="rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-xs">
                Para criar outra organizacao, conclua o pagamento. A organizacao so nasce apos aprovacao.
              </p>
            </div>
          ) : (
            <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs">
              Trial de 7 dias disponivel apenas para a primeira organizacao por usuario.
            </p>
          )}

          {serverMessage ? <p className="text-destructive text-sm font-medium">{serverMessage}</p> : null}

          <Button
            type="submit"
            className="h-11 w-full rounded-xl text-sm font-semibold shadow-[0_14px_30px_-20px_rgba(76,175,80,0.85)]"
            disabled={isPending}
          >
            {isPending
              ? "Processando..."
              : selectedPlanIsPaid
                ? "Ir para pagamento"
                : "Criar organizacao com trial"}
          </Button>

          <p className="text-muted-foreground text-xs">
            Organizacoes pagas so serao ativadas apos autorizacao do pagamento.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

export function CompanyOnboardingForm(props: CompanyOnboardingFormProps) {
  const mode = props.mode ?? "onboarding";

  if (mode === "onboarding") {
    return (
      <NewAccountOnboardingForm
        userName={props.userName}
        userImage={props.userImage}
        initialCompanyName={props.initialCompanyName}
        redirectPath={props.redirectPath}
      />
    );
  }

  return <OrganizationCreateForm {...props} />;
}
