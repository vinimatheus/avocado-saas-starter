"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2Icon,
  CheckIcon,
  ChevronsUpDownIcon,
  CrownIcon,
  LogOutIcon,
  PlusIcon,
  SettingsIcon,
} from "lucide-react";
import { toast } from "sonner";

import { leaveOrganizationSafelyAction } from "@/actions/organization-governance-actions";
import { initialOrganizationUserActionState } from "@/actions/organization-user-action-state";
import { OrganizationManagementDialog } from "@/components/app/organization-management-dialog";
import { FormFeedback } from "@/components/shared/form-feedback";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth/client";
import {
  hasOrganizationRole,
  isOrganizationAdminRole,
  type OrganizationUserRole,
} from "@/lib/organization/helpers";
import { localizeAuthErrorMessage } from "@/lib/auth/error-messages";

type OrganizationSwitcherItem = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  isPremium: boolean;
};

type OrganizationSwitcherProps = {
  activeOrganizationId: string | null;
  fallbackOrganizationName?: string | null;
  organizations: OrganizationSwitcherItem[];
  role: OrganizationUserRole;
};

function toOrganizationItems(
  organizations: Array<{
    id: string;
    name: string;
    slug: string;
    logo?: string | null;
    isPremium?: boolean;
  }> | null | undefined,
): OrganizationSwitcherItem[] {
  if (!organizations || organizations.length === 0) {
    return [];
  }

  return organizations.map((organization) => ({
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    logo: organization.logo ?? null,
    isPremium: organization.isPremium ?? false,
  }));
}

function mapMemberRole(value: string): string {
  if (hasOrganizationRole(value, "owner")) {
    return "owner";
  }

  if (hasOrganizationRole(value, "admin")) {
    return "admin";
  }

  return "user";
}

function mapInvitationRole(value: string): "owner" | "admin" | "user" {
  if (hasOrganizationRole(value, "owner")) {
    return "owner";
  }

  if (hasOrganizationRole(value, "admin")) {
    return "admin";
  }

  return "user";
}

