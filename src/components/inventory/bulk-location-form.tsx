"use client";

import { useActionState, useEffect, useMemo, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { BoxesIcon, MapPinnedIcon, SparklesIcon } from "lucide-react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";

import { initialInventoryActionState } from "@/actions/inventory-action-state";
import { createBulkLocationsAction } from "@/actions/location-actions";
import { FormFeedback } from "@/components/inventory/form-feedback";
import { FormSubmitButton } from "@/components/inventory/form-submit-button";
import { Badge } from "@/components/ui/badge";
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
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { appendStringField } from "@/lib/form-data";
import {
  bulkLocationFormSchema,
  MAX_BULK_LOCATIONS,
  MAX_LEVELS,
  type BulkHierarchyLevelValues,
  type BulkLocationFormValues,
} from "@/lib/inventory-form-schemas";
import { stripFieldRef } from "@/lib/rhf";

const INITIAL_LEVEL_COUNT = 3;

function createDefaultLevel(index: number): BulkHierarchyLevelValues {
  const defaults = ["Rua", "Modulo", "Nivel", "Posicao", "Bloco", "Lado"];

  return {
    label: defaults[index] ?? `Nivel ${index + 1}`,
    digits: 2,
    start: 1,
    end: 2,
  };
}

function parsePositiveInteger(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.floor(parsed));
}

function buildPreviewCodes(
  levels: BulkHierarchyLevelValues[],
  prefix: string,
  separator: string,
  maxItems = 8,
): string[] {
  const safeSeparator = separator.trim() === "" ? "-" : separator;
  const generated: string[] = [];

  const recurse = (index: number, codeParts: string[]) => {
    if (generated.length >= maxItems) {
      return;
    }

    if (index === levels.length) {
      const body = codeParts.join(safeSeparator);
      generated.push(prefix.trim() ? `${prefix.trim().toUpperCase()}${safeSeparator}${body}` : body);
      return;
    }

    const level = levels[index];
    const digits = parsePositiveInteger(level.digits);
    const start = parsePositiveInteger(level.start);
    const end = parsePositiveInteger(level.end);
    if (!digits || end < start) {
      return;
    }

    for (let value = start; value <= end; value += 1) {
      recurse(index + 1, [...codeParts, String(value).padStart(digits, "0")]);
      if (generated.length >= maxItems) {
        return;
      }
    }
  };

  recurse(0, []);
  return generated;
}

type BulkLocationFormProps = {
  existingLocationCount: number;
};

