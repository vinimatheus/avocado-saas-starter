import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Building2Icon, MailIcon, ShieldCheckIcon } from "lucide-react";

import { InvitationResponsePanel } from "@/components/auth/invitation-response-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth/server";
import { normalizeOrganizationRole } from "@/lib/organization/helpers";
import { getTenantContext } from "@/lib/organization/tenant-context";

type SearchParamsInput =
  | Record<string, string | string[] | undefined>
  | Promise<Record<string, string | string[] | undefined>>;

function getSingleSearchParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function parseErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "Nao foi possivel carregar os dados do convite.";
}

function roleLabel(role: string): string {
  const normalizedRole = normalizeOrganizationRole(role);
  if (normalizedRole === "owner") {
    return "Proprietario";
  }

  return normalizedRole === "admin" ? "Administrador" : "Usuario";
}

export const metadata: Metadata = {
  title: "Aceitar convite",
  description: "Confirme o convite para entrar em uma organizacao no avocado SaaS Starter.",
  alternates: {
    canonical: "/convites/aceitar",
  },
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
      "max-image-preview": "none",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const invitationId = getSingleSearchParam(resolvedSearchParams.id).trim();
  const invitationEmail = getSingleSearchParam(resolvedSearchParams.email).trim();

  const callbackParams = new URLSearchParams();
  callbackParams.set("id", invitationId);
  if (invitationEmail) {
    callbackParams.set("email", invitationEmail);
  }
  const callbackPath = `/convites/aceitar?${callbackParams.toString()}`;

  const tenantContext = await getTenantContext();
  if (!tenantContext.session?.user) {
    return (
      <main className="bg-muted/40 flex min-h-screen items-center justify-center px-4 py-10">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>Aceitar convite</CardTitle>
            <CardDescription>
              Faca login ou crie sua conta para concluir a entrada na organizacao.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild>
              <Link
                href={`/sign-in?next=${encodeURIComponent(callbackPath)}${invitationEmail ? `&email=${encodeURIComponent(invitationEmail)}` : ""}`}
              >
                Entrar
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link
                href={`/sign-up?next=${encodeURIComponent(callbackPath)}${invitationEmail ? `&email=${encodeURIComponent(invitationEmail)}` : ""}`}
              >
                Criar conta
              </Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (!invitationId) {
    return (
      <main className="bg-muted/40 flex min-h-screen items-center justify-center px-4 py-10">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>Convite invalido</CardTitle>
            <CardDescription>O link de convite esta incompleto ou expirou.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/dashboard">Voltar para o sistema</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  const invitationResult = await auth.api
    .getInvitation({
      headers: await headers(),
      query: {
        id: invitationId,
      },
    })
    .then((invitation) => ({
      invitation,
      errorMessage: null as string | null,
    }))
    .catch((error) => ({
      invitation: null,
      errorMessage: parseErrorMessage(error),
    }));

  if (!invitationResult.invitation) {
    if (tenantContext.organizationId) {
      redirect("/dashboard");
    }

    return (
      <main className="bg-muted/40 flex min-h-screen items-center justify-center px-4 py-10">
        <Card className="w-full max-w-xl">
          <CardHeader>
            <CardTitle>Convite indisponivel</CardTitle>
            <CardDescription>{invitationResult.errorMessage}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href={tenantContext.organizationId ? "/dashboard" : "/onboarding/company"}>
                Continuar
              </Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="bg-muted/40 flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Confirmar convite</CardTitle>
          <CardDescription>
            Revise os dados abaixo e confirme sua entrada na organizacao.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border p-3">
              <p className="text-muted-foreground mb-1 flex items-center gap-2 text-xs font-medium uppercase">
                <Building2Icon className="size-3.5" />
                Organizacao
              </p>
              <p className="text-sm font-medium">{invitationResult.invitation.organizationName}</p>
            </div>

            <div className="rounded-md border p-3">
              <p className="text-muted-foreground mb-1 flex items-center gap-2 text-xs font-medium uppercase">
                <ShieldCheckIcon className="size-3.5" />
                Cargo
              </p>
              <p className="text-sm font-medium">{roleLabel(invitationResult.invitation.role)}</p>
            </div>

            <div className="rounded-md border p-3 sm:col-span-2">
              <p className="text-muted-foreground mb-1 flex items-center gap-2 text-xs font-medium uppercase">
                <MailIcon className="size-3.5" />
                E-mail convidado
              </p>
              <p className="text-sm font-medium">{invitationResult.invitation.email}</p>
            </div>
          </div>

          <InvitationResponsePanel invitationId={invitationId} />
        </CardContent>
      </Card>
    </main>
  );
}
