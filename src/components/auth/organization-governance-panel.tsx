"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { CrownIcon, LogOutIcon, ShieldAlertIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  deleteOrganizationSafelyAction,
  leaveOrganizationSafelyAction,
  transferOrganizationOwnershipAction,
} from "@/actions/organization-governance-actions";
import { initialOrganizationUserActionState } from "@/actions/organization-user-action-state";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type OrganizationGovernanceMember = {
  id: string;
  userId: string;
  name: string;
  email: string;
  isOwner: boolean;
};

type OrganizationGovernancePanelProps = {
  organizationName: string;
  currentUserId: string;
  currentUserIsOwner: boolean;
  canManageOwnership: boolean;
  members: OrganizationGovernanceMember[];
};

function memberLabel(member: OrganizationGovernanceMember): string {
  if (member.name && member.name !== "Sem nome") {
    return `${member.name} (${member.email})`;
  }

  return member.email;
}

export function OrganizationGovernancePanel({
  organizationName,
  currentUserId,
  currentUserIsOwner,
  canManageOwnership,
  members,
}: OrganizationGovernancePanelProps) {
  const router = useRouter();
  const [isTransferPending, startTransferTransition] = useTransition();
  const [isLeavePending, startLeaveTransition] = useTransition();
  const [isDeletePending, startDeleteTransition] = useTransition();

  const [transferTargetMemberId, setTransferTargetMemberId] = useState<string>("");
  const [leaveConfirmationName, setLeaveConfirmationName] = useState("");
  const [deleteConfirmationName, setDeleteConfirmationName] = useState("");

  const [transferState, transferAction] = useActionState(
    transferOrganizationOwnershipAction,
    initialOrganizationUserActionState,
  );
  const [leaveState, leaveAction] = useActionState(
    leaveOrganizationSafelyAction,
    initialOrganizationUserActionState,
  );
  const [deleteState, deleteAction] = useActionState(
    deleteOrganizationSafelyAction,
    initialOrganizationUserActionState,
  );

  const transferCandidates = useMemo(
    () => members.filter((member) => member.userId !== currentUserId),
    [currentUserId, members],
  );
  const resolvedTransferTargetMemberId = useMemo(() => {
    if (transferCandidates.some((member) => member.id === transferTargetMemberId)) {
      return transferTargetMemberId;
    }

    return transferCandidates[0]?.id ?? "";
  }, [transferCandidates, transferTargetMemberId]);
  const ownerCount = useMemo(
    () => members.filter((member) => member.isOwner).length,
    [members],
  );
  const isOnlyOwner = currentUserIsOwner && ownerCount <= 1;
  const canLeaveOrganization = !isOnlyOwner;

  useEffect(() => {
    const redirectTo = transferState.redirectTo ?? leaveState.redirectTo ?? deleteState.redirectTo;

    if (redirectTo) {
      router.replace(redirectTo);
      router.refresh();
      return;
    }

    if (
      transferState.status === "success" ||
      leaveState.status === "success" ||
      deleteState.status === "success"
    ) {
      router.refresh();
    }
  }, [
    deleteState.redirectTo,
    deleteState.status,
    leaveState.redirectTo,
    leaveState.status,
    router,
    transferState.redirectTo,
    transferState.status,
  ]);

  function submitOwnershipTransfer(): void {
    if (!resolvedTransferTargetMemberId) {
      return;
    }

    const payload = new FormData();
    payload.set("targetMemberId", resolvedTransferTargetMemberId);

    startTransferTransition(() => {
      transferAction(payload);
    });
  }

  function submitLeaveOrganization(): void {
    const payload = new FormData();
    payload.set("organizationName", leaveConfirmationName);

    startLeaveTransition(() => {
      leaveAction(payload);
    });
  }

  function submitDeleteOrganization(): void {
    const payload = new FormData();
    payload.set("organizationName", deleteConfirmationName);

    startDeleteTransition(() => {
      deleteAction(payload);
    });
  }

  return (
    <Card className="border-destructive/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlertIcon className="size-4" />
          Governanca da empresa
        </CardTitle>
        <CardDescription>
          Operacoes sensiveis de propriedade e ciclo de vida da organizacao.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <section className="space-y-3 rounded-md border p-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold">Transferir propriedade</p>
            <p className="text-muted-foreground text-xs">
              Move o papel de proprietario para outro membro e reduz seu acesso atual.
            </p>
          </div>

          {!canManageOwnership ? (
            <p className="text-muted-foreground text-xs">
              Somente o proprietario atual pode transferir propriedade.
            </p>
          ) : transferCandidates.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              Convide ao menos mais um membro para transferir propriedade.
            </p>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                className="border-input bg-background h-9 flex-1 rounded-md border px-3 text-sm"
                value={resolvedTransferTargetMemberId}
                onChange={(event) => {
                  setTransferTargetMemberId(event.target.value);
                }}
                disabled={isTransferPending}
              >
                {transferCandidates.map((member) => (
                  <option key={member.id} value={member.id}>
                    {memberLabel(member)}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                onClick={submitOwnershipTransfer}
                disabled={isTransferPending || !resolvedTransferTargetMemberId}
              >
                <CrownIcon data-icon="inline-start" />
                {isTransferPending ? "Transferindo..." : "Transferir propriedade"}
              </Button>
            </div>
          )}
        </section>

        <section className="space-y-3 rounded-md border p-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold">Sair da organizacao</p>
            <p className="text-muted-foreground text-xs">
              Digite <strong>{organizationName}</strong> para confirmar.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={leaveConfirmationName}
              onChange={(event) => {
                setLeaveConfirmationName(event.target.value);
              }}
              placeholder={organizationName}
            />
            <Button
              type="button"
              variant="outline"
              onClick={submitLeaveOrganization}
              disabled={
                isLeavePending ||
                leaveConfirmationName.trim() !== organizationName ||
                !canLeaveOrganization
              }
            >
              <LogOutIcon data-icon="inline-start" />
              {isLeavePending ? "Saindo..." : "Sair da organizacao"}
            </Button>
          </div>

          {!canLeaveOrganization ? (
            <p className="text-destructive text-xs">
              Voce e o unico proprietario. Transfira a propriedade antes de sair.
            </p>
          ) : null}
        </section>

        <section className="border-destructive/30 bg-destructive/5 space-y-3 rounded-md border p-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold">Excluir organizacao</p>
            <p className="text-muted-foreground text-xs">
              Esta acao remove dados, membros e convites desta empresa de forma permanente.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={deleteConfirmationName}
              onChange={(event) => {
                setDeleteConfirmationName(event.target.value);
              }}
              placeholder={organizationName}
            />
            <Button
              type="button"
              variant="destructive"
              onClick={submitDeleteOrganization}
              disabled={
                isDeletePending ||
                deleteConfirmationName.trim() !== organizationName ||
                !canManageOwnership
              }
            >
              <Trash2Icon data-icon="inline-start" />
              {isDeletePending ? "Excluindo..." : "Excluir organizacao"}
            </Button>
          </div>

          {!canManageOwnership ? (
            <p className="text-destructive text-xs">
              Apenas o proprietario atual pode excluir a organizacao.
            </p>
          ) : null}
        </section>

        <div className="flex flex-wrap gap-2">
          <FormFeedback state={transferState} showInline={false} />
          <FormFeedback state={leaveState} showInline={false} />
          <FormFeedback state={deleteState} showInline={false} />
        </div>
      </CardContent>
    </Card>
  );
}
