"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { PackageIcon, PencilIcon, PlusIcon } from "lucide-react";
import { useForm } from "react-hook-form";

import { initialInventoryActionState } from "@/actions/inventory-action-state";
import { upsertPalletAction } from "@/actions/pallet-actions";
import { PALLET_STATUSES } from "@/components/inventory/constants";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { appendStringField } from "@/lib/form-data";
import { palletFormSchema, type PalletFormValues } from "@/lib/inventory-form-schemas";
import { stripFieldRef } from "@/lib/rhf";

type PalletSheetProps = {
  mode: "create" | "edit";
  triggerLabel: string;
  defaultValues?: {
    code: string;
    label: string | null;
    status: string | null;
  };
  triggerVariant?: React.ComponentProps<typeof Button>["variant"];
  triggerSize?: React.ComponentProps<typeof Button>["size"];
  iconOnly?: boolean;
};

function getDefaultValues(
  mode: PalletSheetProps["mode"],
  defaultValues?: PalletSheetProps["defaultValues"],
): PalletFormValues {
  if (mode === "edit" && defaultValues) {
    return {
      code: defaultValues.code,
      label: defaultValues.label ?? "",
      status: (defaultValues.status as PalletFormValues["status"]) ?? PALLET_STATUSES[0].value,
    };
  }

  return {
    code: "",
    label: "",
    status: PALLET_STATUSES[0].value,
  };
}

export function PalletSheet({
  mode,
  triggerLabel,
  defaultValues,
  triggerVariant = "default",
  triggerSize = "default",
  iconOnly = false,
}: PalletSheetProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [state, formAction] = useActionState(
    upsertPalletAction,
    initialInventoryActionState,
  );

  const form = useForm<PalletFormValues>({
    resolver: zodResolver(palletFormSchema),
    defaultValues: getDefaultValues(mode, defaultValues),
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    form.reset(getDefaultValues(mode, defaultValues));
  }, [defaultValues, form, mode, open]);

  const title = mode === "create" ? "Novo Pallet" : "Editar Pallet";
  const description =
    mode === "create"
      ? "Cadastre um novo pallet."
      : "Atualize os dados do pallet selecionado.";

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
                            <PackageIcon />
                            PAL
                          </InputGroupText>
                        </InputGroupAddon>
                        <InputGroupInput
                          {...fieldProps}
                          readOnly={mode === "edit"}
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
                {mode === "create" ? "Criar pallet" : "Salvar alteracoes"}
              </FormSubmitButton>
              <FormFeedback state={state} />
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
