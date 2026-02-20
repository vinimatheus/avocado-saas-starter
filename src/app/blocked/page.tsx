import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldAlertIcon } from "lucide-react";

import { SignOutForm } from "@/components/auth/sign-out-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getServerSession } from "@/lib/auth/session";

type SearchParamsInput =
  | Record<string, string | string[] | undefined>
  | Promise<Record<string, string | string[] | undefined>>;

function getSingleSearchParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

export const metadata: Metadata = {
  title: "Acesso bloqueado",
  description: "A organizacao ativa foi bloqueada pela administracao da plataforma.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function BlockedPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  const session = await getServerSession();
  if (!session?.user) {
    redirect("/sign-in");
  }

  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const reason =
    getSingleSearchParam(resolvedSearchParams.reason).trim() ||
    "Sua organizacao foi bloqueada pela administracao da plataforma.";
  const allOrganizationsBlocked = getSingleSearchParam(resolvedSearchParams.allBlocked) === "1";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl items-center justify-center px-4 py-8">
      <Card className="w-full">
        <CardHeader>
          <div className="text-amber-500 mb-3 inline-flex size-10 items-center justify-center rounded-lg border border-amber-500/35 bg-amber-500/10">
            <ShieldAlertIcon className="size-5" />
          </div>
          <CardTitle>Acesso da organizacao bloqueado</CardTitle>
          <CardDescription>
            {allOrganizationsBlocked
              ? "Todas as organizacoes vinculadas a sua conta estao bloqueadas no momento."
              : "Sua sessao permanece ativa, mas esta organizacao nao pode operar no momento."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-relaxed">{reason}</p>
          <p className="text-muted-foreground text-xs">
            {allOrganizationsBlocked
              ? "Como nao ha organizacoes disponiveis, faca logout e fale com o suporte da plataforma."
              : "Se voce acredita que isso foi um erro, fale com o suporte da plataforma."}
          </p>
          <SignOutForm />
        </CardContent>
      </Card>
    </main>
  );
}
