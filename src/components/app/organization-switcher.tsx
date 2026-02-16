"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2Icon,
  CheckIcon,
  ChevronsUpDownIcon,
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
import { Badge } from "@/components/ui/badge";
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
  planCode: "FREE" | "STARTER_50" | "PRO_100" | "SCALE_400";
  planName: string;
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
    planCode?: "FREE" | "STARTER_50" | "PRO_100" | "SCALE_400";
    planName?: string;
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
    planCode: organization.planCode ?? "FREE",
    planName: organization.planName ?? "Gratuito",
    isPremium: organization.isPremium ?? false,
  }));
}

function planBadgeLabel(planCode: OrganizationSwitcherItem["planCode"]): string {
  if (planCode === "STARTER_50") {
    return "Starter";
  }

  if (planCode === "PRO_100") {
    return "Pro";
  }

  if (planCode === "SCALE_400") {
    return "Scale";
  }

  return "Gratis";
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

function normalizeOrganizationLogo(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized || null;
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
  const [failedOrganizationLogos, setFailedOrganizationLogos] = useState<Record<string, true>>({});
  const [organizationLogoOverrides, setOrganizationLogoOverrides] = useState<Record<string, string>>({});
  const [leaveState, leaveAction] = useActionState(
    leaveOrganizationSafelyAction,
    initialOrganizationUserActionState,
  );

  const listOrganizationsQuery = authClient.useListOrganizations();
  const activeOrganizationQuery = authClient.useActiveOrganization();
  const activeMemberQuery = authClient.useActiveMember();
  const sessionQuery = authClient.useSession();
  const billingByOrganizationId = useMemo(
    () =>
      new Map(
        initialOrganizations.map((organization) => [
          organization.id,
          {
            planCode: organization.planCode,
            planName: organization.planName,
            isPremium: organization.isPremium,
          },
        ]),
      ),
    [initialOrganizations],
  );

  const organizations = useMemo(() => {
    const sourceOrganizations =
      listOrganizationsQuery.data && listOrganizationsQuery.data.length > 0
        ? toOrganizationItems(listOrganizationsQuery.data)
        : initialOrganizations;

    return sourceOrganizations.map((organization) => ({
      ...organization,
      logo: organizationLogoOverrides[organization.id] ?? organization.logo,
      planCode:
        billingByOrganizationId.get(organization.id)?.planCode ?? organization.planCode,
      planName:
        billingByOrganizationId.get(organization.id)?.planName ?? organization.planName,
      isPremium:
        billingByOrganizationId.get(organization.id)?.isPremium ?? organization.isPremium,
    }));
  }, [billingByOrganizationId, initialOrganizations, listOrganizationsQuery.data, organizationLogoOverrides]);

  const resolvedActiveOrganizationId =
    activeOrganizationQuery.data?.id ??
    activeOrganizationId ??
    organizations[0]?.id ??
    null;
  const activeOrganizationFromList =
    organizations.find((organization) => organization.id === resolvedActiveOrganizationId) ?? null;
  const activeOrganizationFromQuery =
    activeOrganizationQuery.data?.id === resolvedActiveOrganizationId
      ? activeOrganizationQuery.data
      : null;
  const overriddenActiveOrganizationLogo =
    resolvedActiveOrganizationId !== null
      ? organizationLogoOverrides[resolvedActiveOrganizationId] ?? null
      : null;

  const activeOrganizationName =
    activeOrganizationFromQuery?.name ??
    activeOrganizationFromList?.name ??
    fallbackOrganizationName ??
    "Espaco de trabalho";
  const activeOrganizationSlug =
    activeOrganizationFromQuery?.slug ??
    activeOrganizationFromList?.slug ??
    null;
  const activeOrganizationLogo =
    overriddenActiveOrganizationLogo ??
    activeOrganizationFromQuery?.logo ??
    activeOrganizationFromList?.logo ??
    activeOrganizationQuery.data?.logo ??
    null;
  const activeOrganizationPlanCode = activeOrganizationFromList?.planCode ?? "FREE";
  const activeOrganizationPlanName = activeOrganizationFromList?.planName ?? "Gratuito";

  const activeMemberRole = activeMemberQuery.data?.role ?? "";
  const isOwner = hasOrganizationRole(activeMemberRole, "owner");
  const isAdmin = isOrganizationAdminRole(role) || hasOrganizationRole(activeMemberRole, "admin") || isOwner;
  const currentUserId = sessionQuery.data?.user.id ?? activeMemberQuery.data?.userId ?? null;
  const normalizedActiveOrganizationLogo = normalizeOrganizationLogo(activeOrganizationLogo);
  const showActiveOrganizationLogo =
    normalizedActiveOrganizationLogo !== null &&
    !failedOrganizationLogos[normalizedActiveOrganizationLogo];

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
        toast.error(localizeAuthErrorMessage(result.error.message ?? "Nao foi possivel trocar a organizacao ativa."));
        return;
      }

      toast.success(`Organizacao ativa: ${organizationName}.`);
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

  function markOrganizationLogoAsFailed(logo: string): void {
    setFailedOrganizationLogos((current) => {
      if (current[logo]) {
        return current;
      }

      return {
        ...current,
        [logo]: true,
      };
    });
  }

  function handleOrganizationLogoUpdated(logoUrl: string): void {
    const organizationId = resolvedActiveOrganizationId;
    if (!organizationId) {
      return;
    }

    setOrganizationLogoOverrides((current) => {
      if (current[organizationId] === logoUrl) {
        return current;
      }

      return {
        ...current,
        [organizationId]: logoUrl,
      };
    });

    setFailedOrganizationLogos((current) => {
      if (!current[logoUrl]) {
        return current;
      }

      const next = { ...current };
      delete next[logoUrl];
      return next;
    });

    for (const query of [listOrganizationsQuery, activeOrganizationQuery, activeMemberQuery, sessionQuery]) {
      const candidate = query as { refetch?: () => Promise<unknown> | unknown };
      void candidate.refetch?.();
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            size="lg"
            className="group-data-[collapsible=icon]:justify-center"
            tooltip="Trocar organizacao"
            disabled={isSwitchingOrganization}
          >
            <div className="bg-sidebar-primary text-sidebar-primary-foreground flex size-8 items-center justify-center overflow-hidden rounded-md">
              {showActiveOrganizationLogo && normalizedActiveOrganizationLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={normalizedActiveOrganizationLogo}
                  alt={`Logo de ${activeOrganizationName}`}
                  className="size-full object-cover"
                  onError={() => {
                    markOrganizationLogoAsFailed(normalizedActiveOrganizationLogo);
                  }}
                />
              ) : (
                <Building2Icon className="size-4" />
              )}
            </div>

            <div className="grid flex-1 text-left text-xs leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate font-semibold">Organizacoes</span>
              <span className="text-muted-foreground flex items-center gap-1 truncate text-[0.7rem]">
                <span className="truncate">{activeOrganizationName}</span>
                <Badge variant="outline" className="h-4 px-1.5 text-[0.6rem] font-medium">
                  {planBadgeLabel(activeOrganizationPlanCode)}
                </Badge>
              </span>
            </div>

            <ChevronsUpDownIcon className="text-muted-foreground size-3.5 shrink-0 group-data-[collapsible=icon]:hidden" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Trocar organizacao</DropdownMenuLabel>

          {organizations.length === 0 ? (
            <DropdownMenuItem disabled>Nenhuma organizacao encontrada.</DropdownMenuItem>
          ) : (
            organizations.map((organization) => {
              const normalizedOrganizationLogo = normalizeOrganizationLogo(organization.logo);
              const showOrganizationLogo =
                normalizedOrganizationLogo !== null &&
                !failedOrganizationLogos[normalizedOrganizationLogo];

              return (
                <DropdownMenuItem
                  key={organization.id}
                  onSelect={() => {
                    switchOrganization(organization.id, organization.name);
                  }}
                  disabled={isSwitchingOrganization}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="bg-muted text-muted-foreground flex size-5 items-center justify-center overflow-hidden rounded-sm border">
                      {showOrganizationLogo && normalizedOrganizationLogo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={normalizedOrganizationLogo}
                          alt={`Logo de ${organization.name}`}
                          className="size-full object-cover"
                          onError={() => {
                            markOrganizationLogoAsFailed(normalizedOrganizationLogo);
                          }}
                        />
                      ) : (
                        <Building2Icon className="size-3" />
                      )}
                    </span>
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate">{organization.name}</span>
                      <Badge variant="outline" className="h-4 px-1.5 text-[0.6rem] font-medium">
                        {planBadgeLabel(organization.planCode)}
                      </Badge>
                    </span>
                  </span>
                  {organization.id === resolvedActiveOrganizationId ? (
                    <CheckIcon className="ml-auto size-3.5" />
                  ) : null}
                </DropdownMenuItem>
              );
            })
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
              Criar nova organizacao
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <OrganizationManagementDialog
        open={isManagementOpen}
        onOpenChange={setIsManagementOpen}
        onOrganizationLogoUpdated={handleOrganizationLogoUpdated}
        organizationName={activeOrganizationName}
        organizationSlug={activeOrganizationSlug}
        organizationLogo={activeOrganizationLogo}
        planCode={activeOrganizationPlanCode}
        planName={activeOrganizationPlanName}
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
