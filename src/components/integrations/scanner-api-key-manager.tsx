"use client";

import { useActionState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRoundIcon, ShieldCheckIcon, ShieldXIcon } from "lucide-react";
import { useForm } from "react-hook-form";

import {
  createScannerApiKeyAction,
  revokeScannerApiKeyAction,
} from "@/actions/scanner-api-key-actions";
import { initialScannerApiKeyActionState } from "@/actions/scanner-api-key-action-state";
import { FormFeedback } from "@/components/inventory/form-feedback";
import { FormSubmitButton } from "@/components/inventory/form-submit-button";
import { Badge } from "@/components/ui/badge";
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
import {
  scannerApiKeyCreateSchema,
  type ScannerApiKeyCreateValues,
} from "@/lib/scanner-api-key-schemas";
import { stripFieldRef } from "@/lib/rhf";

type ScannerApiKeyListItem = {
  id: string;
  name: string;
  keyPrefix: string;
  isActive: boolean;
  createdAt: string;
  lastUsedAt: string | null;
};

type ScannerApiKeyManagerProps = {
  keys: ScannerApiKeyListItem[];
};

const defaultValues: ScannerApiKeyCreateValues = {
  name: "",
};

function formatDate(value: string | null) {
  if (!value) {
    return "Nunca";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function ScannerApiKeyManager({ keys }: ScannerApiKeyManagerProps) {
  const [isPending, startTransition] = useTransition();
  const [createState, createAction] = useActionState(
    createScannerApiKeyAction,
    initialScannerApiKeyActionState,
  );
  const [revokeState, revokeAction] = useActionState(
    revokeScannerApiKeyAction,
    initialScannerApiKeyActionState,
  );

  const form = useForm<ScannerApiKeyCreateValues>({
    resolver: zodResolver(scannerApiKeyCreateSchema),
    defaultValues,
  });

  const onSubmit = form.handleSubmit((values) => {
    const payload = new FormData();
    payload.set("name", values.name);

    startTransition(() => {
      createAction(payload);
    });
  });

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRoundIcon />
            Nova Chave do Scanner
          </CardTitle>
          <CardDescription>
            Gere uma chave para autenticar o app Python antes de iniciar leitura.
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
                      <FormLabel>Nome da chave</FormLabel>
                      <FormControl>
                        <Input {...fieldProps} placeholder="Scanner loja A" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              <FormSubmitButton pending={isPending} pendingLabel="Gerando chave...">
                Gerar chave
              </FormSubmitButton>
            </form>
          </Form>

          <FormFeedback state={createState} />

          {createState.plainApiKey ? (
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-sm font-medium">Copie agora e guarde com seguranca:</p>
              <code className="bg-muted block overflow-x-auto rounded px-2 py-1 text-xs">
                {createState.plainApiKey}
              </code>
            </div>
          ) : null}

          <FormFeedback state={revokeState} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Chaves cadastradas</CardTitle>
          <CardDescription>Exclua imediatamente chaves comprometidas.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {keys.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhuma chave criada ainda.</p>
          ) : (
            keys.map((key) => (
              <div
                key={key.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{key.name}</span>
                    {key.isActive ? (
                      <Badge variant="secondary">
                        <ShieldCheckIcon data-icon="inline-start" />
                        Ativa
                      </Badge>
                    ) : (
                      <Badge variant="destructive">
                        <ShieldXIcon data-icon="inline-start" />
                        Revogada
                      </Badge>
                    )}
                  </div>
                  <code className="text-muted-foreground text-xs">{key.keyPrefix}...</code>
                  <p className="text-muted-foreground text-xs">
                    Criada: {formatDate(key.createdAt)} | Ultimo uso: {formatDate(key.lastUsedAt)}
                  </p>
                </div>

                <form action={revokeAction}>
                  <input type="hidden" name="id" value={key.id} />
                  <Button type="submit" variant="destructive" size="sm">
                    Excluir
                  </Button>
                </form>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
