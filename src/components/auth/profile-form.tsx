"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { CameraIcon, Link2Icon, MailIcon, ShieldCheckIcon, Trash2Icon, UserRoundIcon } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import {
  changeProfileEmailAction,
  removeProfileImageAction,
  setProfilePasswordAction,
  updateProfileAction,
  updateProfileImageAction,
} from "@/actions/profile-actions";
import { initialProfileActionState } from "@/actions/profile-action-state";
import { FormFeedback } from "@/components/shared/form-feedback";
import { FormSubmitButton } from "@/components/shared/form-submit-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authClient } from "@/lib/auth/client";
import { localizeAuthErrorMessage } from "@/lib/auth/error-messages";
import {
  profileChangeEmailSchema,
  profileChangePasswordSchema,
  profileSetPasswordSchema,
  profileUpdateSchema,
  type ProfileChangeEmailValues,
  type ProfileChangePasswordValues,
  type ProfileSetPasswordValues,
  type ProfileUpdateValues,
} from "@/lib/auth/schemas";
import { stripFieldRef } from "@/lib/forms/rhf";
import { getFirstValidationErrorMessage } from "@/lib/forms/validation-toast";

type ProfileFormProps = {
  initialName: string;
  initialEmail: string;
  initialImage: string | null;
  initialTwoFactorEnabled: boolean;
  initialHasCredentialAccount: boolean;
  initialHasGoogleAccount: boolean;
  googleProviderEnabled: boolean;
};

const defaultChangePasswordValues: ProfileChangePasswordValues = {
  currentPassword: "",
  newPassword: "",
  confirmNewPassword: "",
};

const defaultSetPasswordValues: ProfileSetPasswordValues = {
  newPassword: "",
  confirmNewPassword: "",
};

function normalizeSecurityCode(value: string): string {
  return value.trim().replaceAll(" ", "");
}

function buildAbsoluteCallbackURL(callbackPath: string): string {
  if (typeof window === "undefined") {
    return callbackPath;
  }

  return new URL(callbackPath, window.location.origin).toString();
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "U";
  const second = parts[1]?.[0] ?? "S";
  return `${first}${second}`.toUpperCase();
}

