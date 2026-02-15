"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowRightIcon,
  Building2Icon,
  KeyRoundIcon,
  MailIcon,
  ShieldCheckIcon,
  UserIcon,
  UserPlusIcon,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

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
import { Logo } from "@/components/shared/logo";
import { localizeAuthErrorMessage } from "@/lib/auth/error-messages";
import { signUpSchema, type SignUpValues } from "@/lib/auth/schemas";
import { authClient, signUp } from "@/lib/auth/client";
import { buildOrganizationSlug } from "@/lib/organization/helpers";
import { stripFieldRef } from "@/lib/forms/rhf";
import { getFirstValidationErrorMessage } from "@/lib/forms/validation-toast";

const defaultValues: SignUpValues = {
  name: "",
  companyName: "",
  email: "",
  password: "",
  confirmPassword: "",
};

type SignUpFormProps = {
  callbackPath?: string;
  initialEmail?: string;
  skipOrganizationCreation?: boolean;
};

function buildSignInHref(
  callbackPath: string,
  initialEmail: string,
  emailVerificationPending = false,
): string {
  const params = new URLSearchParams();
  if (callbackPath !== "/") {
    params.set("next", callbackPath);
  }
  if (initialEmail) {
    params.set("email", initialEmail);
  }
  if (emailVerificationPending) {
    params.set("verify", "1");
  }

  const queryString = params.toString();
  return queryString ? `/sign-in?${queryString}` : "/sign-in";
}

function buildOnboardingCallbackPath(companyName: string): string {
  const params = new URLSearchParams();
  const normalizedCompanyName = companyName.trim();
  if (normalizedCompanyName) {
    params.set("company", normalizedCompanyName);
  }

  const queryString = params.toString();
  return queryString ? `/onboarding/company?${queryString}` : "/onboarding/company";
}

function buildAbsoluteCallbackURL(callbackPath: string): string {
  if (typeof window === "undefined") {
    return callbackPath;
  }

  return new URL(callbackPath, window.location.origin).toString();
}

