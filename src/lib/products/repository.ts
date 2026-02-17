import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import type { ProductStatus } from "@/lib/products/schemas";

const DEFAULT_PRODUCT_SEARCH_LIMIT = 8;
const MAX_PRODUCT_SEARCH_LIMIT = 20;

export type ProductRow = {
  id: string;
  organizationId: string;
  name: string;
  sku: string;
  category: string;
  status: string;
  price: Prisma.Decimal | number | string;
  stock: number;
  createdAt: Date;
  updatedAt: Date;
};

type ProductDelegateLike = {
  findMany: (args: {
    where: { organizationId: string };
    orderBy: { updatedAt: "desc" | "asc" };
    take: number;
  }) => Promise<ProductRow[]>;
  create: (args: {
    data: {
      organizationId: string;
      name: string;
      sku: string;
      category: string;
      status: ProductStatus;
      price: Prisma.Decimal;
      stock: number;
    };
  }) => Promise<ProductRow>;
  updateMany: (args: {
    where: { organizationId: string; id?: string | { in: string[] } };
    data: {
      name?: string;
      sku?: string;
      category?: string;
      status?: ProductStatus;
      price?: Prisma.Decimal;
      stock?: number;
    };
  }) => Promise<{ count: number }>;
  deleteMany: (args: {
    where: { organizationId: string; id?: string | { in: string[] } };
  }) => Promise<{ count: number }>;
};

function normalizeSearchLimit(limit: number | undefined): number {
  const parsedLimit = Math.trunc(limit ?? DEFAULT_PRODUCT_SEARCH_LIMIT);

  if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
    return DEFAULT_PRODUCT_SEARCH_LIMIT;
  }

  return Math.min(parsedLimit, MAX_PRODUCT_SEARCH_LIMIT);
}

function getProductDelegate(): ProductDelegateLike | null {
  const maybeDelegate = (prisma as unknown as { product?: ProductDelegateLike }).product;

  if (
    !maybeDelegate ||
    typeof maybeDelegate.create !== "function" ||
    typeof maybeDelegate.findMany !== "function" ||
    typeof maybeDelegate.updateMany !== "function" ||
    typeof maybeDelegate.deleteMany !== "function"
  ) {
    return null;
  }

  return maybeDelegate;
}

export async function listOrganizationProducts(organizationId: string): Promise<ProductRow[]> {
  const productDelegate = getProductDelegate();

  if (productDelegate) {
    return productDelegate.findMany({
      where: {
        organizationId,
      },
      orderBy: {
        updatedAt: "desc",
      },
      take: 1000,
    });
  }

  return prisma.$queryRaw<ProductRow[]>(Prisma.sql`
    SELECT
      "id",
      "organization_id" AS "organizationId",
      "name",
      "sku",
      "category",
      "status",
      "price",
      "stock",
      "created_at" AS "createdAt",
      "updated_at" AS "updatedAt"
    FROM "product"
    WHERE "organization_id" = ${organizationId}
    ORDER BY "updated_at" DESC
    LIMIT 1000
  `);
}

export async function searchOrganizationProducts(
  organizationId: string,
  query: string,
  limit?: number,
): Promise<ProductRow[]> {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return [];
  }

  const safeLimit = normalizeSearchLimit(limit);
  const containsTerm = `%${normalizedQuery}%`;
  const startsWithTerm = `${normalizedQuery}%`;

  return prisma.$queryRaw<ProductRow[]>(Prisma.sql`
    SELECT
      "id",
      "organization_id" AS "organizationId",
      "name",
      "sku",
      "category",
      "status",
      "price",
      "stock",
      "created_at" AS "createdAt",
      "updated_at" AS "updatedAt"
    FROM "product"
    WHERE "organization_id" = ${organizationId}
      AND (
        "name" ILIKE ${containsTerm}
        OR "sku" ILIKE ${containsTerm}
        OR "category" ILIKE ${containsTerm}
      )
    ORDER BY
      CASE
        WHEN LOWER("name") = LOWER(${normalizedQuery}) THEN 0
        WHEN "sku" ILIKE ${startsWithTerm} THEN 1
        WHEN "name" ILIKE ${startsWithTerm} THEN 2
        ELSE 3
      END,
      "updated_at" DESC
    LIMIT ${safeLimit}
  `);
}

