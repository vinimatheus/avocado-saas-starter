"use client";

import { useMemo, useState } from "react";

import { FormSubmitButton } from "@/components/shared/form-submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/shared/utils";

type BillingProfileFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  defaultName: string;
  defaultCellphone: string;
  defaultTaxId: string;
  submitLabel?: string;
  pendingLabel?: string;
  submitDisabled?: boolean;
  submitClassName?: string;
  className?: string;
  children?: React.ReactNode;
};

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function formatPhoneMask(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  const ddd = digits.slice(0, 2);
  const middle = digits.length > 10 ? digits.slice(2, 7) : digits.slice(2, 6);
  const final = digits.length > 10 ? digits.slice(7, 11) : digits.slice(6, 10);

  if (!ddd) {
    return "";
  }

  let output = `(${ddd}`;
  if (ddd.length === 2) {
    output += ")";
  }

  if (middle) {
    output += ` ${middle}`;
  }

  if (final) {
    output += `-${final}`;
  }

  return output;
}

function formatTaxIdMask(value: string): string {
  const digits = onlyDigits(value).slice(0, 14);

  if (digits.length <= 11) {
    const a = digits.slice(0, 3);
    const b = digits.slice(3, 6);
    const c = digits.slice(6, 9);
    const d = digits.slice(9, 11);

    let output = a;
    if (b) {
      output += `.${b}`;
    }
    if (c) {
      output += `.${c}`;
    }
    if (d) {
      output += `-${d}`;
    }

    return output;
  }

  const a = digits.slice(0, 2);
  const b = digits.slice(2, 5);
  const c = digits.slice(5, 8);
  const d = digits.slice(8, 12);
  const e = digits.slice(12, 14);

  let output = a;
  if (b) {
    output += `.${b}`;
  }
  if (c) {
    output += `.${c}`;
  }
  if (d) {
    output += `/${d}`;
  }
  if (e) {
    output += `-${e}`;
  }

  return output;
}

export function BillingProfileForm({
  action,
  defaultName,
  defaultCellphone,
  defaultTaxId,
  submitLabel = "Salvar dados de cobranca",
  pendingLabel = "Salvando dados...",
  submitDisabled = false,
  submitClassName,
  className,
  children,
}: BillingProfileFormProps) {
  const initialPhone = useMemo(() => formatPhoneMask(defaultCellphone), [defaultCellphone]);
  const initialTaxId = useMemo(() => formatTaxIdMask(defaultTaxId), [defaultTaxId]);

  const [billingCellphone, setBillingCellphone] = useState(initialPhone);
  const [billingTaxId, setBillingTaxId] = useState(initialTaxId);

  return (
    <form action={action} className={cn("space-y-3", className)}>
      <div className="space-y-1">
        <Label htmlFor="billingName">Nome de faturamento</Label>
        <Input id="billingName" name="billingName" defaultValue={defaultName} required />
      </div>

      <div className="space-y-1">
        <Label htmlFor="billingCellphone">Telefone</Label>
        <Input
          id="billingCellphone"
          name="billingCellphone"
          value={billingCellphone}
          onChange={(event) => setBillingCellphone(formatPhoneMask(event.target.value))}
          placeholder="(11) 99999-9999"
          inputMode="numeric"
          autoComplete="tel"
          required
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="billingTaxId">CPF/CNPJ</Label>
        <Input
          id="billingTaxId"
          name="billingTaxId"
          value={billingTaxId}
          onChange={(event) => setBillingTaxId(formatTaxIdMask(event.target.value))}
          placeholder="000.000.000-00"
          inputMode="numeric"
          required
        />
      </div>

      {children}

      <FormSubmitButton
        className={submitClassName}
        pendingLabel={pendingLabel}
        disabled={submitDisabled}
      >
        {submitLabel}
      </FormSubmitButton>
    </form>
  );
}
