"use client";

import { useEffect } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";

type FormFeedbackState = {
  status: "idle" | "success" | "error";
  message: string;
};

type FormFeedbackProps = {
  state: FormFeedbackState;
  showInline?: boolean;
};

export function FormFeedback({ state, showInline = true }: FormFeedbackProps) {
  useEffect(() => {
    if (state.status === "idle" || !state.message) {
      return;
    }

    if (state.status === "success") {
      toast.success(state.message);
      return;
    }

    toast.error(state.message);
  }, [state]);

  if (!showInline) {
    return null;
  }

  if (state.status === "idle" || !state.message) {
    return null;
  }

  return (
    <Badge variant={state.status === "success" ? "secondary" : "destructive"}>
      {state.message}
    </Badge>
  );
}
