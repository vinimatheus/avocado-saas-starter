import { z } from "zod";

export const scannerApiKeyCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Nome deve ter ao menos 3 caracteres.")
    .max(80, "Nome deve ter no maximo 80 caracteres."),
});

export type ScannerApiKeyCreateValues = z.infer<typeof scannerApiKeyCreateSchema>;

