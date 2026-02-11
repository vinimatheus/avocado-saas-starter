"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  acceptOrganizationInvitationAction,
  rejectOrganizationInvitationAction,
} from "@/actions/organization-user-actions";
import { initialOrganizationUserActionState } from "@/actions/organization-user-action-state";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";

type InvitationResponsePanelProps = {
  invitationId: string;
};

export function InvitationResponsePanel({ invitationId }: InvitationResponsePanelProps) {
  const router = useRouter();
  const [acceptState, acceptAction] = useActionState(
    acceptOrganizationInvitationAction,
    initialOrganizationUserActionState,
  );
  const [rejectState, rejectAction] = useActionState(
    rejectOrganizationInvitationAction,
    initialOrganizationUserActionState,
  );

  useEffect(() => {
    const redirectTo = acceptState.redirectTo ?? rejectState.redirectTo;
    if (!redirectTo) {
      return;
    }

    router.replace(redirectTo);
    router.refresh();
  }, [acceptState.redirectTo, rejectState.redirectTo, router]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <form action={acceptAction}>
          <input type="hidden" name="invitationId" value={invitationId} />
          <Button type="submit">Aceitar convite</Button>
        </form>

        <form action={rejectAction}>
          <input type="hidden" name="invitationId" value={invitationId} />
          <Button type="submit" variant="outline">
            Recusar convite
          </Button>
        </form>
      </div>

      <FormFeedback state={acceptState} />
      <FormFeedback state={rejectState} />
    </div>
  );
}
