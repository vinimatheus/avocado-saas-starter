"use client";

import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      richColors
      closeButton
      expand
      offset={16}
      gap={10}
      visibleToasts={5}
      toastOptions={{
        duration: 4200,
        classNames: {
          toast:
            "rounded-xl border border-border/70 bg-card/95 text-card-foreground shadow-lg backdrop-blur-sm",
          title: "text-sm font-semibold tracking-tight",
          description: "text-xs text-muted-foreground",
          actionButton: "bg-primary text-primary-foreground hover:bg-primary/90",
          cancelButton: "bg-secondary text-secondary-foreground hover:bg-secondary/90",
        },
      }}
    />
  );
}