export function BulkLocationForm({ existingLocationCount }: BulkLocationFormProps) {
  const [isPending, startTransition] = useTransition();
  const [state, formAction] = useActionState(
    createBulkLocationsAction,
    initialInventoryActionState,
  );

  const form = useForm<BulkLocationFormValues>({
    resolver: zodResolver(bulkLocationFormSchema),
    defaultValues: {
      prefix: "LOC",
      separator: "-",
      zone: "",
      baseName: "",
      levelCount: INITIAL_LEVEL_COUNT,
      levels: Array.from({ length: INITIAL_LEVEL_COUNT }, (_, index) => createDefaultLevel(index)),
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "levels",
  });

  const levelCount = useWatch({ control: form.control, name: "levelCount" });
  const prefix = useWatch({ control: form.control, name: "prefix" });
  const separator = useWatch({ control: form.control, name: "separator" });
  const levels = useWatch({ control: form.control, name: "levels" });

  useEffect(() => {
    const sanitizedCount = Math.min(MAX_LEVELS, Math.max(1, parsePositiveInteger(levelCount)));
    if (sanitizedCount !== levelCount) {
      form.setValue("levelCount", sanitizedCount, { shouldValidate: true });
      return;
    }

    if (sanitizedCount > fields.length) {
      for (let index = fields.length; index < sanitizedCount; index += 1) {
        append(createDefaultLevel(index));
      }
      return;
    }

    if (sanitizedCount < fields.length) {
      const indicesToRemove = Array.from(
        { length: fields.length - sanitizedCount },
        (_, index) => sanitizedCount + index,
      );
      remove(indicesToRemove);
    }
  }, [append, fields.length, form, levelCount, remove]);

  const activeLevels = useMemo(() => {
    const count = Math.min(MAX_LEVELS, Math.max(1, parsePositiveInteger(levelCount)));
    return (levels ?? []).slice(0, count);
  }, [levelCount, levels]);

  const expectedTotal = useMemo(() => {
    const total = activeLevels.reduce((accumulator, level) => {
      const start = parsePositiveInteger(level.start);
      const end = parsePositiveInteger(level.end);
      if (end < start) {
        return 0;
      }

      return accumulator * (end - start + 1);
    }, 1);

    return Number.isFinite(total) ? total : 0;
  }, [activeLevels]);

  const previewCodes = useMemo(
    () => buildPreviewCodes(activeLevels, prefix ?? "", separator ?? ""),
    [activeLevels, prefix, separator],
  );

  const exceedsLimit = expectedTotal > MAX_BULK_LOCATIONS;

  const onSubmit = form.handleSubmit((values) => {
    const payload = new FormData();

    appendStringField(payload, "prefix", values.prefix);
    appendStringField(payload, "separator", values.separator);
    appendStringField(payload, "zone", values.zone);
    appendStringField(payload, "baseName", values.baseName);
    appendStringField(payload, "levelCount", values.levelCount);

    values.levels.forEach((level, index) => {
      const position = index + 1;
      appendStringField(payload, `levelLabel${position}`, level.label);
      appendStringField(payload, `levelDigits${position}`, level.digits);
      appendStringField(payload, `levelStart${position}`, level.start);
      appendStringField(payload, `levelEnd${position}`, level.end);
    });

    startTransition(() => {
      formAction(payload);
    });
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BoxesIcon />
          Cadastro Massivo de Localizacoes
        </CardTitle>
        <CardDescription>
          Defina hierarquia, digitos e intervalos por nivel para gerar localizacoes em massa.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-3">
              <FormField
                control={form.control}
                name="prefix"
                render={({ field }) => {
                  const fieldProps = stripFieldRef(field);

                  return (
                    <FormItem>
                      <FormLabel>Prefixo do codigo</FormLabel>
                      <FormControl>
                        <Input
                          {...fieldProps}
                          placeholder="LOC"
                          onChange={(event) => field.onChange(event.target.value.toUpperCase())}
                        />
                      </FormControl>
                      <FormDescription>
                        Exemplo final: <strong>LOC-01-01-01</strong>
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              <FormField
                control={form.control}
                name="separator"
                render={({ field }) => {
                  const fieldProps = stripFieldRef(field);

                  return (
                    <FormItem>
                      <FormLabel>Separador</FormLabel>
                      <FormControl>
                        <Input {...fieldProps} placeholder="-" />
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
            </div>

            <FormField
              control={form.control}
              name="baseName"
              render={({ field }) => {
                const fieldProps = stripFieldRef(field);

                return (
                  <FormItem>
                    <FormLabel>Nome base</FormLabel>
                    <FormControl>
                      <Input {...fieldProps} placeholder="Endereco" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            <Separator />

            <FormField
              control={form.control}
              name="levelCount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantidade de niveis</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      max={MAX_LEVELS}
                      value={field.value}
                      onChange={(event) => field.onChange(parsePositiveInteger(event.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-3">
              {fields.map((levelField, index) => (
                <div key={levelField.id} className="rounded-md border p-3">
                  <div className="mb-3 text-sm font-medium">Nivel {index + 1}</div>
                  <div className="grid gap-3 md:grid-cols-4">
                    <FormField
                      control={form.control}
                      name={`levels.${index}.label`}
                      render={({ field }) => {
                        const fieldProps = stripFieldRef(field);

                        return (
                          <FormItem>
                            <FormLabel>Hierarquia</FormLabel>
                            <FormControl>
                              <Input {...fieldProps} placeholder={`Nivel ${index + 1}`} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        );
                      }}
                    />

                    <FormField
                      control={form.control}
                      name={`levels.${index}.digits`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Digitos</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              max={8}
                              value={field.value}
                              onChange={(event) =>
                                field.onChange(parsePositiveInteger(event.target.value))
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`levels.${index}.start`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Inicio</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={0}
                              value={field.value}
                              onChange={(event) =>
                                field.onChange(parsePositiveInteger(event.target.value))
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`levels.${index}.end`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fim</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={0}
                              value={field.value}
                              onChange={(event) =>
                                field.onChange(parsePositiveInteger(event.target.value))
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              ))}
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">
                  <SparklesIcon data-icon="inline-start" />
                  Previsao: {expectedTotal} localizacoes
                </Badge>
                <Badge variant="outline">
                  <MapPinnedIcon data-icon="inline-start" />
                  Ja cadastradas: {existingLocationCount}
                </Badge>
                <Badge variant={exceedsLimit ? "destructive" : "outline"}>
                  Limite tecnico: {MAX_BULK_LOCATIONS}
                </Badge>
              </div>

              {previewCodes.length > 0 ? (
                <div className="rounded-md border p-3">
                  <div className="mb-2 text-sm font-medium">Preview de codigos</div>
                  <div className="flex flex-wrap gap-2">
                    {previewCodes.map((code) => (
                      <Badge key={code} variant="outline">
                        {code}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}

              {form.formState.errors.levels?.message ? (
                <p className="text-destructive text-xs font-medium">
                  {String(form.formState.errors.levels.message)}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <FormSubmitButton
                pending={isPending}
                pendingLabel="Gerando localizacoes..."
                disabled={expectedTotal <= 0 || exceedsLimit}
              >
                Gerar localizacoes em massa
              </FormSubmitButton>
              <FormFeedback state={state} />
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
