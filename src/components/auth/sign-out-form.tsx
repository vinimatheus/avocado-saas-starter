"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LogOutIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/client";

export function SignOutForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleSignOut = () => {
    startTransition(async () => {
      const result = await signOut();
      if (result.error) {
        toast.error(result.error.message ?? "Nao foi possivel encerrar a sessao.");
        return;
      }

      toast.success("Logout realizado com sucesso.");
      router.replace("/sign-in");
      router.refresh();
    });
  };

  return (
    <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={handleSignOut}>
      <LogOutIcon data-icon="inline-start" />
      {isPending ? "Saindo..." : "Sair"}
    </Button>
  );
}
