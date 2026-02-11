"use client";

import { useActionState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { PackageIcon } from "lucide-react";
import { useForm } from "react-hook-form";

import { initialInventoryActionState } from "@/actions/inventory-action-state";
import { upsertPalletAction } from "@/actions/pallet-actions";
import { PALLET_STATUSES } from "@/components/inventory/constants";
import { FormFeedback } from "@/components/inventory/form-feedback";
import { FormSubmitButton } from "@/components/inventory/form-submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { appendStringField } from "@/lib/form-data";
import { palletFormSchema, type PalletFormValues } from "@/lib/inventory-form-schemas";
import { stripFieldRef } from "@/lib/rhf";

const defaultValues: PalletFormValues = {
  code: "",
  label: "",
  status: PALLET_STATUSES[0].value,
};

export function PalletFormCard() {
  const [isPending, startTransition] = useTransition();
  const [state, formAction] = useActionState(
    upsertPalletAction,
    initialInventoryActionState,
  );

  const form = useForm<PalletFormValues>({
    resolver: zodResolver(palletFormSchema),
    defaultValues,
  });

  const onSubmit = form.handleSubmit((values) => {
    const payload = new FormData();
    appendStringField(payload, "code", values.code);
    appendStringField(payload, "label", values.label);
    appendStringField(payload, "status", values.status);

    startTransition(() => {
      formAction(payload);
    });
  });

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Cadastrar Pallet</CardTitle>
        <CardDescription>Cadastre ou atualize informacoes do pallet.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => {
                const fieldProps = stripFieldRef(field);

                return (
                  <FormItem>
                    <FormLabel>Codigo</FormLabel>
                    <FormControl>
                      <InputGroup>
                        <InputGroupAddon align="inline-start">
                          <InputGroupText>
                            <PackageIcon />
                            PAL
                          </InputGroupText>
                        </InputGroupAddon>
                        <InputGroupInput
                          {...fieldProps}
                          placeholder="PAL-123"
                          onChange={(event) =>
                            field.onChange(event.target.value.trimStart().toUpperCase())
                          }
                        />
                      </InputGroup>
                    </FormControl>
                    <FormDescription>Use o mesmo codigo do QR do pallet.</FormDescription>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            <FormField
              control={form.control}
              name="label"
              render={({ field }) => {
                const fieldProps = stripFieldRef(field);

                return (
                  <FormItem>
                    <FormLabel>Descricao</FormLabel>
                    <FormControl>
                      <Input {...fieldProps} placeholder="Pallet madeira 120x100" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <FormControl>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione o status" />
                      </SelectTrigger>
                      <SelectContent>
                        {PALLET_STATUSES.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex flex-wrap items-center gap-2">
              <FormSubmitButton pending={isPending} pendingLabel="Salvando pallet...">
                Salvar pallet
              </FormSubmitButton>
              <FormFeedback state={state} />
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