export function SignUpForm({
  callbackPath = "/",
  initialEmail = "",
  skipOrganizationCreation = false,
}: SignUpFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverMessage, setServerMessage] = useState<string>("");

  const form = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      ...defaultValues,
      companyName: skipOrganizationCreation ? "Organizacao convidada" : "",
      email: initialEmail,
    },
  });

  const signInHref = buildSignInHref(callbackPath, initialEmail);

  const onSubmit = form.handleSubmit(
    (values) => {
      setServerMessage("");
      startTransition(async () => {
        const verificationCallbackPath = skipOrganizationCreation
          ? callbackPath
          : buildOnboardingCallbackPath(values.companyName);

        const result = await signUp.email({
          name: values.name,
          email: values.email,
          password: values.password,
          callbackURL: buildAbsoluteCallbackURL(verificationCallbackPath),
        });

        if (result.error) {
          const message = localizeAuthErrorMessage(result.error.message ?? "Nao foi possivel criar a conta.");
          setServerMessage(message);
          toast.error(message);
          return;
        }

        const sessionResult = await authClient.getSession();
        const hasSession = Boolean(sessionResult.data?.session);

        if (!hasSession) {
          toast.success("Conta criada. Verifique seu e-mail para liberar o acesso.");
          router.replace(buildSignInHref(verificationCallbackPath, values.email, true));
          router.refresh();
          return;
        }

        if (skipOrganizationCreation) {
          toast.success("Conta criada com sucesso.");
          router.replace(callbackPath);
          router.refresh();
          return;
        }

        const organizationResult = await authClient.organization.create({
          name: values.companyName,
          slug: buildOrganizationSlug(values.companyName, values.email),
        });

        if (organizationResult.error) {
          toast.error("Conta criada, mas faltou vincular organizacao. Complete na etapa inicial.");
          router.replace("/onboarding/company");
          router.refresh();
          return;
        }

        toast.success("Conta e organizacao criadas com sucesso.");
        router.replace(callbackPath);
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
    <Card className="mx-auto w-full max-w-md overflow-hidden rounded-[1.8rem] border border-border/75 bg-card/96 shadow-[0_45px_110px_-70px_rgba(17,34,20,0.92)] backdrop-blur-xl">
      <div aria-hidden className="h-1 w-full bg-gradient-to-r from-primary to-accent" />

      <CardHeader className="space-y-4 px-6 pt-6">
        <div className="flex items-center justify-between gap-3">
          <Logo size="md" />
          <span className="border-border/70 bg-background/70 text-muted-foreground inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[0.6rem] font-semibold tracking-[0.1em] uppercase">
            <ShieldCheckIcon className="text-primary size-3.5" />
            Cadastro seguro
          </span>
        </div>

        <div className="space-y-2">
          <CardTitle className="text-foreground flex items-center gap-2 text-[1.72rem] font-black tracking-tight">
            <UserPlusIcon className="text-primary size-[1.1rem]" />
            Criar conta
          </CardTitle>
          <CardDescription className="text-muted-foreground text-sm leading-relaxed">
            {skipOrganizationCreation
              ? "Cadastre seus dados para aceitar o convite da organizacao."
              : "Cadastre seus dados para ativar sua area de trabalho."}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 px-6 pb-6">
        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => {
                const fieldProps = stripFieldRef(field);

                return (
                  <FormItem>
                    <FormLabel className="text-[0.72rem] font-semibold tracking-[0.08em] uppercase">
                      Nome
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <UserIcon className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
                        <Input
                          {...fieldProps}
                          type="text"
                          placeholder="Joao Silva"
                          autoComplete="name"
                          className="h-10 rounded-xl border-border/80 bg-background/80 pl-10 text-sm"
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            {skipOrganizationCreation ? (
              <input type="hidden" {...form.register("companyName")} />
            ) : (
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
            )}

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => {
                const fieldProps = stripFieldRef(field);

                return (
                  <FormItem>
                    <FormLabel className="text-[0.72rem] font-semibold tracking-[0.08em] uppercase">
                      E-mail
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <MailIcon className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
                        <Input
                          {...fieldProps}
                          type="email"
                          placeholder="voce@organizacao.com"
                          autoComplete="email"
                          className="h-10 rounded-xl border-border/80 bg-background/80 pl-10 text-sm"
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => {
                const fieldProps = stripFieldRef(field);

                return (
                  <FormItem>
                    <FormLabel className="text-[0.72rem] font-semibold tracking-[0.08em] uppercase">
                      Senha
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <KeyRoundIcon className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
                        <Input
                          {...fieldProps}
                          type="password"
                          placeholder="********"
                          autoComplete="new-password"
                          className="h-10 rounded-xl border-border/80 bg-background/80 pl-10 text-sm"
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => {
                const fieldProps = stripFieldRef(field);

                return (
                  <FormItem>
                    <FormLabel className="text-[0.72rem] font-semibold tracking-[0.08em] uppercase">
                      Confirmar senha
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <KeyRoundIcon className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
                        <Input
                          {...fieldProps}
                          type="password"
                          placeholder="********"
                          autoComplete="new-password"
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
              <p className="bg-destructive/10 text-destructive rounded-xl border border-destructive/35 px-3 py-2 text-sm font-medium">
                {serverMessage}
              </p>
            ) : null}

            <Button
              type="submit"
              className="h-11 w-full rounded-xl text-sm font-semibold shadow-[0_14px_30px_-20px_rgba(76,175,80,0.85)]"
              disabled={isPending}
            >
              {isPending ? (
                "Criando conta..."
              ) : (
                <>
                  Criar conta
                  <ArrowRightIcon className="size-4" />
                </>
              )}
            </Button>
          </form>
        </Form>

        <p className="text-muted-foreground text-center text-sm">
          Ja possui conta?{" "}
          <Link href={signInHref} className="text-foreground font-semibold underline underline-offset-4">
            Entrar
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
