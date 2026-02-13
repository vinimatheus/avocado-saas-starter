"use client";

import Link from "next/link";
import { useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

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
import { resetPasswordSchema, type ResetPasswordValues } from "@/lib/auth/schemas";
import { authClient } from "@/lib/auth/client";
import { localizeAuthErrorMessage } from "@/lib/auth/error-messages";
import { stripFieldRef } from "@/lib/forms/rhf";
import { getFirstValidationErrorMessage } from "@/lib/forms/validation-toast";

type ResetPasswordFormProps = {
  token: string | null;
  tokenError: string | null;
  callbackPath?: string;
};

function buildSignInHref(callbackPath: string): string {
  if (callbackPath === "/") {
    return "/sign-in";
  }

  const params = new URLSearchParams();
  params.set("next", callbackPath);
  return `/sign-in?${params.toString()}`;
}

function buildForgotPasswordHref(callbackPath: string): string {
  if (callbackPath === "/") {
    return "/forgot-password";
  }

  const params = new URLSearchParams();
  params.set("next", callbackPath);
  return `/forgot-password?${params.toString()}`;
}

export function ResetPasswordForm({
  token,
  tokenError,
  callbackPath = "/",
}: ResetPasswordFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const signInHref = buildSignInHref(callbackPath);
  const forgotPasswordHref = buildForgotPasswordHref(callbackPath);

  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = form.handleSubmit(
    (values) => {
      if (!token) {
        toast.error("Token de redefinicao ausente ou invalido.");
        return;
      }

      startTransition(async () => {
        const result = await authClient.resetPassword({
          newPassword: values.password,
          token,
        });

        if (result.error) {
          toast.error(localizeAuthErrorMessage(result.error.message ?? "Erro ao redefinir a senha."));
          return;
        }

        toast.success("Senha redefinida com sucesso.");
        router.push(signInHref);
      });
    },
    (errors) => {
      const message = getFirstValidationErrorMessage(errors) ?? "Revise os campos informados.";
      toast.error(message);
    },
  );

  return (
    <Card className="mx-auto w-full max-w-md rounded-2xl border border-border/70 bg-card/90 shadow-[0_36px_90px_-58px_rgba(59,47,47,0.95)] backdrop-blur-xl">
      <CardHeader>
        <Logo size="md" className="mb-4" />
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4" />
          Redefinir senha
        </CardTitle>
        <CardDescription>Crie uma nova senha para sua conta.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {tokenError ? (
          <p className="text-destructive rounded-md border border-red-300/60 bg-red-50 p-3 text-sm">
            Link de redefinicao invalido ou expirado. Solicite um novo link.
          </p>
        ) : null}

        {!token ? (
          <p className="text-muted-foreground rounded-md border p-3 text-sm">
            Nao foi encontrado um token valido de redefinicao.
          </p>
        ) : null}

        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => {
                const fieldProps = stripFieldRef(field);

                return (
                  <FormItem>
                    <FormLabel>Nova senha</FormLabel>
                    <FormControl>
                      <Input
                        {...fieldProps}
                        type="password"
                        placeholder="********"
                        autoComplete="new-password"
                        disabled={!token}
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
                        disabled={!token}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            <Button type="submit" className="w-full" disabled={isPending || !token}>
              {isPending ? "Redefinindo..." : "Redefinir senha"}
            </Button>
          </form>
        </Form>

        <p className="text-muted-foreground text-sm">
          Precisa de um novo link?{" "}
          <Link href={forgotPasswordHref} className="text-foreground underline underline-offset-4">
            Solicitar redefinicao
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
