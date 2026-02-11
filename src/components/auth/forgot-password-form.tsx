"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { MailQuestionIcon } from "lucide-react";
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
import { authClient } from "@/lib/auth/client";
import { forgotPasswordSchema, type ForgotPasswordValues } from "@/lib/auth/schemas";
import { stripFieldRef } from "@/lib/forms/rhf";
import { getFirstValidationErrorMessage } from "@/lib/forms/validation-toast";

type ForgotPasswordFormProps = {
  callbackPath?: string;
  initialEmail?: string;
};

function buildSignInHref(callbackPath: string, email: string): string {
  const params = new URLSearchParams();
  if (callbackPath !== "/") {
    params.set("next", callbackPath);
  }
  if (email) {
    params.set("email", email);
  }

  const queryString = params.toString();
  return queryString ? `/sign-in?${queryString}` : "/sign-in";
}

function buildAbsoluteResetPasswordRedirectUrlForPath(callbackPath: string): string {
  if (typeof window === "undefined") {
    return callbackPath === "/" ? "/reset-password" : `/reset-password?next=${encodeURIComponent(callbackPath)}`;
  }

  const url = new URL("/reset-password", window.location.origin);
  if (callbackPath !== "/") {
    url.searchParams.set("next", callbackPath);
  }
  return url.toString();
}

export function ForgotPasswordForm({
  callbackPath = "/",
  initialEmail = "",
}: ForgotPasswordFormProps) {
  const [isPending, startTransition] = useTransition();
  const [serverMessage, setServerMessage] = useState<string>("");
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: initialEmail,
    },
  });

  const signInHref = buildSignInHref(callbackPath, initialEmail);

  const onSubmit = form.handleSubmit(
    (values) => {
      setServerMessage("");
      startTransition(async () => {
        const result = await authClient.requestPasswordReset({
          email: values.email.toLowerCase(),
          redirectTo: buildAbsoluteResetPasswordRedirectUrlForPath(callbackPath),
        });

        if (result.error) {
          const message = result.error.message ?? "Nao foi possivel enviar o e-mail de redefinicao.";
          setServerMessage(message);
          toast.error(message);
          return;
        }

        setSubmitted(true);
        toast.success("Se o e-mail existir, enviaremos um link para redefinir a senha.");
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
          <MailQuestionIcon className="size-4" />
          Esqueci minha senha
        </CardTitle>
        <CardDescription>Informe seu e-mail para receber um link de redefinicao.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
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
                        placeholder="voce@empresa.com"
                        autoComplete="email"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            {serverMessage ? <p className="text-destructive text-sm font-medium">{serverMessage}</p> : null}

            {submitted ? (
              <p className="text-muted-foreground rounded-md border p-3 text-sm">
                Se o e-mail existir na base, voce recebera um link de redefinicao em instantes.
              </p>
            ) : null}

            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "Enviando..." : "Enviar link de redefinicao"}
            </Button>
          </form>
        </Form>

        <p className="text-muted-foreground text-sm">
          Lembrou a senha?{" "}
          <Link href={signInHref} className="text-foreground underline underline-offset-4">
            Voltar para login
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
