"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { MapPinnedIcon, PencilIcon, PlusIcon } from "lucide-react";
import { useForm } from "react-hook-form";

import { initialInventoryActionState } from "@/actions/inventory-action-state";
import { upsertLocationAction } from "@/actions/location-actions";
import { FormFeedback } from "@/components/inventory/form-feedback";
import { FormSubmitButton } from "@/components/inventory/form-submit-button";
import { Button } from "@/components/ui/button";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { appendStringField } from "@/lib/form-data";
import { locationFormSchema, type LocationFormValues } from "@/lib/inventory-form-schemas";
import { stripFieldRef } from "@/lib/rhf";

type LocationSheetProps = {
  mode: "create" | "edit";
  triggerLabel: string;
  defaultValues?: {
    code: string;
    name: string | null;
    zone: string | null;
  };
  triggerVariant?: React.ComponentProps<typeof Button>["variant"];
  triggerSize?: React.ComponentProps<typeof Button>["size"];
  iconOnly?: boolean;
};

function getDefaultValues(
  mode: LocationSheetProps["mode"],
  defaultValues?: LocationSheetProps["defaultValues"],
): LocationFormValues {
  if (mode === "edit" && defaultValues) {
    return {
      code: defaultValues.code,
      name: defaultValues.name ?? "",
      zone: defaultValues.zone ?? "",
    };
  }

  return {
    code: "",
    name: "",
    zone: "",
  };
}

export function LocationSheet({
  mode,
  triggerLabel,
  defaultValues,
  triggerVariant = "default",
  triggerSize = "default",
  iconOnly = false,
}: LocationSheetProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [state, formAction] = useActionState(
    upsertLocationAction,
    initialInventoryActionState,
  );

  const form = useForm<LocationFormValues>({
    resolver: zodResolver(locationFormSchema),
    defaultValues: getDefaultValues(mode, defaultValues),
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    form.reset(getDefaultValues(mode, defaultValues));
  }, [defaultValues, form, mode, open]);

  const title = mode === "create" ? "Nova Localizacao" : "Editar Localizacao";
  const description =
    mode === "create"
      ? "Cadastre uma nova localizacao de estoque."
      : "Atualize os dados da localizacao selecionada.";

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
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
      }}
    >
      <SheetTrigger asChild>
        <Button variant={triggerVariant} size={triggerSize}>
          {mode === "create" ? (
            <PlusIcon data-icon={iconOnly ? undefined : "inline-start"} />
          ) : (
            <PencilIcon data-icon={iconOnly ? undefined : "inline-start"} />
          )}
          {iconOnly ? <span className="sr-only">{triggerLabel}</span> : triggerLabel}
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="data-[side=right]:w-full data-[side=right]:sm:w-[50vw] data-[side=right]:sm:max-w-[50vw]"
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={onSubmit} className="mt-4 space-y-4 px-6 pb-6">
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
                          readOnly={mode === "edit"}
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
                {mode === "create" ? "Criar localizacao" : "Salvar alteracoes"}
              </FormSubmitButton>
              <FormFeedback state={state} />
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
