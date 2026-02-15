"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MailIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth/client";
import { localizeAuthErrorMessage } from "@/lib/auth/error-messages";

export type UserInvitation = {
  id: string;
  organizationName: string;
  role: string;
  createdAt: string;
  expiresAt: string;
};

type InvitationNotificationMenuProps = {
  initialInvitations: UserInvitation[];
};

function formatDate(value: string): string {
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsedDate);
}

function normalizeInvitation(item: {
  id: string;
  organizationName?: string;
  organization?: {
    name?: string;
  };
  role?: string;
  createdAt?: string | Date;
  expiresAt?: string | Date;
}): UserInvitation {
  return {
    id: item.id,
    organizationName: item.organizationName ?? item.organization?.name ?? "Organizacao",
    role: item.role ?? "member",
    createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : new Date().toISOString(),
    expiresAt: item.expiresAt ? new Date(item.expiresAt).toISOString() : new Date().toISOString(),
  };
}

function normalizeRole(role: string): string {
  if (role === "owner") {
    return "Proprietario";
  }

  if (role === "admin") {
    return "Administrador";
  }

  return "Usuario";
}

export function InvitationNotificationMenu({ initialInvitations }: InvitationNotificationMenuProps) {
  const router = useRouter();
  const [invitations, setInvitations] = useState<UserInvitation[]>(initialInvitations);
  const [isLoading, setIsLoading] = useState(false);
  const [processingInvitationId, setProcessingInvitationId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function loadInvitations(): Promise<void> {
    setIsLoading(true);
    const result = await authClient.organization.listUserInvitations();

    if (result.error) {
      setIsLoading(false);
      toast.error(localizeAuthErrorMessage(result.error.message ?? "Nao foi possivel carregar convites."));
      return;
    }

    const normalized = (result.data ?? []).map((item) =>
      normalizeInvitation({
        id: item.id,
        organizationName:
          "organizationName" in item && typeof item.organizationName === "string"
            ? item.organizationName
            : undefined,
        organization:
          "organization" in item && item.organization && typeof item.organization === "object"
            ? item.organization
            : undefined,
        role: typeof item.role === "string" ? item.role : undefined,
        createdAt:
          typeof item.createdAt === "string" || item.createdAt instanceof Date
            ? item.createdAt
            : undefined,
        expiresAt:
          typeof item.expiresAt === "string" || item.expiresAt instanceof Date
            ? item.expiresAt
            : undefined,
      }),
    );

    setInvitations(normalized);
    setIsLoading(false);
  }

  const pendingInvitations = useMemo(
    () =>
      invitations
        .slice()
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    [invitations],
  );
  const pendingCount = pendingInvitations.length;

  function acceptInvitation(invitation: UserInvitation): void {
    startTransition(async () => {
      setProcessingInvitationId(invitation.id);
      const result = await authClient.organization.acceptInvitation({
        invitationId: invitation.id,
      });
      setProcessingInvitationId(null);

      if (result.error) {
        toast.error(localizeAuthErrorMessage(result.error.message ?? "Nao foi possivel aceitar o convite."));
        return;
      }

      toast.success(`Convite aceito: ${invitation.organizationName}.`);
      await loadInvitations();
      router.replace("/dashboard");
      router.refresh();
    });
  }

  function rejectInvitation(invitation: UserInvitation): void {
    startTransition(async () => {
      setProcessingInvitationId(invitation.id);
      const result = await authClient.organization.rejectInvitation({
        invitationId: invitation.id,
      });
      setProcessingInvitationId(null);

      if (result.error) {
        toast.error(localizeAuthErrorMessage(result.error.message ?? "Nao foi possivel recusar o convite."));
        return;
      }

      toast.success(`Convite recusado: ${invitation.organizationName}.`);
      await loadInvitations();
      router.refresh();
    });
  }

  return (
    <DropdownMenu
      onOpenChange={(isOpen) => {
        if (isOpen && !isPending) {
          void loadInvitations();
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="icon-sm" className="relative" aria-label="Convites">
          <MailIcon />
          {pendingCount > 0 ? (
            <span className="bg-destructive text-destructive-foreground absolute -top-1 -right-1 inline-flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none">
              {pendingCount > 9 ? "9+" : pendingCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Convites pendentes</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {isLoading ? (
          <DropdownMenuItem disabled>Carregando convites...</DropdownMenuItem>
        ) : pendingInvitations.length === 0 ? (
          <DropdownMenuItem disabled>Nenhum convite pendente.</DropdownMenuItem>
        ) : (
          pendingInvitations.map((invitation) => {
            const isProcessingThisInvitation = processingInvitationId === invitation.id;
            const isActionDisabled = isPending || isProcessingThisInvitation;

            return (
              <div key={invitation.id} className="space-y-2 px-2 py-2">
                <div className="space-y-1">
                  <p className="truncate text-xs font-semibold">{invitation.organizationName}</p>
                  <p className="text-muted-foreground text-[11px]">
                    Cargo: {normalizeRole(invitation.role)} | Expira em {formatDate(invitation.expiresAt)}
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="xs"
                    className="h-6"
                    onClick={() => acceptInvitation(invitation)}
                    disabled={isActionDisabled}
                  >
                    {isProcessingThisInvitation ? "Salvando..." : "Aceitar"}
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    className="h-6"
                    onClick={() => rejectInvitation(invitation)}
                    disabled={isActionDisabled}
                  >
                    Recusar
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