export function ProfileForm({
  initialName,
  initialEmail,
  initialImage,
  initialTwoFactorEnabled,
  initialHasCredentialAccount,
  initialHasGoogleAccount,
  googleProviderEnabled,
}: ProfileFormProps) {
  const router = useRouter();
  const [isProfilePending, startProfileTransition] = useTransition();
  const [isProfileImagePending, startProfileImageTransition] = useTransition();
  const [isRemoveProfileImagePending, startRemoveProfileImageTransition] = useTransition();
  const [isChangeEmailPending, startChangeEmailTransition] = useTransition();
  const [isChangePasswordPending, startChangePasswordTransition] = useTransition();
  const [isLinkGooglePending, startLinkGoogleTransition] = useTransition();
  const [isTwoFactorPending, startTwoFactorTransition] = useTransition();

  const hasRefreshedAfterProfileSuccess = useRef(false);
  const hasRefreshedAfterProfileImageSuccess = useRef(false);
  const hasRefreshedAfterProfileImageRemovalSuccess = useRef(false);

  const [twoFactorEnabled, setTwoFactorEnabled] = useState(initialTwoFactorEnabled);
  const [hasGoogleAccount, setHasGoogleAccount] = useState(initialHasGoogleAccount);
  const [enablePassword, setEnablePassword] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [totpURI, setTotpURI] = useState<string | null>(null);
  const [totpQrCodeData, setTotpQrCodeData] = useState<{ uri: string; dataUrl: string } | null>(
    null,
  );
  const [totpQrCodeFailedUri, setTotpQrCodeFailedUri] = useState<string | null>(null);
  const [setupCode, setSetupCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  const [profileState, profileAction] = useActionState(
    updateProfileAction,
    initialProfileActionState,
  );
  const [profileImageState, profileImageAction] = useActionState(
    updateProfileImageAction,
    initialProfileActionState,
  );
  const [removeProfileImageState, removeProfileImageActionState] = useActionState(
    removeProfileImageAction,
    initialProfileActionState,
  );
  const [changeEmailState, changeEmailAction] = useActionState(
    changeProfileEmailAction,
    initialProfileActionState,
  );
  const [setPasswordState, setPasswordAction] = useActionState(
    setProfilePasswordAction,
    initialProfileActionState,
  );
  const [changePasswordState, setChangePasswordState] = useState(initialProfileActionState);
  const hasCredentialAccount = initialHasCredentialAccount || setPasswordState.status === "success";

  const form = useForm<ProfileUpdateValues>({
    resolver: zodResolver(profileUpdateSchema),
    defaultValues: {
      name: initialName,
    },
  });

  const changeEmailForm = useForm<ProfileChangeEmailValues>({
    resolver: zodResolver(profileChangeEmailSchema),
    defaultValues: {
      newEmail: initialEmail,
    },
  });

  const changePasswordForm = useForm<ProfileChangePasswordValues>({
    resolver: zodResolver(profileChangePasswordSchema),
    defaultValues: defaultChangePasswordValues,
  });

  const setPasswordForm = useForm<ProfileSetPasswordValues>({
    resolver: zodResolver(profileSetPasswordSchema),
    defaultValues: defaultSetPasswordValues,
  });

  useEffect(() => {
    if (changePasswordState.status !== "success") {
      return;
    }

    changePasswordForm.reset(defaultChangePasswordValues);
  }, [changePasswordForm, changePasswordState.status]);

  useEffect(() => {
    if (setPasswordState.status !== "success") {
      return;
    }

    setPasswordForm.reset(defaultSetPasswordValues);
    toast.success("Senha definida com sucesso.");
    router.refresh();
  }, [router, setPasswordForm, setPasswordState.status]);

  useEffect(() => {
    changeEmailForm.reset({
      newEmail: initialEmail,
    });
  }, [changeEmailForm, initialEmail]);

  const onSubmit = form.handleSubmit(
    (values) => {
      const payload = new FormData();
      payload.set("name", values.name.trim());

      startProfileTransition(() => {
        profileAction(payload);
      });
    },
    (errors) => {
      const message = getFirstValidationErrorMessage(errors) ?? "Revise os campos informados.";
      toast.error(message);
    },
  );

  const onUpdateProfileImageSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const payload = new FormData(event.currentTarget);
    startProfileImageTransition(() => {
      profileImageAction(payload);
    });
  };

  const onRemoveProfileImage = () => {
    const payload = new FormData();
    startRemoveProfileImageTransition(() => {
      removeProfileImageActionState(payload);
    });
  };

  const onChangeEmailSubmit = changeEmailForm.handleSubmit(
    (values) => {
      const payload = new FormData();
      payload.set("newEmail", values.newEmail.trim());

      startChangeEmailTransition(() => {
        changeEmailAction(payload);
      });
    },
    (errors) => {
      const message = getFirstValidationErrorMessage(errors) ?? "Revise os campos informados.";
      toast.error(message);
    },
  );

  const onChangePasswordSubmit = changePasswordForm.handleSubmit(
    (values) => {
      setChangePasswordState(initialProfileActionState);
      startChangePasswordTransition(() => {
        void authClient
          .changePassword({
            currentPassword: values.currentPassword,
            newPassword: values.newPassword,
          })
          .then((result) => {
            if (result.error) {
              setChangePasswordState({
                status: "error",
                message: localizeAuthErrorMessage(result.error.message ?? "Falha ao alterar senha."),
              });
              return;
            }

            setChangePasswordState({
              status: "success",
              message: "Senha alterada com sucesso.",
            });
          })
          .catch(() => {
            setChangePasswordState({
              status: "error",
              message: "Falha ao alterar senha.",
            });
          });
      });
    },
    (errors) => {
      const message = getFirstValidationErrorMessage(errors) ?? "Revise os campos informados.";
      toast.error(message);
    },
  );

  const onSetPasswordSubmit = setPasswordForm.handleSubmit(
    (values) => {
      const payload = new FormData();
      payload.set("newPassword", values.newPassword);
      payload.set("confirmNewPassword", values.confirmNewPassword);

      startChangePasswordTransition(() => {
        setPasswordAction(payload);
      });
    },
    (errors) => {
      const message = getFirstValidationErrorMessage(errors) ?? "Revise os campos informados.";
      toast.error(message);
    },
  );

  const onLinkGoogleAccount = () => {
    if (!googleProviderEnabled) {
      toast.error("Login com Google indisponivel neste ambiente.");
      return;
    }

    startLinkGoogleTransition(() => {
      void authClient
        .linkSocial({
          provider: "google",
          callbackURL: buildAbsoluteCallbackURL("/profile"),
          errorCallbackURL: buildAbsoluteCallbackURL("/profile"),
        })
        .then((result) => {
          if (result.error) {
            toast.error(
              localizeAuthErrorMessage(result.error.message ?? "Nao foi possivel conectar com o Google."),
            );
            return;
          }

          const data = result.data as { redirect?: boolean; status?: boolean } | null | undefined;
          if (data?.redirect === false || data?.status) {
            setHasGoogleAccount(true);
            toast.success("Conta Google conectada.");
            router.refresh();
          }
        })
        .catch(() => {
          toast.error("Nao foi possivel iniciar a conexao com Google.");
        });
    });
  };

  useEffect(() => {
    if (profileState.status !== "success") {
      hasRefreshedAfterProfileSuccess.current = false;
      return;
    }

    if (hasRefreshedAfterProfileSuccess.current) {
      return;
    }

    hasRefreshedAfterProfileSuccess.current = true;
    router.refresh();
  }, [profileState.status, router]);

  useEffect(() => {
    if (profileImageState.status !== "success") {
      hasRefreshedAfterProfileImageSuccess.current = false;
      return;
    }

    if (hasRefreshedAfterProfileImageSuccess.current) {
      return;
    }

    hasRefreshedAfterProfileImageSuccess.current = true;
    router.refresh();
  }, [profileImageState.status, router]);

  useEffect(() => {
    if (removeProfileImageState.status !== "success") {
      hasRefreshedAfterProfileImageRemovalSuccess.current = false;
      return;
    }

    if (hasRefreshedAfterProfileImageRemovalSuccess.current) {
      return;
    }

    hasRefreshedAfterProfileImageRemovalSuccess.current = true;
    router.refresh();
  }, [removeProfileImageState.status, router]);

  useEffect(() => {
    let isCancelled = false;

    if (!totpURI) {
      return;
    }

    void QRCode.toDataURL(totpURI, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 256,
    })
      .then((dataUrl) => {
        if (isCancelled) {
          return;
        }

        setTotpQrCodeData({
          uri: totpURI,
          dataUrl,
        });
        setTotpQrCodeFailedUri(null);
      })
      .catch(() => {
        if (isCancelled) {
          return;
        }

        setTotpQrCodeFailedUri(totpURI);
      });

    return () => {
      isCancelled = true;
    };
  }, [totpURI]);

  const copyToClipboard = async (value: string, label: string) => {
    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copiado.`);
    } catch {
      toast.error(`Nao foi possivel copiar ${label.toLowerCase()}.`);
    }
  };

  const startTwoFactorSetup = () => {
    if (!hasCredentialAccount) {
      toast.error("Defina uma senha antes de ativar o 2FA.");
      return;
    }

    const password = enablePassword;
    if (!password.trim()) {
      toast.error("Informe sua senha atual para ativar o 2FA.");
      return;
    }

    startTwoFactorTransition(async () => {
      const result = await authClient.twoFactor.enable({
        password,
      });

      if (result.error) {
        toast.error(
          localizeAuthErrorMessage(result.error.message ?? "Nao foi possivel iniciar a ativacao do 2FA."),
        );
        return;
      }

      const generatedURI = result.data?.totpURI ?? "";
      const generatedBackupCodes = result.data?.backupCodes ?? [];
      if (!generatedURI || generatedBackupCodes.length === 0) {
        toast.error("Nao foi possivel gerar os dados de seguranca do 2FA.");
        return;
      }

      setTotpURI(generatedURI);
      setBackupCodes(generatedBackupCodes);
      setSetupCode("");
      setDisablePassword("");
      toast.success("2FA iniciado. Conclua com o codigo do app autenticador.");
    });
  };

  const confirmTwoFactorSetup = () => {
    const code = normalizeSecurityCode(setupCode);
    if (!/^\d{6,8}$/.test(code)) {
      toast.error("Informe um codigo valido do app autenticador.");
      return;
    }

    startTwoFactorTransition(async () => {
      const result = await authClient.twoFactor.verifyTotp({
        code,
      });

      if (result.error) {
        toast.error(localizeAuthErrorMessage(result.error.message ?? "Nao foi possivel confirmar o 2FA."));
        return;
      }

      setTwoFactorEnabled(true);
      setEnablePassword("");
      setDisablePassword("");
      setTotpURI(null);
      setSetupCode("");
      toast.success("Autenticacao em dois fatores ativada.");
      router.refresh();
    });
  };

  const regenerateBackupCodes = () => {
    const password = disablePassword;
    if (!password.trim()) {
      toast.error("Informe sua senha atual para gerar novos codigos.");
      return;
    }

    startTwoFactorTransition(async () => {
      const result = await authClient.twoFactor.generateBackupCodes({
        password,
      });

      if (result.error) {
        toast.error(
          localizeAuthErrorMessage(
            result.error.message ?? "Nao foi possivel gerar novos codigos de backup.",
          ),
        );
        return;
      }

      if (!result.data?.backupCodes?.length) {
        toast.error("Nenhum codigo de backup foi retornado.");
        return;
      }

      setBackupCodes(result.data.backupCodes);
      toast.success("Novos codigos de backup gerados.");
    });
  };

  const disableTwoFactor = () => {
    const password = disablePassword;
    if (!password.trim()) {
      toast.error("Informe sua senha atual para desativar o 2FA.");
      return;
    }

    startTwoFactorTransition(async () => {
      const result = await authClient.twoFactor.disable({
        password,
      });

      if (result.error) {
        toast.error(localizeAuthErrorMessage(result.error.message ?? "Nao foi possivel desativar o 2FA."));
        return;
      }

      setTwoFactorEnabled(false);
      setEnablePassword("");
      setDisablePassword("");
      setTotpURI(null);
      setSetupCode("");
      setBackupCodes([]);
      toast.success("Autenticacao em dois fatores desativada.");
      router.refresh();
    });
  };

  const activeTotpQrCode =
    totpURI && totpQrCodeData?.uri === totpURI ? totpQrCodeData.dataUrl : null;
  const activeTotpQrCodeFailed = Boolean(totpURI && totpQrCodeFailedUri === totpURI);
  const profileIdentityFormId = "profile-identity-form";
  const changePasswordFormId = "profile-password-form";
  const setPasswordFormId = "profile-set-password-form";
  const canManageTwoFactor = hasCredentialAccount || twoFactorEnabled;
  const activePasswordFeedbackState = hasCredentialAccount ? changePasswordState : setPasswordState;
  const profileInitials = initialsFromName(initialName);

  return (
    <Tabs defaultValue="profile" className="w-full">
      <TabsList className="grid h-auto w-full grid-cols-2">
        <TabsTrigger value="profile">
          <UserRoundIcon />
          Perfil e identidade
        </TabsTrigger>
        <TabsTrigger value="security">
          <ShieldCheckIcon />
          Seguranca da conta
        </TabsTrigger>
      </TabsList>

      <TabsContent value="profile" forceMount className="mt-0">
        <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserRoundIcon className="size-4" />
            Perfil e identidade
          </CardTitle>
          <CardDescription>
            Atualize as informacoes basicas da sua conta com uma acao principal clara.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="rounded-lg border p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
              <Avatar className="size-20 border bg-muted/40">
                {initialImage ? <AvatarImage src={initialImage} alt="Foto de perfil" /> : null}
                <AvatarFallback className="text-base font-semibold">{profileInitials}</AvatarFallback>
              </Avatar>

              <div className="flex-1 space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Foto de perfil</p>
                  <p className="text-muted-foreground text-xs">
                    Selecione uma imagem de ate 5MB e atualize apenas quando necessario.
                  </p>
                </div>

                <form
                  onSubmit={onUpdateProfileImageSubmit}
                  className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
                >
                  <div className="space-y-1">
                    <Label htmlFor="profile-image">Arquivo de imagem</Label>
                    <Input id="profile-image" name="image" type="file" accept="image/*" required />
                  </div>

                  <Button type="submit" variant="secondary" disabled={isProfileImagePending}>
                    <CameraIcon data-icon="inline-start" />
                    {isProfileImagePending ? "Salvando foto..." : "Atualizar foto"}
                  </Button>
                </form>

                <Button
                  type="button"
                  variant="outline"
                  onClick={onRemoveProfileImage}
                  disabled={isRemoveProfileImagePending || isProfileImagePending || !initialImage}
                >
                  <Trash2Icon data-icon="inline-start" />
                  {isRemoveProfileImagePending ? "Removendo..." : "Remover foto"}
                </Button>
              </div>
            </div>
          </div>

          <FormFeedback state={profileImageState} showInline={false} />
          <FormFeedback state={removeProfileImageState} showInline={false} />

          <Form {...form}>
            <form id={profileIdentityFormId} onSubmit={onSubmit} className="space-y-4">
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
                          autoComplete="name"
                          placeholder="Joao Silva"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              <div className="space-y-1">
                <Label htmlFor="profile-current-email">E-mail atual</Label>
                <Input
                  id="profile-current-email"
                  value={initialEmail}
                  type="email"
                  autoComplete="email"
                  disabled
                  readOnly
                />
              </div>
            </form>
          </Form>

          <FormFeedback state={profileState} showInline={false} />

          <Separator />

          <Form {...changeEmailForm}>
            <form onSubmit={onChangeEmailSubmit} className="space-y-3 rounded-lg border border-dashed p-4">
              <div className="space-y-1">
                <p className="text-sm font-medium">Alterar e-mail de login</p>
                <p className="text-muted-foreground text-xs">
                  Enviaremos uma confirmacao para concluir a troca de e-mail com seguranca.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <FormField
                  control={changeEmailForm.control}
                  name="newEmail"
                  render={({ field }) => {
                    const fieldProps = stripFieldRef(field);

                    return (
                      <FormItem>
                        <FormLabel>Novo e-mail</FormLabel>
                        <FormControl>
                          <Input
                            {...fieldProps}
                            type="email"
                            autoComplete="email"
                            placeholder="novo-email@organizacao.com"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />

                <Button type="submit" variant="secondary" disabled={isChangeEmailPending}>
                  <MailIcon data-icon="inline-start" />
                  {isChangeEmailPending ? "Enviando..." : "Solicitar troca"}
                </Button>
              </div>
            </form>
          </Form>

          <FormFeedback state={changeEmailState} showInline={false} />
        </CardContent>
        <CardFooter className="justify-end border-t">
          <FormSubmitButton
            form={profileIdentityFormId}
            pending={isProfilePending}
            pendingLabel="Salvando perfil..."
          >
            Salvar alteracoes
          </FormSubmitButton>
        </CardFooter>
        </Card>
      </TabsContent>

      <TabsContent value="security" forceMount className="mt-0">
        <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheckIcon className="size-4" />
            Seguranca da conta
          </CardTitle>
          <CardDescription>
            Altere a senha e proteja seu acesso com autenticacao em dois fatores (2FA).
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="space-y-4 rounded-lg border p-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">Login social</p>
              <p className="text-muted-foreground text-xs">
                Conecte sua conta Google para entrar com e-mail/senha ou Google.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={hasGoogleAccount ? "secondary" : "outline"}>
                {hasGoogleAccount ? "Google conectado" : "Google nao conectado"}
              </Badge>
            </div>

            {googleProviderEnabled ? (
              <Button
                type="button"
                variant="secondary"
                onClick={onLinkGoogleAccount}
                disabled={isLinkGooglePending || hasGoogleAccount}
              >
                <Link2Icon data-icon="inline-start" />
                {hasGoogleAccount
                  ? "Conta Google conectada"
                  : isLinkGooglePending
                    ? "Conectando..."
                    : "Conectar com Google"}
              </Button>
            ) : (
              <p className="text-muted-foreground text-xs">
                Login com Google desabilitado neste ambiente.
              </p>
            )}
          </div>

          <div className="space-y-4 rounded-lg border p-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {hasCredentialAccount ? "Alterar senha" : "Definir senha"}
              </p>
              <p className="text-muted-foreground text-xs">
                {hasCredentialAccount
                  ? "Troque a senha periodicamente para reduzir risco de acesso indevido."
                  : "Crie uma senha para permitir login por e-mail/senha."}
              </p>
            </div>

            {hasCredentialAccount ? (
              <Form {...changePasswordForm}>
                <form
                  id={changePasswordFormId}
                  onSubmit={onChangePasswordSubmit}
                  className="space-y-3"
                >
                  <FormField
                    control={changePasswordForm.control}
                    name="currentPassword"
                    render={({ field }) => {
                      const fieldProps = stripFieldRef(field);

                      return (
                        <FormItem>
                          <FormLabel>Senha atual</FormLabel>
                          <FormControl>
                            <Input
                              {...fieldProps}
                              type="password"
                              autoComplete="current-password"
                              placeholder="********"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />

                  <FormField
                    control={changePasswordForm.control}
                    name="newPassword"
                    render={({ field }) => {
                      const fieldProps = stripFieldRef(field);

                      return (
                        <FormItem>
                          <FormLabel>Nova senha</FormLabel>
                          <FormControl>
                            <Input
                              {...fieldProps}
                              type="password"
                              autoComplete="new-password"
                              placeholder="********"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />

                  <FormField
                    control={changePasswordForm.control}
                    name="confirmNewPassword"
                    render={({ field }) => {
                      const fieldProps = stripFieldRef(field);

                      return (
                        <FormItem>
                          <FormLabel>Confirmar nova senha</FormLabel>
                          <FormControl>
                            <Input
                              {...fieldProps}
                              type="password"
                              autoComplete="new-password"
                              placeholder="********"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                </form>
              </Form>
            ) : (
              <Form {...setPasswordForm}>
                <form id={setPasswordFormId} onSubmit={onSetPasswordSubmit} className="space-y-3">
                  <FormField
                    control={setPasswordForm.control}
                    name="newPassword"
                    render={({ field }) => {
                      const fieldProps = stripFieldRef(field);

                      return (
                        <FormItem>
                          <FormLabel>Nova senha</FormLabel>
                          <FormControl>
                            <Input
                              {...fieldProps}
                              type="password"
                              autoComplete="new-password"
                              placeholder="********"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />

                  <FormField
                    control={setPasswordForm.control}
                    name="confirmNewPassword"
                    render={({ field }) => {
                      const fieldProps = stripFieldRef(field);

                      return (
                        <FormItem>
                          <FormLabel>Confirmar nova senha</FormLabel>
                          <FormControl>
                            <Input
                              {...fieldProps}
                              type="password"
                              autoComplete="new-password"
                              placeholder="********"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                </form>
              </Form>
            )}

            <div className="flex justify-end">
              <Button
                type="submit"
                form={hasCredentialAccount ? changePasswordFormId : setPasswordFormId}
                variant="secondary"
                disabled={isChangePasswordPending}
              >
                {isChangePasswordPending
                  ? "Salvando senha..."
                  : hasCredentialAccount
                    ? "Salvar nova senha"
                    : "Definir senha"}
              </Button>
            </div>

            <FormFeedback state={activePasswordFeedbackState} showInline={false} />
          </div>

          <Alert className="border-amber-500/40 bg-amber-500/5">
            <ShieldCheckIcon className="text-amber-600" />
            <AlertTitle className="flex flex-wrap items-center gap-2">
              Autenticacao em dois fatores
              <Badge variant={twoFactorEnabled ? "secondary" : "outline"}>
                {twoFactorEnabled ? "2FA ativo" : "2FA desativado"}
              </Badge>
            </AlertTitle>
            <AlertDescription className="space-y-4">
              <p>
                Adicione uma camada extra de seguranca no login.
              </p>

              <p className="text-sm">
                {twoFactorEnabled
                  ? "Seu login exige codigo de seguranca."
                  : canManageTwoFactor
                    ? "Ative para adicionar uma camada extra de protecao."
                    : "Defina uma senha para poder ativar o 2FA."}
              </p>

              {!twoFactorEnabled && !totpURI && canManageTwoFactor ? (
                <div className="space-y-3 rounded-md border bg-background p-4">
                  <p className="text-muted-foreground text-sm">
                    Confirme sua senha para gerar QR code e codigos de backup.
                  </p>

                  <div className="space-y-2">
                    <Label htmlFor="two-factor-enable-password">Senha atual</Label>
                    <Input
                      id="two-factor-enable-password"
                      type="password"
                      value={enablePassword}
                      onChange={(event) => {
                        setEnablePassword(event.target.value);
                      }}
                      autoComplete="current-password"
                      placeholder="********"
                    />
                  </div>

                  <Button
                    type="button"
                    variant="secondary"
                    onClick={startTwoFactorSetup}
                    disabled={isTwoFactorPending}
                  >
                    {isTwoFactorPending ? "Preparando..." : "Ativar 2FA"}
                  </Button>
                </div>
              ) : null}

              {!twoFactorEnabled && totpURI ? (
                <div className="space-y-4 rounded-md border bg-background p-4">
                  <p className="text-sm font-medium">
                    Escaneie o QR code no autenticador e confirme com o codigo gerado.
                  </p>

                  <div className="space-y-2 rounded-md border bg-muted/40 p-3">
                    <div className="flex justify-center rounded-md bg-background p-3">
                      {activeTotpQrCode ? (
                        <Image
                          src={activeTotpQrCode}
                          alt="QR code para configurar o autenticador"
                          width={192}
                          height={192}
                          unoptimized
                        />
                      ) : (
                        <div className="flex size-48 items-center justify-center rounded-md border text-center text-xs text-muted-foreground">
                          {activeTotpQrCodeFailed
                            ? "Nao foi possivel gerar o QR code."
                            : "Gerando QR code..."}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="two-factor-setup-code">Codigo do autenticador</Label>
                    <Input
                      id="two-factor-setup-code"
                      value={setupCode}
                      onChange={(event) => {
                        setSetupCode(event.target.value);
                      }}
                      autoComplete="one-time-code"
                      inputMode="numeric"
                      placeholder="000000"
                    />
                  </div>

                  <Button
                    type="button"
                    variant="secondary"
                    onClick={confirmTwoFactorSetup}
                    disabled={isTwoFactorPending}
                  >
                    {isTwoFactorPending ? "Salvando..." : "Testar e salvar"}
                  </Button>
                </div>
              ) : null}

              {twoFactorEnabled ? (
                <div className="space-y-3 rounded-md border bg-background p-4">
                  <p className="text-muted-foreground text-sm">
                    Para desativar o 2FA ou gerar novos codigos, confirme sua senha atual.
                  </p>

                  <div className="space-y-2">
                    <Label htmlFor="two-factor-disable-password">Senha atual</Label>
                    <Input
                      id="two-factor-disable-password"
                      type="password"
                      value={disablePassword}
                      onChange={(event) => {
                        setDisablePassword(event.target.value);
                      }}
                      autoComplete="current-password"
                      placeholder="********"
                    />
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={regenerateBackupCodes}
                      disabled={isTwoFactorPending}
                    >
                      {isTwoFactorPending ? "Gerando..." : "Gerar codigos de backup"}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={disableTwoFactor}
                      disabled={isTwoFactorPending}
                    >
                      {isTwoFactorPending ? "Desativando..." : "Desativar 2FA"}
                    </Button>
                  </div>
                </div>
              ) : null}
            </AlertDescription>
          </Alert>

          {twoFactorEnabled && backupCodes.length > 0 ? (
            <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
              <p className="text-sm font-medium">Novos codigos de backup</p>
              <p className="text-muted-foreground text-xs">
                Salve estes codigos antes de sair desta tela.
              </p>
              <div className="grid gap-1 sm:grid-cols-2">
                {backupCodes.map((code) => (
                  <code key={code} className="rounded border bg-background px-2 py-1 text-xs">
                    {code}
                  </code>
                ))}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void copyToClipboard(backupCodes.join("\n"), "codigos de backup");
                  }}
                >
                  Copiar codigos
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setBackupCodes([]);
                  }}
                >
                  Ocultar
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
