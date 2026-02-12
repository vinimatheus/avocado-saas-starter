import { z } from "zod";

const nameSchema = z
  .string()
  .trim()
  .min(3, "Nome deve ter ao menos 3 caracteres.")
  .max(80, "Nome deve ter no maximo 80 caracteres.");

const companyNameSchema = z
  .string()
  .trim()
  .min(2, "Nome da empresa deve ter ao menos 2 caracteres.")
  .max(120, "Nome da empresa deve ter no maximo 120 caracteres.");

const emailSchema = z
  .string()
  .trim()
  .email("Informe um e-mail valido.")
  .max(120, "E-mail deve ter no maximo 120 caracteres.");

const passwordSchema = z
  .string()
  .min(8, "Senha deve ter no minimo 8 caracteres.")
  .max(128, "Senha deve ter no maximo 128 caracteres.");

export const signInSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const signUpSchema = z
  .object({
    name: nameSchema,
    companyName: companyNameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Confirme a senha."),
  })
  .superRefine((values, ctx) => {
    if (values.password !== values.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "As senhas nao conferem.",
      });
    }
  });

export const profileUpdateSchema = z.object({
  name: nameSchema,
});

export const profileChangeEmailSchema = z.object({
  newEmail: emailSchema,
});

export const profileChangePasswordSchema = z
  .object({
    currentPassword: passwordSchema,
    newPassword: passwordSchema,
    confirmNewPassword: z.string().min(1, "Confirme a nova senha."),
  })
  .superRefine((values, ctx) => {
    if (values.newPassword !== values.confirmNewPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmNewPassword"],
        message: "As senhas nao conferem.",
      });
    }

    if (values.currentPassword === values.newPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["newPassword"],
        message: "A nova senha deve ser diferente da senha atual.",
      });
    }
  });

export const profileSetPasswordSchema = z
  .object({
    newPassword: passwordSchema,
    confirmNewPassword: z.string().min(1, "Confirme a nova senha."),
  })
  .superRefine((values, ctx) => {
    if (values.newPassword !== values.confirmNewPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmNewPassword"],
        message: "As senhas nao conferem.",
      });
    }
  });

export type SignInValues = z.infer<typeof signInSchema>;
export type SignUpValues = z.infer<typeof signUpSchema>;
export type ProfileUpdateValues = z.infer<typeof profileUpdateSchema>;
export type ProfileChangeEmailValues = z.infer<typeof profileChangeEmailSchema>;
export type ProfileChangePasswordValues = z.infer<typeof profileChangePasswordSchema>;
export type ProfileSetPasswordValues = z.infer<typeof profileSetPasswordSchema>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Confirme a senha."),
  })
  .superRefine((values, ctx) => {
    if (values.password !== values.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "As senhas nao conferem.",
      });
    }
  });

export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
