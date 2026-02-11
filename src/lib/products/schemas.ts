import { z } from "zod";

export const PRODUCT_STATUS_OPTIONS = ["active", "draft", "archived"] as const;
export const PRODUCT_CATEGORY_OPTIONS = [
  "Assinatura",
  "Hardware",
  "Servicos",
  "Marketing",
  "Educacao",
  "Financeiro",
] as const;

export const productStatusSchema = z.enum(PRODUCT_STATUS_OPTIONS);
export const productCategorySchema = z.enum(PRODUCT_CATEGORY_OPTIONS);

const productNameSchema = z
  .string()
  .trim()
  .min(2, "Nome do produto deve ter ao menos 2 caracteres.")
  .max(120, "Nome do produto deve ter no maximo 120 caracteres.");

const productSkuSchema = z
  .string()
  .trim()
  .min(3, "SKU deve ter ao menos 3 caracteres.")
  .max(40, "SKU deve ter no maximo 40 caracteres.")
  .regex(/^[A-Za-z0-9_-]+$/, "SKU aceita apenas letras, numeros, hifen e underline.");

const productPriceSchema = z
  .number()
  .refine((value) => Number.isFinite(value), "Preco invalido.")
  .min(0, "Preco nao pode ser negativo.")
  .max(1_000_000, "Preco deve ser menor que 1.000.000.");

const productStockSchema = z
  .number()
  .refine((value) => Number.isFinite(value), "Estoque invalido.")
  .int("Estoque deve ser inteiro.")
  .min(0, "Estoque nao pode ser negativo.")
  .max(1_000_000, "Estoque deve ser menor que 1.000.000.");

export const productCreateSchema = z.object({
  name: productNameSchema,
  sku: productSkuSchema,
  category: productCategorySchema,
  status: productStatusSchema,
  price: productPriceSchema,
  stock: productStockSchema,
});

export const productUpdateSchema = productCreateSchema.extend({
  productId: z.string().trim().min(1, "Produto nao informado."),
});

export const productDeleteSchema = z.object({
  productId: z.string().trim().min(1, "Produto nao informado."),
});

export const productBulkStatusSchema = z.object({
  productIds: z.array(z.string().trim().min(1)).min(1, "Selecione ao menos um produto."),
  status: productStatusSchema,
});

export const productBulkDeleteSchema = z.object({
  productIds: z.array(z.string().trim().min(1)).min(1, "Selecione ao menos um produto."),
});

export type ProductStatus = z.infer<typeof productStatusSchema>;
export type ProductCategory = z.infer<typeof productCategorySchema>;
export type ProductCreateValues = z.infer<typeof productCreateSchema>;
export type ProductUpdateValues = z.infer<typeof productUpdateSchema>;