export async function createOrganizationProduct(input: {
  organizationId: string;
  name: string;
  sku: string;
  category: string;
  status: ProductStatus;
  price: Prisma.Decimal;
  stock: number;
}): Promise<void> {
  const productDelegate = getProductDelegate();

  if (productDelegate) {
    await productDelegate.create({
      data: {
        organizationId: input.organizationId,
        name: input.name,
        sku: input.sku,
        category: input.category,
        status: input.status,
        price: input.price,
        stock: input.stock,
      },
    });
    return;
  }

  const id = randomUUID();

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "product" (
      "id",
      "organization_id",
      "name",
      "sku",
      "category",
      "status",
      "price",
      "stock",
      "created_at",
      "updated_at"
    )
    VALUES (
      ${id},
      ${input.organizationId},
      ${input.name},
      ${input.sku},
      ${input.category},
      ${input.status},
      ${input.price},
      ${input.stock},
      NOW(),
      NOW()
    )
  `);
}

export async function updateOrganizationProduct(input: {
  id: string;
  organizationId: string;
  name: string;
  sku: string;
  category: string;
  status: ProductStatus;
  price: Prisma.Decimal;
  stock: number;
}): Promise<number> {
  const productDelegate = getProductDelegate();

  if (productDelegate) {
    const updated = await productDelegate.updateMany({
      where: {
        id: input.id,
        organizationId: input.organizationId,
      },
      data: {
        name: input.name,
        sku: input.sku,
        category: input.category,
        status: input.status,
        price: input.price,
        stock: input.stock,
      },
    });

    return updated.count;
  }

  const count = await prisma.$executeRaw(Prisma.sql`
    UPDATE "product"
    SET
      "name" = ${input.name},
      "sku" = ${input.sku},
      "category" = ${input.category},
      "status" = ${input.status},
      "price" = ${input.price},
      "stock" = ${input.stock},
      "updated_at" = NOW()
    WHERE "id" = ${input.id}
      AND "organization_id" = ${input.organizationId}
  `);

  return Number(count);
}

export async function deleteOrganizationProduct(input: {
  id: string;
  organizationId: string;
}): Promise<number> {
  const productDelegate = getProductDelegate();

  if (productDelegate) {
    const deleted = await productDelegate.deleteMany({
      where: {
        id: input.id,
        organizationId: input.organizationId,
      },
    });

    return deleted.count;
  }

  const count = await prisma.$executeRaw(Prisma.sql`
    DELETE FROM "product"
    WHERE "id" = ${input.id}
      AND "organization_id" = ${input.organizationId}
  `);

  return Number(count);
}

export async function bulkUpdateOrganizationProductsStatus(input: {
  organizationId: string;
  productIds: string[];
  status: ProductStatus;
}): Promise<number> {
  const productDelegate = getProductDelegate();

  if (productDelegate) {
    const updated = await productDelegate.updateMany({
      where: {
        id: {
          in: input.productIds,
        },
        organizationId: input.organizationId,
      },
      data: {
        status: input.status,
      },
    });

    return updated.count;
  }

  const productIdValues = Prisma.join(input.productIds.map((productId) => Prisma.sql`${productId}`));
  const count = await prisma.$executeRaw(Prisma.sql`
    UPDATE "product"
    SET
      "status" = ${input.status},
      "updated_at" = NOW()
    WHERE "organization_id" = ${input.organizationId}
      AND "id" IN (${productIdValues})
  `);

  return Number(count);
}

export async function bulkDeleteOrganizationProducts(input: {
  organizationId: string;
  productIds: string[];
}): Promise<number> {
  const productDelegate = getProductDelegate();

  if (productDelegate) {
    const deleted = await productDelegate.deleteMany({
      where: {
        id: {
          in: input.productIds,
        },
        organizationId: input.organizationId,
      },
    });

    return deleted.count;
  }

  const productIdValues = Prisma.join(input.productIds.map((productId) => Prisma.sql`${productId}`));
  const count = await prisma.$executeRaw(Prisma.sql`
    DELETE FROM "product"
    WHERE "organization_id" = ${input.organizationId}
      AND "id" IN (${productIdValues})
  `);

  return Number(count);
}
