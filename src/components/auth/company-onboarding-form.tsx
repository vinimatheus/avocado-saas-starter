"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Building2Icon, CameraIcon, CheckCircle2Icon, UserRoundIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useRouter } from "next/navigation";

import {
  completeOnboardingOrganizationStepAction,
  completeOnboardingProfileStepAction,
  initialOnboardingOrganizationActionState,
  initialOnboardingProfileActionState,
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

  useEffect(() => {
    if (organizationState.status !== "success" || !organizationState.redirectTo) {
      return;
    }

    router.replace(organizationState.redirectTo);
    router.refresh();
  }, [organizationState.redirectTo, organizationState.status, router]);

  return (
    <Card className="mx-auto w-full max-w-xl rounded-2xl border border-border/70 bg-card/90 shadow-[0_36px_90px_-58px_rgba(59,47,47,0.95)] backdrop-blur-xl">
      <CardHeader className="space-y-4">
        <Logo size="md" className="mb-2" />
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-lg">Primeiros passos da conta</CardTitle>
          <span className="text-muted-foreground rounded-full border px-2.5 py-0.5 text-xs font-medium">
            Etapa {currentStep} de 2
          </span>
        </div>
        <CardDescription>
          {currentStep === 1
            ? "Comece com seu perfil: nome e avatar opcional."
            : "Agora configure sua organizacao com nome e avatar da empresa."}
        </CardDescription>

        <div className="grid gap-2 sm:grid-cols-2">
          <div
            className={`rounded-lg border px-3 py-2 text-sm ${
              currentStep === 1
                ? "border-primary/60 bg-primary/5 text-foreground"
                : "border-border/70 text-muted-foreground"
            }`}
          >
            <div className="flex items-center gap-2 font-medium">
              <UserRoundIcon className="size-4" />
              Perfil pessoal
            </div>
            <p className="mt-1 text-xs">Nome e foto do usuario.</p>
          </div>

          <div
            className={`rounded-lg border px-3 py-2 text-sm ${
              currentStep === 2
                ? "border-primary/60 bg-primary/5 text-foreground"
                : "border-border/70 text-muted-foreground"
            }`}
          >
            <div className="flex items-center gap-2 font-medium">
              <Building2Icon className="size-4" />
              Organizacao
            </div>
            <p className="mt-1 text-xs">Nome e avatar da empresa.</p>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {currentStep === 1 ? (
          <form action={profileStepAction} className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-muted/30 p-3">
              <Avatar className="size-12">
                {normalizedUserImage ? <AvatarImage src={normalizedUserImage} alt="Avatar atual" /> : null}
                <AvatarFallback className="text-xs font-semibold">
                  {initialsFromName(nameInput || userName)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium">Seu perfil</p>
                <p className="text-muted-foreground text-xs">Atualize nome e foto antes de continuar.</p>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="onboarding-name" className="text-sm font-medium">
                Nome
              </label>
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
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="onboarding-image" className="text-sm font-medium">
                Avatar (opcional)
              </label>
              <Input id="onboarding-image" name="image" type="file" accept="image/*" />
              <p className="text-muted-foreground text-xs">PNG, JPEG, GIF ou WEBP com ate 5 MB.</p>
            </div>

            <FormSubmitButton className="w-full" pendingLabel="Salvando perfil...">
              <CheckCircle2Icon className="size-4" />
              Continuar para organizacao
            </FormSubmitButton>

            <FormFeedback state={profileState} />
          </form>
        ) : (
          <form action={organizationStepAction} className="space-y-4">
            <input type="hidden" name="redirectPath" value={redirectPath} readOnly />

            <div className="space-y-2">
              <label htmlFor="onboarding-company-name" className="text-sm font-medium">
                Nome da organizacao
              </label>
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
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="onboarding-organization-image" className="text-sm font-medium">
                Avatar da empresa (opcional)
              </label>
              <Input
                id="onboarding-organization-image"
                name="organizationImage"
                type="file"
                accept="image/*"
              />
              <p className="text-muted-foreground text-xs">PNG, JPEG, GIF ou WEBP com ate 5 MB.</p>
            </div>

            <FormSubmitButton className="w-full" pendingLabel="Concluindo onboarding...">
              <CameraIcon className="size-4" />
              Concluir onboarding
            </FormSubmitButton>

            <FormFeedback state={organizationState} />
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
    <Card className="mx-auto w-full max-w-md rounded-2xl border border-border/70 bg-card/90 shadow-[0_36px_90px_-58px_rgba(59,47,47,0.95)] backdrop-blur-xl">
      <CardHeader>
        <Logo size="md" className="mb-4" />
        <CardTitle className="flex items-center gap-2">
          <Building2Icon className="size-4" />
          Nova Organizacao
        </CardTitle>
        <CardDescription>
          {userName
            ? `${userName}, informe os dados da nova organizacao.`
            : "Informe os dados da nova organizacao."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="companyName"
              render={({ field }) => {
                const fieldProps = stripFieldRef(field);

                return (
                  <FormItem>
                    <FormLabel>Organizacao</FormLabel>
                    <FormControl>
                      <Input
                        {...fieldProps}
                        type="text"
                        placeholder="Acme SaaS"
                        autoComplete="organization"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            {serverMessage ? (
              <p className="text-destructive text-sm font-medium">{serverMessage}</p>
            ) : null}

            <Button type="submit" className="w-full" disabled={isPending}>
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
