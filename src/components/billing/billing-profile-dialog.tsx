"use client";

import { saveBillingProfileAction } from "@/actions/billing-actions";
import { BillingProfileForm } from "@/components/billing/billing-profile-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type BillingProfileDialogProps = {
  defaultName: string;
  defaultCellphone: string;
  defaultTaxId: string;
  triggerLabel?: string;
};

export function BillingProfileDialog({
  defaultName,
  defaultCellphone,
  defaultTaxId,
  triggerLabel = "Atualizar dados do plano",
}: BillingProfileDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Dados do plano</DialogTitle>
          <DialogDescription>
            Atualize os dados usados para pagamento e emissao de fatura.
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 pb-6">
          <BillingProfileForm
            action={saveBillingProfileAction}
            defaultName={defaultName}
            defaultCellphone={defaultCellphone}
            defaultTaxId={defaultTaxId}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
