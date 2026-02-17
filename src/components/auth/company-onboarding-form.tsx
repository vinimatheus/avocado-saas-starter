"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowRightIcon,
  Building2Icon,
  CameraIcon,
  CheckCircle2Icon,
  SparklesIcon,
  UploadIcon,
  UserRoundIcon,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useRouter } from "next/navigation";

import {
  completeOnboardingOrganizationStepAction,
  completeOnboardingProfileStepAction,
  type OnboardingOrganizationActionState,
  type OnboardingProfileActionState,
} from "@/actions/onboarding-actions";
import { FormFeedback } from "@/components/shared/form-feedback";
import { FormSubmitButton } from "@/components/shared/form-submit-button";
import { Logo } from "@/components/shared/logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/client";
import { localizeAuthErrorMessage } from "@/lib/auth/error-messages";
import { stripFieldRef } from "@/lib/forms/rhf";
import { getFirstValidationErrorMessage } from "@/lib/forms/validation-toast";
import { buildOrganizationSlug } from "@/lib/organization/helpers";

const companyOnboardingSchema = z.object({
  companyName: z
    .string()
    .trim()
    .min(2, "Nome da organizacao deve ter ao menos 2 caracteres.")
    .max(120, "Nome da organizacao deve ter no maximo 120 caracteres."),
});

type CompanyOnboardingValues = z.infer<typeof companyOnboardingSchema>;

type CompanyOnboardingFormProps = {
  userName?: string | null;
  userImage?: string | null;
  initialCompanyName?: string;
  keepCurrentActiveOrganization?: boolean;
  mode?: "onboarding" | "create";
  redirectPath?: string;
};

const ORGANIZATION_SLUG_MAX_LENGTH = 70;
const initialOnboardingProfileActionState: OnboardingProfileActionState = {
  status: "idle",
  message: "",
};
const initialOnboardingOrganizationActionState: OnboardingOrganizationActionState = {
  status: "idle",
  message: "",
  redirectTo: null,
};

