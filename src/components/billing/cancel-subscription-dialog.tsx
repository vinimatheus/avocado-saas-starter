"use client";

import { cancelSubscriptionAction } from "@/actions/billing-actions";
import { FormSubmitButton } from "@/components/shared/form-submit-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BILLING_CANCELLATION_REASON_OPTIONS } from "@/lib/billing/cancellation";

type CancelSubscriptionDialogProps = {
  disabled?: boolean;
  currentPeriodEndLabel: string;
};

export function CancelSubscriptionDialog({
  disabled = false,
  currentPeriodEndLabel,
}: CancelSubscriptionDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="destructive" disabled={disabled}>
          Cancelar assinatura
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Confirmar cancelamento</DialogTitle>
          <DialogDescription>
            Para evitar cancelamentos acidentais, informe motivo e senha atual.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 px-6 pb-6">
          <form action={cancelSubscriptionAction} className="space-y-3">
            <input type="hidden" name="immediate" value="false" />

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="cancellationReason">Motivo do cancelamento</Label>
                <select
                  id="cancellationReason"
                  name="cancellationReason"
                  required
                  defaultValue=""
                  className="bg-input/20 dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/30 h-7 w-full rounded-md border px-2 text-sm outline-none focus-visible:ring-2 md:text-xs/relaxed"
                >
                  <option value="" disabled>
                    Selecione um motivo
                  </option>
                  {BILLING_CANCELLATION_REASON_OPTIONS.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="currentPassword">Senha atual</Label>
                <Input
                  id="currentPassword"
                  name="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="cancellationReasonNote">Detalhes (opcional)</Label>
              <Textarea
                id="cancellationReasonNote"
                name="cancellationReasonNote"
                maxLength={500}
                placeholder="Se quiser, detalhe rapidamente o motivo do cancelamento."
              />
            </div>

            <FormSubmitButton variant="destructive" pendingLabel="Processando cancelamento...">
              Confirmar cancelamento
            </FormSubmitButton>
          </form>

          <p className="text-muted-foreground text-xs">
            O cancelamento e aplicado no fim do periodo. Seu plano atual permanece ativo ate{" "}
            {currentPeriodEndLabel}.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
