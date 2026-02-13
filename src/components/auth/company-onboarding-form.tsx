"use client";

import { useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Building2Icon } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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
import { authClient } from "@/lib/auth/client";
import { localizeAuthErrorMessage } from "@/lib/auth/error-messages";
import { buildOrganizationSlug } from "@/lib/organization/helpers";
import { stripFieldRef } from "@/lib/forms/rhf";
import { getFirstValidationErrorMessage } from "@/lib/forms/validation-toast";

const companyOnboardingSchema = z.object({
  companyName: z
    .string()
    .trim()
    .min(2, "Nome da empresa deve ter ao menos 2 caracteres.")
    .max(120, "Nome da empresa deve ter no maximo 120 caracteres."),
});

type CompanyOnboardingValues = z.infer<typeof companyOnboardingSchema>;

type CompanyOnboardingFormProps = {
  userName?: string | null;
  initialCompanyName?: string;
  keepCurrentActiveOrganization?: boolean;
  mode?: "onboarding" | "create";
  redirectPath?: string;
};

export function CompanyOnboardingForm({
  userName = null,
  initialCompanyName = "",
  keepCurrentActiveOrganization = false,
  mode = "onboarding",
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
        const userEmail = sessionResult.data?.user.email ?? "conta@empresa.local";

        const organizationResult = await authClient.organization.create({
          name: values.companyName,
          slug: buildOrganizationSlug(values.companyName, userEmail),
          keepCurrentActiveOrganization,
        });

        if (organizationResult.error) {
          const message = localizeAuthErrorMessage(
            organizationResult.error.message ?? "Nao foi possivel criar a empresa.",
          );
          setServerMessage(message);
          toast.error(message);
          return;
        }

        toast.success(
          keepCurrentActiveOrganization
            ? "Empresa criada. Use o seletor do menu lateral para trocar de empresa."
            : "Empresa vinculada com sucesso.",
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
          {mode === "create" ? "Nova Empresa" : "Vincular Empresa"}
        </CardTitle>
        <CardDescription>
          {mode === "create"
            ? "Cadastre uma nova empresa para seu usuario."
            : userName
              ? `${userName}, informe a empresa para concluir o acesso.`
              : "Informe sua empresa para concluir o acesso."}
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
                    <FormLabel>Empresa</FormLabel>
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
              {isPending
                ? mode === "create"
                  ? "Criando empresa..."
                  : "Salvando empresa..."
                : mode === "create"
                  ? "Criar empresa"
                  : "Concluir"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
