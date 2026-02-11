"use client";

import { useActionState } from "react";
import { Trash2Icon } from "lucide-react";

import { initialInventoryActionState } from "@/actions/inventory-action-state";
import { deletePalletAction } from "@/actions/pallet-actions";
import { FormFeedback } from "@/components/inventory/form-feedback";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type PalletDeleteAlertProps = {
  code: string;
};

export function PalletDeleteAlert({ code }: PalletDeleteAlertProps) {
  const [state, formAction] = useActionState(
    deletePalletAction,
    initialInventoryActionState,
  );

  return (
    <>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" size="sm">
            <Trash2Icon data-icon="inline-start" />
            Excluir
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir pallet</AlertDialogTitle>
            <AlertDialogDescription>
              Essa acao remove o pallet <strong>{code}</strong>. Nao sera possivel desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <form action={formAction}>
              <input type="hidden" name="code" value={code} />
              <AlertDialogAction type="submit" variant="destructive">
                Confirmar exclusao
              </AlertDialogAction>
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <FormFeedback state={state} showInline={false} />
    </>
  );
}