export function OrganizationSwitcher({
  activeOrganizationId,
  fallbackOrganizationName = null,
  organizations: initialOrganizations,
  role,
}: OrganizationSwitcherProps) {
  const router = useRouter();
  const [isSwitchingOrganization, startTransition] = useTransition();
  const [isManagementOpen, setIsManagementOpen] = useState(false);
  const [isLeaveDialogOpen, setIsLeaveDialogOpen] = useState(false);
  const [isLeavingPending, startLeaveTransition] = useTransition();
  const [leaveState, leaveAction] = useActionState(
    leaveOrganizationSafelyAction,
    initialOrganizationUserActionState,
  );

  const listOrganizationsQuery = authClient.useListOrganizations();
  const activeOrganizationQuery = authClient.useActiveOrganization();
  const activeMemberQuery = authClient.useActiveMember();
  const sessionQuery = authClient.useSession();
  const premiumByOrganizationId = useMemo(
    () =>
      new Map(initialOrganizations.map((organization) => [organization.id, organization.isPremium])),
    [initialOrganizations],
  );

  const organizations = useMemo(() => {
    if (listOrganizationsQuery.data && listOrganizationsQuery.data.length > 0) {
      return toOrganizationItems(listOrganizationsQuery.data).map((organization) => ({
        ...organization,
        isPremium: premiumByOrganizationId.get(organization.id) ?? organization.isPremium,
      }));
    }

    return initialOrganizations;
  }, [initialOrganizations, listOrganizationsQuery.data, premiumByOrganizationId]);

  const resolvedActiveOrganizationId =
    activeOrganizationQuery.data?.id ??
    activeOrganizationId ??
    organizations[0]?.id ??
    null;

  const activeOrganizationName =
    organizations.find((organization) => organization.id === resolvedActiveOrganizationId)?.name ??
    activeOrganizationQuery.data?.name ??
    fallbackOrganizationName ??
    "Espaco de trabalho";
  const activeOrganizationSlug =
    organizations.find((organization) => organization.id === resolvedActiveOrganizationId)?.slug ??
    activeOrganizationQuery.data?.slug ??
    null;
  const activeOrganizationLogo =
    organizations.find((organization) => organization.id === resolvedActiveOrganizationId)?.logo ??
    activeOrganizationQuery.data?.logo ??
    null;
  const activeOrganizationIsPremium =
    organizations.find((organization) => organization.id === resolvedActiveOrganizationId)?.isPremium ?? false;

  const activeMemberRole = activeMemberQuery.data?.role ?? "";
  const isOwner = hasOrganizationRole(activeMemberRole, "owner");
  const isAdmin = isOrganizationAdminRole(role) || hasOrganizationRole(activeMemberRole, "admin") || isOwner;
  const currentUserId = sessionQuery.data?.user.id ?? activeMemberQuery.data?.userId ?? null;

  const dialogMembers = useMemo(
    () =>
      (activeOrganizationQuery.data?.members ?? []).map((member) => ({
        id: member.id,
        userId: member.userId,
        name: member.user?.name?.trim() || "Sem nome",
        email: member.user?.email || "Sem e-mail",
        role: mapMemberRole(member.role),
      })),
    [activeOrganizationQuery.data?.members],
  );

  const dialogPendingInvitations = useMemo(
    () =>
      (activeOrganizationQuery.data?.invitations ?? [])
        .filter((invitation) => invitation.status === "pending")
        .map((invitation) => ({
          id: invitation.id,
          email: invitation.email,
          role: mapInvitationRole(invitation.role),
          createdAt: new Date(invitation.createdAt).toISOString(),
          expiresAt: new Date(invitation.expiresAt).toISOString(),
        })),
    [activeOrganizationQuery.data?.invitations],
  );

  useEffect(() => {
    if (!leaveState.redirectTo) {
      return;
    }

    router.replace(leaveState.redirectTo);
    router.refresh();
  }, [leaveState.redirectTo, router]);

  function switchOrganization(organizationId: string, organizationName: string): void {
    if (!organizationId || organizationId === resolvedActiveOrganizationId) {
      return;
    }

    startTransition(async () => {
      const result = await authClient.organization.setActive({
        organizationId,
      });

      if (result.error) {
        toast.error(localizeAuthErrorMessage(result.error.message ?? "Nao foi possivel trocar a empresa ativa."));
        return;
      }

      toast.success(`Empresa ativa: ${organizationName}.`);
      router.replace("/dashboard");
      router.refresh();
    });
  }

  function leaveActiveOrganization(): void {
    const organizationName = activeOrganizationName.trim();
    if (!organizationName) {
      toast.error("Nao foi possivel identificar a organizacao ativa.");
      return;
    }

    const payload = new FormData();
    payload.set("organizationName", organizationName);

    startLeaveTransition(() => {
      leaveAction(payload);
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            size="lg"
            className="group-data-[collapsible=icon]:justify-center"
            tooltip="Trocar empresa"
            disabled={isSwitchingOrganization}
          >
            <div className="bg-sidebar-primary text-sidebar-primary-foreground flex size-8 items-center justify-center rounded-md">
              <Building2Icon className="size-4" />
            </div>

            <div className="grid flex-1 text-left text-xs leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate font-semibold">Empresas</span>
              <span className="text-muted-foreground flex items-center gap-1 truncate text-[0.7rem]">
                <span className="truncate">{activeOrganizationName}</span>
                {activeOrganizationIsPremium ? (
                  <CrownIcon className="size-3 shrink-0 text-amber-500" />
                ) : null}
              </span>
            </div>

            <ChevronsUpDownIcon className="text-muted-foreground size-3.5 shrink-0 group-data-[collapsible=icon]:hidden" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Trocar empresa</DropdownMenuLabel>

          {organizations.length === 0 ? (
            <DropdownMenuItem disabled>Nenhuma empresa encontrada.</DropdownMenuItem>
          ) : (
            organizations.map((organization) => (
              <DropdownMenuItem
                key={organization.id}
                onSelect={() => {
                  switchOrganization(organization.id, organization.name);
                }}
                disabled={isSwitchingOrganization}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate">{organization.name}</span>
                  {organization.isPremium ? (
                    <CrownIcon className="size-3.5 shrink-0 text-amber-500" />
                  ) : null}
                </span>
                {organization.id === resolvedActiveOrganizationId ? (
                  <CheckIcon className="ml-auto size-3.5" />
                ) : null}
              </DropdownMenuItem>
            ))
          )}

          <DropdownMenuSeparator />

          {isAdmin ? (
            <>
              <DropdownMenuItem
                onSelect={() => {
                  setIsManagementOpen(true);
                }}
              >
                <SettingsIcon className="size-3.5" />
                Gerenciar organizacao
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                disabled={isLeavingPending}
                onSelect={() => {
                  setIsLeaveDialogOpen(true);
                }}
              >
                <LogOutIcon className="size-3.5" />
                {isLeavingPending ? "Saindo..." : "Sair da organizacao"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : null}

          <DropdownMenuItem asChild>
            <Link href="/empresa/nova" className="flex items-center gap-2">
              <PlusIcon className="size-3.5" />
              Criar nova empresa
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <OrganizationManagementDialog
        open={isManagementOpen}
        onOpenChange={setIsManagementOpen}
        organizationName={activeOrganizationName}
        organizationSlug={activeOrganizationSlug}
        organizationLogo={activeOrganizationLogo}
        currentUserId={currentUserId}
        isOwner={isOwner}
        isAdmin={isAdmin}
        members={dialogMembers}
        pendingInvitations={dialogPendingInvitations}
      />

      <AlertDialog open={isLeaveDialogOpen} onOpenChange={setIsLeaveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sair da organizacao</AlertDialogTitle>
            <AlertDialogDescription>
              Voce sera removido de <strong>{activeOrganizationName}</strong>. Se for o unico
              proprietario, sera necessario transferir a propriedade antes de sair.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={leaveActiveOrganization}
              disabled={isLeavingPending}
            >
              {isLeavingPending ? "Saindo..." : "Confirmar saida"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <FormFeedback state={leaveState} showInline={false} />
    </>
  );
}
