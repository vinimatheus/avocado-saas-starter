"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

type FormSubmitButtonProps = React.ComponentProps<typeof Button> & {
  pendingLabel?: string;
  pending?: boolean;
};

export function FormSubmitButton({
  children,
  pendingLabel = "Salvando...",
  pending,
  ...props
}: FormSubmitButtonProps) {
  const formStatus = useFormStatus();
  const isPending = pending ?? formStatus.pending;

  return (
    <Button type="submit" disabled={isPending} {...props}>
      {isPending ? pendingLabel : children}
    </Button>
  );
}
