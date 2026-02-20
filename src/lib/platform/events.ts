import { PlatformEventSeverity, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

export type PlatformEventInput = {
  source: string;
  action: string;
  severity?: PlatformEventSeverity;
  actorUserId?: string | null;
  actorAdminId?: string | null;
  organizationId?: string | null;
  targetType: string;
  targetId: string;
  metadata?: Prisma.InputJsonValue | null;
};

function normalizeNullableId(value: string | null | undefined): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

function normalizeValue(value: string): string {
  return value.trim();
}

export async function logPlatformEvent(input: PlatformEventInput): Promise<void> {
  const source = normalizeValue(input.source);
  const action = normalizeValue(input.action);
  const targetType = normalizeValue(input.targetType);
  const targetId = normalizeValue(input.targetId);

  if (!source || !action || !targetType || !targetId) {
    return;
  }

  try {
    await prisma.platformEventLog.create({
      data: {
        source,
        action,
        severity: input.severity ?? PlatformEventSeverity.INFO,
        actorUserId: normalizeNullableId(input.actorUserId),
        actorAdminId: normalizeNullableId(input.actorAdminId),
        organizationId: normalizeNullableId(input.organizationId),
        targetType,
        targetId,
        metadata: input.metadata ?? undefined,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2021" || error.code === "P2022")
    ) {
      return;
    }

    console.error("Falha ao registrar evento de plataforma.", error);
  }
}
