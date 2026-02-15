"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent, type SVGProps } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowRightIcon,
  BadgeCheckIcon,
  KeyRoundIcon,
  LogInIcon,
  MailIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

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
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/shared/logo";
import { signInSchema, type SignInValues } from "@/lib/auth/schemas";
import { isEmailNotVerifiedErrorMessage, localizeAuthErrorMessage } from "@/lib/auth/error-messages";
import { authClient, signIn } from "@/lib/auth/client";
import { stripFieldRef } from "@/lib/forms/rhf";
import { getFirstValidationErrorMessage } from "@/lib/forms/validation-toast";

const defaultValues: SignInValues = {
  email: "",
  password: "",
};

type SignInFormProps = {
  callbackPath?: string;
  initialEmail?: string;
  showEmailVerificationHint?: boolean;
};

function GoogleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 256 262" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path
        fill="#4285F4"
        d="M255.9 133.5c0-10.8-.9-21.2-2.6-31.3H130.7v59.2h70.1c-3 16-12 29.5-25.6 38.5v32h41.4c24.2-22.2 38.3-55 38.3-98.4z"
      />
      <path
        fill="#34A853"
        d="M130.7 261.1c34.7 0 63.9-11.5 85.2-31.2l-41.4-32c-11.5 7.7-26.2 12.2-43.8 12.2-33.7 0-62.2-22.8-72.4-53.4H15.4v33c21.2 42.1 64.7 71.4 115.3 71.4z"
      />
      <path
        fill="#FBBC05"
        d="M58.3 156.7c-2.5-7.7-3.9-15.9-3.9-24.4s1.4-16.8 3.9-24.4v-33H15.4C5.6 94.4 0 112.8 0 132.3s5.6 37.9 15.4 57.4l42.9-33z"
      />
      <path
        fill="#EA4335"
        d="M130.7 52.4c18.9 0 35.9 6.5 49.3 19.2l37-37C194.5 13.6 165.4.8 130.7.8 80.1.8 36.6 30.1 15.4 72.2l42.9 33c10.2-30.6 38.7-52.8 72.4-52.8z"
      />
    </svg>
  );
}

function buildSignUpHref(callbackPath: string, initialEmail: string): string {
  const params = new URLSearchParams();
  if (callbackPath !== "/") {
    params.set("next", callbackPath);
  }
  if (initialEmail) {
    params.set("email", initialEmail);
  }

  const queryString = params.toString();
  return queryString ? `/sign-up?${queryString}` : "/sign-up";
}

function buildForgotPasswordHref(callbackPath: string, email: string): string {
  const params = new URLSearchParams();
  if (callbackPath !== "/") {
    params.set("next", callbackPath);
  }
  if (email) {
    params.set("email", email);
  }

  const queryString = params.toString();
  return queryString ? `/forgot-password?${queryString}` : "/forgot-password";
}

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

function buildAbsoluteCallbackURL(callbackPath: string): string {
  if (typeof window === "undefined") {
    return callbackPath;
  }

  return new URL(callbackPath, window.location.origin).toString();
}

function hasTwoFactorRedirect(data: unknown): data is { twoFactorRedirect: true } {
  if (typeof data !== "object" || data === null) {
    return false;
  }

  if (!("twoFactorRedirect" in data)) {
    return false;
  }

  return (data as { twoFactorRedirect?: unknown }).twoFactorRedirect === true;
}

function normalizeTwoFactorCode(value: string): string {
  return value.trim().replaceAll(" ", "");
}

