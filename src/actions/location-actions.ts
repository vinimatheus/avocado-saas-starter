"use server";

import type { InventoryActionState } from "@/actions/inventory-action-state";
import { runAdminInventoryMutation } from "@/actions/inventory-action-helpers";
import { assertRequired, normalizeCode, normalizeText } from "@/lib/inventory-repository";
import { prisma } from "@/lib/prisma";

const MAX_BULK_LOCATIONS = 5000;

type BulkHierarchyLevel = {
  label: string | null;
  digits: number;
  start: number;
  end: number;
};

function parseIntegerField(value: FormDataEntryValue | null, fieldName: string): number {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Campo numerico invalido: ${fieldName}`);
  }

  return parsed;
}

function parseBulkHierarchy(formData: FormData): BulkHierarchyLevel[] {
  const levelCount = parseIntegerField(formData.get("levelCount"), "Quantidade de niveis");
  if (levelCount < 1 || levelCount > 6) {
    throw new Error("Quantidade de niveis deve estar entre 1 e 6.");
  }

  const levels: BulkHierarchyLevel[] = [];

  for (let index = 1; index <= levelCount; index += 1) {
    const label = normalizeText(formData.get(`levelLabel${index}`));
    const digits = parseIntegerField(formData.get(`levelDigits${index}`), `Digitos do nivel ${index}`);
    const start = parseIntegerField(formData.get(`levelStart${index}`), `Inicio do nivel ${index}`);
    const end = parseIntegerField(formData.get(`levelEnd${index}`), `Fim do nivel ${index}`);

    if (digits < 1 || digits > 8) {
      throw new Error(`Nivel ${index}: quantidade de digitos deve ser entre 1 e 8.`);
    }

    if (start < 0 || end < 0) {
      throw new Error(`Nivel ${index}: inicio e fim devem ser maiores ou iguais a zero.`);
    }

    if (end < start) {
      throw new Error(`Nivel ${index}: fim nao pode ser menor que inicio.`);
    }

    levels.push({ label, digits, start, end });
  }

  return levels;
}

function buildBulkLocationCodes(
  levels: BulkHierarchyLevel[],
  separator: string,
): { code: string; descriptor: string }[] {
  const generated: { code: string; descriptor: string }[] = [];
  const recurse = (levelIndex: number, parts: string[], descriptorParts: string[]) => {
    if (generated.length > MAX_BULK_LOCATIONS) {
      return;
    }

    if (levelIndex === levels.length) {
      generated.push({
        code: parts.join(separator),
        descriptor: descriptorParts.join(" | "),
      });
      return;
    }

    const currentLevel = levels[levelIndex];
    for (let value = currentLevel.start; value <= currentLevel.end; value += 1) {
      const padded = String(value).padStart(currentLevel.digits, "0");
      const nextParts = [...parts, padded];
      const descriptorLabel = currentLevel.label?.trim() || `Nivel ${levelIndex + 1}`;
      const nextDescriptor = [...descriptorParts, `${descriptorLabel} ${padded}`];
      recurse(levelIndex + 1, nextParts, nextDescriptor);
      if (generated.length > MAX_BULK_LOCATIONS) {
        return;
      }
    }
  };

  recurse(0, [], []);
  return generated;
}

export async function upsertLocationAction(
  _previousState: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const code = normalizeCode(formData.get("code"));
  const name = normalizeText(formData.get("name"));
  const zone = normalizeText(formData.get("zone"));

  return runAdminInventoryMutation(async (tenantContext) => {
    assertRequired(code, "Codigo da localizacao");

    await prisma.location.upsert({
      where: {
        organizationId_code: {
          organizationId: tenantContext.organizationId,
          code,
        },
      },
      update: { name, zone },
      create: {
        organizationId: tenantContext.organizationId,
        code,
        name,
        zone,
      },
    });
  }, `Localizacao ${code} salva com sucesso.`);
}

export async function deleteLocationAction(
  _previousState: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const code = normalizeCode(formData.get("code"));

  return runAdminInventoryMutation(async (tenantContext) => {
    assertRequired(code, "Codigo da localizacao");

    await prisma.location.delete({
      where: {
        organizationId_code: {
          organizationId: tenantContext.organizationId,
          code,
        },
      },
    });
  }, `Localizacao ${code} excluida com sucesso.`);
}

export async function createBulkLocationsAction(
  _previousState: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const prefix = normalizeCode(formData.get("prefix"));
  const separator = String(formData.get("separator") ?? "-").trim();
  const zone = normalizeText(formData.get("zone"));
  const baseName = normalizeText(formData.get("baseName"));
  const levels = parseBulkHierarchy(formData);

  let createdCount = 0;
  let skippedCount = 0;

  return runAdminInventoryMutation(
    async (tenantContext) => {
      const combinationsCount = levels.reduce((accumulator, level) => {
        return accumulator * (level.end - level.start + 1);
      }, 1);

      if (combinationsCount > MAX_BULK_LOCATIONS) {
        throw new Error(
          `Limite excedido: ${combinationsCount} combinacoes. Ajuste os intervalos para no maximo ${MAX_BULK_LOCATIONS}.`,
        );
      }

      const separatorOrDefault = separator === "" ? "-" : separator;
      const generatedCodes = buildBulkLocationCodes(levels, separatorOrDefault);
      if (generatedCodes.length === 0) {
        throw new Error("Nenhuma localizacao foi gerada com os parametros informados.");
      }

      const data = generatedCodes.map((item) => {
        const fullCode = prefix ? `${prefix}${separatorOrDefault}${item.code}` : item.code;
        const generatedName = baseName ? `${baseName} - ${item.descriptor}` : item.descriptor;

        return {
          organizationId: tenantContext.organizationId,
          code: fullCode,
          name: generatedName,
          zone,
        };
      });

      const result = await prisma.location.createMany({
        data,
        skipDuplicates: true,
      });

      createdCount = result.count;
      skippedCount = data.length - result.count;
    },
    () => `Cadastro massivo concluido: ${createdCount} criadas e ${skippedCount} ja existentes.`,
  );
}
