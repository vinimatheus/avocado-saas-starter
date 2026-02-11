import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { UsersIcon } from "lucide-react";

import { OrganizationUsersManager } from "@/components/auth/organization-users-manager";
import { AppPageHero } from "@/components/app/app-page-hero";
import { AppPageContainer } from "@/components/app/app-page-container";
import { StatusBanner } from "@/components/app/status-banner";
import { Card, CardContent } from "@/components/ui/card";
import { auth } from "@/lib/auth/server";
import { isOrganizationAdminRole, normalizeOrganizationRole, type OrganizationUserRole } from "@/lib/organization/helpers";
import { getTenantContext } from "@/lib/organization/tenant-context";

type MembersResult = {
  members: Array<{
    id: string;
    userId: string;
    role: string;
    createdAt: Date;
    user?: {
      name?: string | null;
      email?: string | null;
    };
  }>;
  errorMessage: string | null;
};

type InvitationsResult = {
  invitations: Array<{
    id: string;
    email: string;
    role: string;
    inviterId: string;
    status: string;
    createdAt: Date;
    expiresAt: Date;
  }>;
  errorMessage: string | null;
};

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const tenantContext = await getTenantContext();
  if (!isOrganizationAdminRole(tenantContext.role)) {
    redirect("/dashboard");
  }

  const requestHeaders = await headers();
  const [membersResult, invitationsResult] = await Promise.all([
    auth.api
      .listMembers({
        headers: requestHeaders,
        query: {
          organizationId: tenantContext.organizationId!,
          limit: 500,
        },
      })
      .then(
        (result): MembersResult => ({
          members: result.members,
          errorMessage: null,
        }),
      )
      .catch(
        (): MembersResult => ({
          members: [],
          errorMessage: "Falha ao carregar usuarios da empresa.",
        }),
      ),
    auth.api
      .listInvitations({
        headers: requestHeaders,
        query: {
          organizationId: tenantContext.organizationId!,
        },
      })
      .then(
        (invitations): InvitationsResult => ({
          invitations,
          errorMessage: null,
        }),
      )
      .catch(
        (): InvitationsResult => ({
          invitations: [],
          errorMessage: "Falha ao carregar convites pendentes.",
        }),
      ),
  ]);

  const members = [...membersResult.members]
    .sort((left, right) => {
      const leftRole = normalizeOrganizationRole(left.role);
      const rightRole = normalizeOrganizationRole(right.role);
      if (leftRole === rightRole) {
        return left.createdAt.getTime() - right.createdAt.getTime();
      }

      const rank = (role: OrganizationUserRole): number => {
        if (role === "owner") {
          return 0;
        }

        if (role === "admin") {
          return 1;
        }

        return 2;
      };

      return rank(leftRole) - rank(rightRole);
    })
    .map((member) => ({
      id: member.id,
      userId: member.userId,
      name: member.user?.name?.trim() || "Sem nome",
      email: member.user?.email || "Sem e-mail",
      role: normalizeOrganizationRole(member.role),
      createdAt: member.createdAt.toISOString(),
    }));

  const inviterLookup = new Map(
    membersResult.members.map((member) => [
      member.userId,
      {
        name: member.user?.name?.trim() || null,
        email: member.user?.email || null,
      },
    ]),
  );

  const pendingInvitations = invitationsResult.invitations
    .filter((invitation) => invitation.status === "pending")
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .map((invitation) => {
      const inviter = inviterLookup.get(invitation.inviterId);

      return {
        id: invitation.id,
        email: invitation.email,
        role: normalizeOrganizationRole(invitation.role),
        createdAt: invitation.createdAt.toISOString(),
        expiresAt: invitation.expiresAt.toISOString(),
        inviterName: inviter?.name ?? null,
        inviterEmail: inviter?.email ?? null,
      };
    });

  const errorMessages = [membersResult.errorMessage, invitationsResult.errorMessage].filter(Boolean);

  return (
    <AppPageContainer className="gap-6">
      <AppPageHero
        icon={UsersIcon}
        eyebrow="Equipe"
        title="Controle de acesso do workspace"
        description="Convide usuarios e gerencie cargos (owner, admin e usuario) com governanca clara."
        tags={[
          { label: "Gestao de acesso", variant: "secondary" },
          { label: "Equipe", variant: "outline" },
          { label: "TanStack Table", variant: "outline" },
          { label: "Sheet + RHF", variant: "outline" },
        ]}
      />

      <StatusBanner message={errorMessages.length > 0 ? errorMessages.join(" ") : null} />

      <Card>
        <CardContent className="pt-6">
          <OrganizationUsersManager
            members={members}
            pendingInvitations={pendingInvitations}
            currentUserId={tenantContext.session!.user.id}
            currentUserRole={tenantContext.role}
          />
        </CardContent>
      </Card>
    </AppPageContainer>
  );
}
