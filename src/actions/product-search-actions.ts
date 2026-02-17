"use server";

import { Prisma } from "@prisma/client";

import { canRoleReadProducts } from "@/lib/organization/permissions";
import { getTenantContext } from "@/lib/organization/tenant-context";
import { searchOrganizationProducts } from "@/lib/products/repository";
import { productStatusSchema } from "@/lib/products/schemas";

const MIN_PRODUCT_QUERY_LENGTH = 2;
const MAX_PRODUCT_QUERY_LENGTH = 120;
const DEFAULT_PRODUCT_SEARCH_LIMIT = 8;
const MAX_PRODUCT_SEARCH_LIMIT = 20;

type ProductSearchActionInput = {
  query?: string;
  limit?: number;
};

type ProductSearchItem = {
  id: string;
  name: string;
  sku: string;
  category: string;
  status: "active" | "draft" | "archived";
};

export type ProductSearchActionResult = {
  items: ProductSearchItem[];
};

function normalizeQuery(input: unknown): string {
  if (typeof input !== "string") {
    return "";
  }

  return input.trim().slice(0, MAX_PRODUCT_QUERY_LENGTH);
}

function normalizeLimit(input: unknown): number {
  const value = typeof input === "number" ? Math.trunc(input) : Number.NaN;
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_PRODUCT_SEARCH_LIMIT;
  }

  return Math.min(value, MAX_PRODUCT_SEARCH_LIMIT);
}

export async function searchProductsAction(
  input: ProductSearchActionInput,
): Promise<ProductSearchActionResult> {
  const tenantContext = await getTenantContext();
  if (!tenantContext.session?.user || !tenantContext.organizationId) {
    return {
      items: [],
    };
  }
  if (!canRoleReadProducts(tenantContext.role, tenantContext.permissions)) {
    return {
      items: [],
    };
  }

  const query = normalizeQuery(input.query);
  if (query.length < MIN_PRODUCT_QUERY_LENGTH) {
    return {
      items: [],
    };
  }

  const limit = normalizeLimit(input.limit);

  try {
    const rows = await searchOrganizationProducts(tenantContext.organizationId, query, limit);

    return {
      items: rows.map((row) => {
        const parsedStatus = productStatusSchema.safeParse(row.status);

        return {
          id: row.id,
          name: row.name,
          sku: row.sku,
          category: row.category,
          status: parsedStatus.success ? parsedStatus.data : "draft",
        };
      }),
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021") {
      return {
        items: [],
      };
    }

    console.error("Falha ao buscar produtos para o command bar.", error);
    return {
      items: [],
    };
  }
}