function generateOrganizationSlugVariant(baseSlug: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  const base = baseSlug
    .slice(0, Math.max(1, ORGANIZATION_SLUG_MAX_LENGTH - suffix.length - 1))
    .replace(/-+$/g, "");

  return `${base || "organizacao"}-${suffix}`.slice(0, ORGANIZATION_SLUG_MAX_LENGTH);
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
  const [nameInput, setNameInput] = useState((userName ?? "").trim());
  const [companyNameInput, setCompanyNameInput] = useState(initialCompanyName);
  const [profileImageName, setProfileImageName] = useState("");
  const [organizationImageName, setOrganizationImageName] = useState("");

  const normalizedUserImage = normalizeImageUrl(userImage);

  const [profileState, profileStepAction] = useActionState(
    completeOnboardingProfileStepAction,
    initialOnboardingProfileActionState,
  );
  const [organizationState, organizationStepAction] = useActionState(
    completeOnboardingOrganizationStepAction,
    initialOnboardingOrganizationActionState,
  );
  const currentStep: 1 | 2 = profileState.status === "success" ? 2 : 1;
  const isProfileStep = currentStep === 1;
  const progressLabel = isProfileStep ? "50%" : "100%";

  useEffect(() => {
    if (organizationState.status !== "success" || !organizationState.redirectTo) {
      return;
    }

    router.replace(organizationState.redirectTo);
    router.refresh();
  }, [organizationState.redirectTo, organizationState.status, router]);

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
            {isProfileStep ? (
              <UserRoundIcon className="text-primary size-[1.1rem]" />
            ) : (
              <Building2Icon className="text-primary size-[1.1rem]" />
            )}
            {isProfileStep ? "Seu perfil primeiro" : "Organizacao da conta"}
          </CardTitle>
          <CardDescription className="text-muted-foreground text-sm leading-relaxed">
            {isProfileStep
              ? "Preencha seu nome e, se quiser, atualize seu avatar. Em seguida voce configura a empresa."
              : "Defina o nome da organizacao e personalize o avatar da empresa para finalizar o onboarding."}
          </CardDescription>
        </div>

        <div className="rounded-2xl border border-border/75 bg-background/70 p-3">
          <div className="text-muted-foreground flex items-center justify-between text-[0.65rem] font-semibold tracking-[0.08em] uppercase">
            <span>Progresso do onboarding</span>
            <span>{progressLabel}</span>
          </div>
          <div className="bg-muted mt-2 h-2 overflow-hidden rounded-full">
            <div
              className={`h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-500 ${
                isProfileStep ? "w-1/2" : "w-full"
              }`}
            />
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div
              className={`rounded-xl border px-3 py-2 ${
                isProfileStep ? "border-primary/60 bg-primary/10" : "border-emerald-500/30 bg-emerald-500/10"
              }`}
            >
              <p className="text-foreground flex items-center gap-2 text-sm font-semibold">
                <UserRoundIcon className="size-4" />
                1. Perfil pessoal
              </p>
              <p className="text-muted-foreground mt-1 text-xs">Nome e avatar do usuario.</p>
            </div>

            <div
              className={`rounded-xl border px-3 py-2 ${
                isProfileStep ? "border-border/70 bg-muted/35" : "border-primary/60 bg-primary/10"
              }`}
            >
              <p className="text-foreground flex items-center gap-2 text-sm font-semibold">
                <Building2Icon className="size-4" />
                2. Organizacao
              </p>
              <p className="text-muted-foreground mt-1 text-xs">Nome e avatar da empresa.</p>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-6 pb-6">
        {isProfileStep ? (
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
                        setProfileImageName(event.target.files?.[0]?.name?.trim() ?? "")
                      }
                      className="h-10 rounded-lg border-border/70 bg-background/80 text-sm"
                    />
                    <p className="text-muted-foreground mt-2 text-xs">
                      PNG, JPEG, GIF ou WEBP com ate 5 MB.
                    </p>
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
                <div className="mt-4 rounded-lg border border-border/70 bg-background/70 p-3">
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    O avatar e opcional. Se preferir, finalize agora e atualize depois no perfil.
                  </p>
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
            >
              Continuar para organizacao
              <ArrowRightIcon className="size-4" />
            </FormSubmitButton>
          </form>
        ) : (
          <form action={organizationStepAction} className="space-y-5">
            <input type="hidden" name="redirectPath" value={redirectPath} readOnly />

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
                      name="companyName"
                      type="text"
                      placeholder="Acme SaaS"
                      autoComplete="organization"
                      defaultValue={companyNameInput}
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
                      name="organizationImage"
                      type="file"
                      accept="image/*"
                      onChange={(event) =>
                        setOrganizationImageName(event.target.files?.[0]?.name?.trim() ?? "")
                      }
                      className="h-10 rounded-lg border-border/70 bg-background/80 text-sm"
                    />
                    <p className="text-muted-foreground mt-2 text-xs">
                      PNG, JPEG, GIF ou WEBP com ate 5 MB.
                    </p>
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
                <p className="text-foreground text-sm font-semibold">Identidade da empresa</p>
                <div className="mt-3 rounded-lg border border-border/70 bg-background/70 p-3">
                  <p className="text-foreground text-sm font-semibold">
                    {companyNameInput.trim() || "Sua organizacao"}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                    Esse nome sera exibido no painel e para membros convidados.
                  </p>
                </div>
                <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
                  <p className="text-foreground flex items-center gap-2 text-xs font-semibold">
                    <CheckCircle2Icon className="size-3.5" />
                    Etapa final
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Ao concluir, sua area principal sera liberada automaticamente.
                  </p>
                </div>
              </aside>
            </div>

            <FormFeedback state={organizationState} showInline={false} />
            {organizationState.status === "error" && organizationState.message ? (
              <p className="text-destructive rounded-xl border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm font-medium">
                {organizationState.message}
              </p>
            ) : null}

            <FormSubmitButton
              className="h-11 w-full rounded-xl text-sm font-semibold shadow-[0_14px_30px_-20px_rgba(76,175,80,0.85)]"
              pendingLabel="Concluindo onboarding..."
            >
              <CameraIcon className="size-4" />
              Concluir onboarding
            </FormSubmitButton>
          </form>
        )}
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
  const [serverMessage, setServerMessage] = useState<string>("");

  const form = useForm<CompanyOnboardingValues>({
    resolver: zodResolver(companyOnboardingSchema),
    defaultValues: {
      companyName: initialCompanyName,
    },
  });

  const onSubmit = form.handleSubmit(
    (values) => {
      setServerMessage("");
      startTransition(async () => {
        const sessionResult = await authClient.getSession();
        const userEmail = sessionResult.data?.user.email ?? null;
        if (!userEmail) {
          const message = "Nao foi possivel identificar seu e-mail. Faca login novamente.";
          setServerMessage(message);
          toast.error(message);
          return;
        }

        const slug = buildOrganizationSlug(values.companyName, userEmail);

        const organizationResult = await authClient.organization.create({
          name: values.companyName,
          slug,
          keepCurrentActiveOrganization,
        });

        if (organizationResult.error) {
          const rawErrorMessage = organizationResult.error.message ?? "";
          const normalizedErrorMessage = rawErrorMessage.trim().toLowerCase();

          if (normalizedErrorMessage.includes("organization already exists")) {
            const organizationsResult = await authClient.organization.list();
            if (organizationsResult.error) {
              const message = localizeAuthErrorMessage(
                organizationsResult.error.message ?? "Nao foi possivel verificar suas organizacoes.",
              );
              setServerMessage(message);
              toast.error(message);
              return;
            }

            const organizations = organizationsResult.data ?? [];
            const existingOrganization = organizations.find((organization) => organization.slug === slug);

            if (existingOrganization) {
              if (!keepCurrentActiveOrganization) {
                const activateResult = await authClient.organization.setActive({
                  organizationId: existingOrganization.id,
                });

                if (activateResult.error) {
                  const message = localizeAuthErrorMessage(
                    activateResult.error.message ?? "Nao foi possivel ativar a organizacao.",
                  );
                  setServerMessage(message);
                  toast.error(message);
                  return;
                }
              }

              toast.success(
                keepCurrentActiveOrganization
                  ? "Organizacao ja existe. Use o seletor do menu lateral para trocar de organizacao."
                  : "Organizacao vinculada com sucesso.",
              );
              router.replace(redirectPath);
              router.refresh();
              return;
            }

            // If the slug is taken but the organization is not in the user's list, generate a new slug.
            const retryResult = await authClient.organization.create({
              name: values.companyName,
              slug: generateOrganizationSlugVariant(slug),
              keepCurrentActiveOrganization,
            });

            if (!retryResult.error) {
              toast.success(
                keepCurrentActiveOrganization
                  ? "Organizacao criada. Use o seletor do menu lateral para trocar de organizacao."
                  : "Organizacao vinculada com sucesso.",
              );
              router.replace(redirectPath);
              router.refresh();
              return;
            }

            const message = localizeAuthErrorMessage(
              retryResult.error.message ?? "Nao foi possivel criar a organizacao.",
            );
            setServerMessage(message);
            toast.error(message);
            return;
          }

          const message = localizeAuthErrorMessage(
            organizationResult.error.message ?? "Nao foi possivel criar a organizacao.",
          );
          setServerMessage(message);
          toast.error(message);
          return;
        }

        toast.success(
          keepCurrentActiveOrganization
            ? "Organizacao criada. Use o seletor do menu lateral para trocar de organizacao."
            : "Organizacao vinculada com sucesso.",
        );
        router.replace(redirectPath);
        router.refresh();
      });
    },
    (errors) => {
      const message = getFirstValidationErrorMessage(errors) ?? "Revise os campos informados.";
      setServerMessage(message);
      toast.error(message);
    },
  );

  return (
    <Card className="mx-auto w-full max-w-md overflow-hidden rounded-[1.8rem] border border-border/75 bg-card/95 shadow-[0_45px_110px_-70px_rgba(17,34,20,0.92)] backdrop-blur-xl">
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
              ? `${userName}, informe os dados da nova organizacao.`
              : "Informe os dados da nova organizacao."}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 px-6 pb-6">
        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="companyName"
              render={({ field }) => {
                const fieldProps = stripFieldRef(field);

                return (
                  <FormItem>
                    <FormLabel className="text-[0.72rem] font-semibold tracking-[0.08em] uppercase">
                      Organizacao
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Building2Icon className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
                        <Input
                          {...fieldProps}
                          type="text"
                          placeholder="Acme SaaS"
                          autoComplete="organization"
                          className="h-10 rounded-xl border-border/80 bg-background/80 pl-10 text-sm"
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            {serverMessage ? (
              <p className="text-destructive text-sm font-medium">{serverMessage}</p>
            ) : null}

            <Button
              type="submit"
              className="h-11 w-full rounded-xl text-sm font-semibold shadow-[0_14px_30px_-20px_rgba(76,175,80,0.85)]"
              disabled={isPending}
            >
              {isPending ? "Criando organizacao..." : "Criar organizacao"}
            </Button>
          </form>
        </Form>
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