export function SignInForm({
  callbackPath = "/",
  initialEmail = "",
  showEmailVerificationHint = false,
}: SignInFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isResendPending, setIsResendPending] = useState(false);
  const [serverMessage, setServerMessage] = useState<string>("");
  const [requiresEmailVerification, setRequiresEmailVerification] = useState(
    showEmailVerificationHint,
  );
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [twoFactorMethod, setTwoFactorMethod] = useState<"totp" | "backup">("totp");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(true);

  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: {
      ...defaultValues,
      email: initialEmail,
    },
  });

  const signUpHref = buildSignUpHref(callbackPath, initialEmail);
  const forgotPasswordHref = buildForgotPasswordHref(callbackPath, initialEmail);

  const sendVerificationEmail = async () => {
    const parsedEmail = z.string().trim().email().safeParse(form.getValues("email"));
    if (!parsedEmail.success) {
      const message = "Informe um e-mail valido para reenviar a verificacao.";
      toast.error(message);
      setServerMessage(message);
      return;
    }

    setIsResendPending(true);
    const result = await authClient.sendVerificationEmail({
      email: parsedEmail.data.toLowerCase(),
      callbackURL: buildAbsoluteCallbackURL(callbackPath),
    });
    setIsResendPending(false);

    if (result.error) {
      const message = localizeAuthErrorMessage(
        result.error.message ?? "Nao foi possivel reenviar o e-mail de verificacao.",
      );
      setServerMessage(message);
      toast.error(message);
      return;
    }

    setRequiresEmailVerification(true);
    setServerMessage("");
    toast.success("E-mail de verificacao reenviado.");
  };

  const onSubmit = form.handleSubmit(
    (values) => {
      setServerMessage("");
      startTransition(async () => {
        const result = await signIn.email({
          email: values.email,
          password: values.password,
          callbackURL: buildAbsoluteCallbackURL(callbackPath),
        });

        if (result.error) {
          const rawMessage = result.error.message ?? "Nao foi possivel autenticar.";
          const message = localizeAuthErrorMessage(rawMessage);
          setRequiresEmailVerification(isEmailNotVerifiedErrorMessage(rawMessage));
          setRequiresTwoFactor(false);
          setServerMessage(message);
          toast.error(message);
          return;
        }

        if (hasTwoFactorRedirect(result.data)) {
          setRequiresTwoFactor(true);
          setRequiresEmailVerification(false);
          setTwoFactorCode("");
          setTwoFactorMethod("totp");
          setServerMessage("");
          toast.message("Informe o codigo de seguranca para concluir o login.");
          return;
        }

        setRequiresTwoFactor(false);
        setRequiresEmailVerification(false);
        toast.success("Login realizado com sucesso.");
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

  const onGoogleSignIn = () => {
    setServerMessage("");
    startTransition(async () => {
      const result = await signIn.social({
        provider: "google",
        callbackURL: buildAbsoluteCallbackURL(callbackPath),
        newUserCallbackURL: buildAbsoluteCallbackURL("/onboarding/company"),
        errorCallbackURL: buildAbsoluteCallbackURL(
          buildSignInHref(callbackPath, form.getValues("email")),
        ),
      });

      if (result.error) {
        const message = localizeAuthErrorMessage(
          result.error.message ??
            "Nao foi possivel iniciar login com Google. Verifique as credenciais.",
        );
        setServerMessage(message);
        toast.error(message);
      }
    });
  };

  const onTwoFactorSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setServerMessage("");

    const normalizedCode = normalizeTwoFactorCode(twoFactorCode);
    if (twoFactorMethod === "totp" && !/^\d{6,8}$/.test(normalizedCode)) {
      const message = "Informe um codigo de autenticador valido.";
      setServerMessage(message);
      toast.error(message);
      return;
    }

    if (twoFactorMethod === "backup" && normalizedCode.length < 8) {
      const message = "Informe um codigo de backup valido.";
      setServerMessage(message);
      toast.error(message);
      return;
    }

    startTransition(async () => {
      const result =
        twoFactorMethod === "totp"
          ? await authClient.twoFactor.verifyTotp({
            code: normalizedCode,
            trustDevice,
          })
          : await authClient.twoFactor.verifyBackupCode({
            code: normalizedCode,
            trustDevice,
          });

      if (result.error) {
        const message = localizeAuthErrorMessage(
          result.error.message ?? "Nao foi possivel validar o codigo de seguranca.",
        );
        setServerMessage(message);
        toast.error(message);
        return;
      }

      setRequiresTwoFactor(false);
      setTwoFactorCode("");
      setServerMessage("");
      toast.success("Login realizado com sucesso.");
      router.replace(callbackPath);
      router.refresh();
    });
  };

  return (
    <Card className="mx-auto w-full max-w-md overflow-hidden rounded-[1.8rem] border border-border/75 bg-card/96 shadow-[0_45px_110px_-70px_rgba(17,34,20,0.92)] backdrop-blur-xl">
      <div aria-hidden className="h-1 w-full bg-gradient-to-r from-primary to-accent" />

      <CardHeader className="space-y-4 px-6 pt-6">
        <div className="flex items-center justify-between gap-3">
          <Logo size="md" />
          <span className="border-border/70 bg-background/70 text-muted-foreground inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[0.6rem] font-semibold tracking-[0.1em] uppercase">
            <ShieldCheckIcon className="text-primary size-3.5" />
            Acesso seguro
          </span>
        </div>

        <div className="space-y-2">
          <CardTitle className="text-foreground flex items-center gap-2 text-[1.72rem] font-black tracking-tight">
            <LogInIcon className="text-primary size-[1.1rem]" />
            Acesse sua conta
          </CardTitle>
          <CardDescription className="text-muted-foreground text-sm leading-relaxed">
            Entre para continuar com faturamento, usuarios e operacao do seu SaaS.
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 px-6 pb-6">
        {requiresTwoFactor ? (
          <form
            onSubmit={onTwoFactorSubmit}
            className="border-border/70 bg-background/55 space-y-4 rounded-2xl border p-4"
          >
            <div className="flex items-center gap-2">
              <span className="bg-primary/12 text-primary inline-flex size-8 items-center justify-center rounded-lg">
                <BadgeCheckIcon className="size-4" />
              </span>
              <div>
                <p className="text-sm font-semibold">Verificacao em duas etapas</p>
                <p className="text-muted-foreground text-xs">Confirme para concluir o acesso.</p>
              </div>
            </div>

            <div className="border-border/70 bg-background/60 grid grid-cols-2 gap-1 rounded-xl border p-1">
              <Button
                type="button"
                size="sm"
                variant={twoFactorMethod === "totp" ? "default" : "ghost"}
                className="h-8 rounded-lg text-[0.72rem] font-semibold"
                onClick={() => {
                  setTwoFactorMethod("totp");
                  setTwoFactorCode("");
                }}
                disabled={isPending}
              >
                App autenticador
              </Button>
              <Button
                type="button"
                size="sm"
                variant={twoFactorMethod === "backup" ? "default" : "ghost"}
                className="h-8 rounded-lg text-[0.72rem] font-semibold"
                onClick={() => {
                  setTwoFactorMethod("backup");
                  setTwoFactorCode("");
                }}
                disabled={isPending}
              >
                Codigo backup
              </Button>
            </div>

            <div className="space-y-2.5">
              <Label
                htmlFor="two-factor-code"
                className="text-[0.72rem] font-semibold tracking-[0.08em] uppercase"
              >
                {twoFactorMethod === "totp" ? "Codigo do app autenticador" : "Codigo de backup"}
              </Label>
              <Input
                id="two-factor-code"
                value={twoFactorCode}
                onChange={(event) => {
                  setTwoFactorCode(event.target.value);
                }}
                placeholder={twoFactorMethod === "totp" ? "000000" : "codigo-reserva"}
                autoComplete="one-time-code"
                inputMode={twoFactorMethod === "totp" ? "numeric" : "text"}
                className="h-10 rounded-xl border-border/80 bg-background/85 px-3 text-sm"
              />
              <p className="text-muted-foreground text-xs">
                {twoFactorMethod === "totp"
                  ? "Abra seu app autenticador e digite o codigo atual."
                  : "Use um dos codigos de backup gerados ao ativar o 2FA."}
              </p>
            </div>

            <label className="text-muted-foreground flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={trustDevice}
                onChange={(event) => {
                  setTrustDevice(event.target.checked);
                }}
                className="text-primary focus-visible:ring-ring/40 size-4 rounded border-border"
                disabled={isPending}
              />
              Confiar neste dispositivo por 30 dias
            </label>

            {serverMessage ? (
              <p className="bg-destructive/10 text-destructive rounded-xl border border-destructive/35 px-3 py-2 text-sm font-medium">
                {serverMessage}
              </p>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl"
                onClick={() => {
                  setRequiresTwoFactor(false);
                  setTwoFactorCode("");
                  setServerMessage("");
                }}
                disabled={isPending}
              >
                Voltar
              </Button>
              <Button type="submit" className="h-10 rounded-xl font-semibold" disabled={isPending}>
                {isPending ? "Validando..." : "Validar e entrar"}
              </Button>
            </div>
          </form>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              className="border-border/80 bg-background/65 hover:bg-background h-10 w-full rounded-xl text-sm font-semibold"
              onClick={onGoogleSignIn}
              disabled={isPending}
            >
              <GoogleIcon className="size-4" />
              {isPending ? "Redirecionando..." : "Continuar com Google"}
            </Button>

            <div className="flex items-center gap-3">
              <span className="bg-border/80 h-px w-full" />
              <span className="text-muted-foreground px-1 text-[0.62rem] font-semibold tracking-[0.14em] uppercase">
                ou
              </span>
              <span className="bg-border/80 h-px w-full" />
            </div>

            <Form {...form}>
              <form onSubmit={onSubmit} className="space-y-4">
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
                        <div className="flex items-center justify-between gap-3">
                          <FormLabel className="text-[0.72rem] font-semibold tracking-[0.08em] uppercase">
                            Senha
                          </FormLabel>
                          <Link
                            href={forgotPasswordHref}
                            className="text-muted-foreground text-[0.68rem] font-medium underline underline-offset-4"
                          >
                            Esqueci minha senha
                          </Link>
                        </div>
                        <FormControl>
                          <div className="relative">
                            <KeyRoundIcon className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
                            <Input
                              {...fieldProps}
                              type="password"
                              placeholder="********"
                              autoComplete="current-password"
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
                  <p className="bg-destructive/10 text-destructive rounded-xl border border-destructive/40 px-3 py-2 text-sm font-medium">
                    {serverMessage}
                  </p>
                ) : null}

                {requiresEmailVerification ? (
                  <div className="border-primary/35 bg-primary/10 space-y-3 rounded-2xl border p-3 text-sm">
                    <div className="flex items-start gap-2">
                      <BadgeCheckIcon className="text-primary mt-0.5 size-4 shrink-0" />
                      <p className="text-muted-foreground">
                        Seu e-mail ainda nao foi verificado. Use o botao abaixo para reenviar o link.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 rounded-lg border-primary/40 bg-background/70 text-xs font-semibold"
                      onClick={sendVerificationEmail}
                      disabled={isResendPending || isPending}
                    >
                      {isResendPending ? "Enviando..." : "Reenviar e-mail de verificacao"}
                    </Button>
                  </div>
                ) : null}

                <Button
                  type="submit"
                  className="h-11 w-full rounded-xl text-sm font-semibold shadow-[0_14px_30px_-20px_rgba(76,175,80,0.85)]"
                  disabled={isPending}
                >
                  {isPending ? (
                    "Entrando..."
                  ) : (
                    <>
                      Entrar na plataforma
                      <ArrowRightIcon className="size-4" />
                    </>
                  )}
                </Button>
              </form>
            </Form>
          </>
        )}

        <p className="text-muted-foreground text-center text-sm">
          Nao possui conta?{" "}
          <Link href={signUpHref} className="text-foreground font-semibold underline underline-offset-4">
            Criar conta
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
