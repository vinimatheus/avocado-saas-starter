"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { UserPlusIcon } from "lucide-react";
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
    <Card className="mx-auto w-full max-w-md rounded-2xl border border-border/70 bg-card/90 shadow-[0_36px_90px_-58px_rgba(59,47,47,0.95)] backdrop-blur-xl">
      <CardHeader>
        <Logo size="md" className="mb-4" />
        <CardTitle className="flex items-center gap-2">
          <UserPlusIcon className="size-4" />
          Criar Conta
        </CardTitle>
        <CardDescription>
          {skipOrganizationCreation
            ? "Cadastre seus dados para aceitar o convite da organizacao."
            : "Cadastre nome, e-mail, senha e organizacao."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => {
                const fieldProps = stripFieldRef(field);

                return (
                  <FormItem>
                    <FormLabel>Nome</FormLabel>
                    <FormControl>
                      <Input
                        {...fieldProps}
                        type="text"
                        placeholder="Joao Silva"
                        autoComplete="name"
                      />
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
            )}

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => {
                const fieldProps = stripFieldRef(field);

                return (
                  <FormItem>
                    <FormLabel>E-mail</FormLabel>
                    <FormControl>
                      <Input
                        {...fieldProps}
                        type="email"
                        placeholder="voce@organizacao.com"
                        autoComplete="email"
                      />
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
                    <FormLabel>Senha</FormLabel>
                    <FormControl>
                      <Input
                        {...fieldProps}
                        type="password"
                        placeholder="********"
                        autoComplete="new-password"
                      />
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
                    <FormLabel>Confirmar senha</FormLabel>
                    <FormControl>
                      <Input
                        {...fieldProps}
                        type="password"
                        placeholder="********"
                        autoComplete="new-password"
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
              {isPending ? "Criando conta..." : "Criar conta"}
            </Button>
          </form>
        </Form>

        <p className="text-muted-foreground text-sm">
          Ja possui conta?{" "}
          <Link href={signInHref} className="text-foreground underline underline-offset-4">
            Entrar
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
