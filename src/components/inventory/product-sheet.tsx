"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { PencilIcon, PlusIcon, ScanBarcodeIcon } from "lucide-react";
import { useForm } from "react-hook-form";

import { initialInventoryActionState } from "@/actions/inventory-action-state";
import { upsertProductAction } from "@/actions/product-actions";
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
import { Textarea } from "@/components/ui/textarea";
import { appendStringField } from "@/lib/form-data";
import { productFormSchema, type ProductFormValues } from "@/lib/inventory-form-schemas";
import { stripFieldRef } from "@/lib/rhf";

type ProductSheetProps = {
  mode: "create" | "edit";
  triggerLabel: string;
  defaultValues?: {
    sku: string;
    name: string;
    description: string | null;
    category: string | null;
  };
  triggerVariant?: React.ComponentProps<typeof Button>["variant"];
  triggerSize?: React.ComponentProps<typeof Button>["size"];
  iconOnly?: boolean;
};

function getDefaultValues(
  mode: ProductSheetProps["mode"],
  defaultValues?: ProductSheetProps["defaultValues"],
): ProductFormValues {
  if (mode === "edit" && defaultValues) {
    return {
      sku: defaultValues.sku,
      name: defaultValues.name,
      description: defaultValues.description ?? "",
      category: defaultValues.category ?? "",
    };
  }

  return {
    sku: "",
    name: "",
    description: "",
    category: "",
  };
}

export function ProductSheet({
  mode,
  triggerLabel,
  defaultValues,
  triggerVariant = "default",
  triggerSize = "default",
  iconOnly = false,
}: ProductSheetProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [state, formAction] = useActionState(
    upsertProductAction,
    initialInventoryActionState,
  );

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: getDefaultValues(mode, defaultValues),
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    form.reset(getDefaultValues(mode, defaultValues));
  }, [defaultValues, form, mode, open]);

  const title = mode === "create" ? "Novo Produto" : "Editar Produto";
  const description =
    mode === "create"
      ? "Cadastre um novo produto para controle do estoque."
      : "Atualize os dados principais do produto selecionado.";

  const onSubmit = form.handleSubmit((values) => {
    const payload = new FormData();
    appendStringField(payload, "sku", values.sku);
    appendStringField(payload, "name", values.name);
    appendStringField(payload, "description", values.description);
    appendStringField(payload, "category", values.category);

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
              name="sku"
              render={({ field }) => {
                const fieldProps = stripFieldRef(field);

                return (
                  <FormItem>
                    <FormLabel>SKU</FormLabel>
                    <FormControl>
                      <InputGroup>
                        <InputGroupAddon align="inline-start">
                          <InputGroupText>
                            <ScanBarcodeIcon />
                            SKU
                          </InputGroupText>
                        </InputGroupAddon>
                        <InputGroupInput
                          {...fieldProps}
                          readOnly={mode === "edit"}
                          placeholder="SKU-000123"
                          onChange={(event) =>
                            field.onChange(event.target.value.trimStart().toUpperCase())
                          }
                        />
                      </InputGroup>
                    </FormControl>
                    <FormDescription>
                      Use o mesmo SKU do ERP para manter rastreabilidade.
                    </FormDescription>
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
                      <Input {...fieldProps} placeholder="Caixa organizadora 60L" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            <FormField
              control={form.control}
              name="category"
              render={({ field }) => {
                const fieldProps = stripFieldRef(field);

                return (
                  <FormItem>
                    <FormLabel>Categoria</FormLabel>
                    <FormControl>
                      <Input {...fieldProps} placeholder="Utilidades domesticas" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => {
                const fieldProps = stripFieldRef(field);

                return (
                  <FormItem>
                    <FormLabel>Descricao</FormLabel>
                    <FormControl>
                      <Textarea
                        {...fieldProps}
                        placeholder="Produto plastico resistente, empilhavel e com tampa."
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            <div className="flex flex-wrap items-center gap-2">
              <FormSubmitButton pending={isPending} pendingLabel="Salvando produto...">
                {mode === "create" ? "Criar produto" : "Salvar alteracoes"}
              </FormSubmitButton>
              <FormFeedback state={state} />
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
