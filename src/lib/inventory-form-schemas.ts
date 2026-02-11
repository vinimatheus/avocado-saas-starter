import { z } from "zod";

export const MAX_LEVELS = 6;
export const MAX_BULK_LOCATIONS = 5000;

const requiredCode = z
  .string()
  .trim()
  .min(1, "Codigo obrigatorio.")
  .max(64, "Codigo muito longo.")
  .transform((value) => value.toUpperCase());

const optionalText = (max: number) => z.string().trim().max(max, `Maximo de ${max} caracteres.`);

export const locationFormSchema = z.object({
  code: requiredCode,
  name: optionalText(120),
  zone: optionalText(80),
});

export type LocationFormValues = z.infer<typeof locationFormSchema>;

export const palletFormSchema = z.object({
  code: requiredCode,
  label: optionalText(120),
  status: z.string().trim().min(1, "Status obrigatorio.").max(40),
});

export type PalletFormValues = z.infer<typeof palletFormSchema>;

export const productFormSchema = z.object({
  sku: requiredCode,
  name: z.string().trim().min(1, "Nome obrigatorio.").max(120),
  description: optionalText(500),
  category: optionalText(80),
});

export type ProductFormValues = z.infer<typeof productFormSchema>;

export const bulkHierarchyLevelSchema = z
  .object({
    label: optionalText(40),
    digits: z.number().int().min(1, "Minimo 1 digito.").max(8, "Maximo 8 digitos."),
    start: z.number().int().min(0, "Inicio invalido."),
    end: z.number().int().min(0, "Fim invalido."),
  })
  .refine((value) => value.end >= value.start, {
    path: ["end"],
    message: "Fim nao pode ser menor que inicio.",
  });

export type BulkHierarchyLevelValues = z.infer<typeof bulkHierarchyLevelSchema>;

export const bulkLocationFormSchema = z.object({
  prefix: optionalText(20),
  separator: optionalText(8),
  zone: optionalText(80),
  baseName: optionalText(80),
  levelCount: z.number().int().min(1).max(MAX_LEVELS),
  levels: z
    .array(bulkHierarchyLevelSchema)
    .min(1, "Informe pelo menos um nivel.")
    .max(MAX_LEVELS, `Maximo de ${MAX_LEVELS} niveis.`),
});

export type BulkLocationFormValues = z.infer<typeof bulkLocationFormSchema>;
