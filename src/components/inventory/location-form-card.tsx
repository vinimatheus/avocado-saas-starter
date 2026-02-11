"use client";

import { useActionState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { MapPinnedIcon } from "lucide-react";
import { useForm } from "react-hook-form";

import { initialInventoryActionState } from "@/actions/inventory-action-state";
import { upsertLocationAction } from "@/actions/location-actions";
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
import { appendStringField } from "@/lib/form-data";
import { locationFormSchema, type LocationFormValues } from "@/lib/inventory-form-schemas";
import { stripFieldRef } from "@/lib/rhf";

const defaultValues: LocationFormValues = {
  code: "",
  name: "",
  zone: "",
};

export function LocationFormCard() {
  const [isPending, startTransition] = useTransition();
  const [state, formAction] = useActionState(
    upsertLocationAction,
    initialInventoryActionState,
  );

  const form = useForm<LocationFormValues>({
    resolver: zodResolver(locationFormSchema),
    defaultValues,
  });

  const onSubmit = form.handleSubmit((values) => {
    const payload = new FormData();
    appendStringField(payload, "code", values.code);
    appendStringField(payload, "name", values.name);
    appendStringField(payload, "zone", values.zone);

    startTransition(() => {
      formAction(payload);
    });
  });

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Cadastrar Localizacao</CardTitle>
        <CardDescription>Cadastre ou atualize uma localizacao de estoque.</CardDescription>
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
                            <MapPinnedIcon />
                            LOC
                          </InputGroupText>
                        </InputGroupAddon>
                        <InputGroupInput
                          {...fieldProps}
                          placeholder="LOC-10-A-32"
                          onChange={(event) =>
                            field.onChange(event.target.value.trimStart().toUpperCase())
                          }
                        />
                      </InputGroup>
                    </FormControl>
                    <FormDescription>Use o mesmo codigo do QR da localizacao.</FormDescription>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => {
                const fieldProps = stripFieldRef(field);

                return (
                  <FormItem>
                    <FormLabel>Nome</FormLabel>
                    <FormControl>
                      <Input {...fieldProps} placeholder="Rua A - Bloco 10" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            <FormField
              control={form.control}
              name="zone"
              render={({ field }) => {
                const fieldProps = stripFieldRef(field);

                return (
                  <FormItem>
                    <FormLabel>Zona</FormLabel>
                    <FormControl>
                      <Input {...fieldProps} placeholder="Separacao" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            <div className="flex flex-wrap items-center gap-2">
              <FormSubmitButton pending={isPending} pendingLabel="Salvando localizacao...">
                Salvar localizacao
              </FormSubmitButton>
              <FormFeedback state={state} />
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
