import type { Metadata } from "next";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AlertTriangleIcon, CheckCircle2Icon, Loader2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth/server";
import {
  getOrganizationCreationIntentMetadataKey,
  markOrganizationCreationIntentAsConsumed,
  markOrganizationCreationIntentAsConsuming,
  resolveOrganizationCreationIntentForFinalize,
} from "@/lib/billing/subscription-service";
import { createOrganizationWithSlugFallback } from "@/lib/organization/create-organization";
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

function parseActionError(error: unknown): string {
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

  return "Falha ao concluir a criacao da organizacao apos o pagamento.";
}

async function activateOrganizationAndRedirect(
  requestHeaders: Headers,
  organizationId: string,
): Promise<never> {
  await auth.api
    .setActiveOrganization({
      headers: requestHeaders,
      body: {
        organizationId,
      },
    })
    .catch(() => null);

  revalidatePath("/dashboard");
  revalidatePath("/billing");
  revalidatePath("/empresa/nova");
  redirect("/dashboard");
}

function renderPendingState(input: {
  intentId: string;
  message: string;
  checkoutUrl: string | null;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-lg border-primary/30 bg-card/95 shadow-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Loader2Icon className="size-4 animate-spin text-primary" />
            Pagamento em processamento
          </CardTitle>
          <CardDescription>{input.message}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Atualize esta tela para verificar a aprovacao. Assim que o pagamento for confirmado, a
            organizacao sera criada automaticamente.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="default">
              <Link href={`/checkout/organization?intent=${encodeURIComponent(input.intentId)}`}>
                Atualizar status
              </Link>
            </Button>
            {input.checkoutUrl ? (
              <Button asChild variant="outline">
                <a href={input.checkoutUrl} target="_blank" rel="noreferrer">
                  Abrir checkout
                </a>
              </Button>
            ) : null}
            <Button asChild variant="ghost">
              <Link href="/empresa/nova">Voltar</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

function renderBlockedState(message: string) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-lg border-destructive/35 bg-card/95 shadow-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="flex items-center gap-2 text-lg text-destructive">
            <AlertTriangleIcon className="size-4" />
            Pagamento nao aprovado
          </CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Nenhuma organizacao foi criada. Para continuar, inicie uma nova tentativa de pagamento.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="default">
              <Link href="/empresa/nova">Nova tentativa</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/billing">Ir para billing</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

function renderErrorState(message: string, intentId: string | null) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-lg border-destructive/35 bg-card/95 shadow-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="flex items-center gap-2 text-lg text-destructive">
            <AlertTriangleIcon className="size-4" />
            Nao foi possivel concluir
          </CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-2">
            {intentId ? (
              <Button asChild variant="default">
                <Link href={`/checkout/organization?intent=${encodeURIComponent(intentId)}`}>
                  Tentar novamente
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link href="/empresa/nova">Voltar</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

function renderPaymentApprovedState() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-lg border-emerald-500/35 bg-card/95 shadow-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="flex items-center gap-2 text-lg text-emerald-600">
            <CheckCircle2Icon className="size-4" />
            Pagamento aprovado
          </CardTitle>
          <CardDescription>Concluindo a criacao da organizacao...</CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Checkout de organizacao",
  description: "Finalizacao da criacao de organizacao apos pagamento aprovado.",
  alternates: {
    canonical: "/checkout/organization",
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

export default async function OrganizationCheckoutPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const intentId = getSingleSearchParam(resolvedSearchParams.intent).trim();
  const tenantContext = await getTenantContext();

  if (!tenantContext.session?.user?.id) {
    const callbackPath = intentId
      ? `/checkout/organization?intent=${encodeURIComponent(intentId)}`
      : "/checkout/organization";
    redirect(`/sign-in?next=${encodeURIComponent(callbackPath)}`);
  }

  if (!intentId) {
    return renderErrorState("Intent de checkout invalida.", null);
  }

  const ownerUserId = tenantContext.session.user.id;
  const requestHeaders = await headers();
  const resolveFinalization = async () =>
    resolveOrganizationCreationIntentForFinalize({
      ownerUserId,
      intentId,
    });

  const finalized = await resolveFinalization();
  if (!finalized) {
    return renderErrorState("Checkout nao encontrado para este usuario.", intentId);
  }

  if (finalized.intent.organizationId) {
    await activateOrganizationAndRedirect(requestHeaders, finalized.intent.organizationId);
  }

  if (finalized.status === "pending") {
    return renderPendingState({
      intentId,
      message: finalized.message,
      checkoutUrl: finalized.intent.checkoutUrl,
    });
  }

  if (finalized.status === "blocked") {
    return renderBlockedState(finalized.message);
  }

  const acquired = await markOrganizationCreationIntentAsConsuming({
    ownerUserId,
    intentId,
  });

  if (!acquired) {
    const refreshed = await resolveFinalization();
    if (refreshed?.intent.organizationId) {
      await activateOrganizationAndRedirect(requestHeaders, refreshed.intent.organizationId);
    }

    if (!refreshed) {
      return renderErrorState("Checkout nao encontrado para este usuario.", intentId);
    }

    if (refreshed.status === "blocked") {
      return renderBlockedState(refreshed.message);
    }

    const pendingMessage =
      refreshed.status === "pending"
        ? refreshed.message
        : "Estamos finalizando a criacao da organizacao. Atualize esta tela em alguns segundos.";
    return renderPendingState({
      intentId,
      message: pendingMessage,
      checkoutUrl: refreshed.intent.checkoutUrl,
    });
  }

  const readyIntent = finalized.intent;

  try {
    const metadataKey = getOrganizationCreationIntentMetadataKey();
    const organization = await createOrganizationWithSlugFallback({
      requestHeaders,
      companyName: readyIntent.companyName,
      slug: readyIntent.companySlug,
      logo: readyIntent.companyLogo,
      metadata: {
        flow: "organization_creation",
        [metadataKey]: readyIntent.id,
      },
      keepCurrentActiveOrganization: false,
      reuseExistingOnSlugConflict: false,
    });

    await markOrganizationCreationIntentAsConsumed({
      ownerUserId,
      intentId,
      organizationId: organization.id,
    });

    await activateOrganizationAndRedirect(requestHeaders, organization.id);
  } catch (error) {
    console.error("Falha ao finalizar criacao de organizacao apos pagamento.", error);

    const refreshed = await resolveFinalization();
    if (refreshed?.intent.organizationId) {
      await activateOrganizationAndRedirect(requestHeaders, refreshed.intent.organizationId);
    }

    return renderErrorState(parseActionError(error), intentId);
  }

  return renderPaymentApprovedState();
}
