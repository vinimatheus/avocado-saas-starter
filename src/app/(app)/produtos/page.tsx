import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";

import { AppPageContainer } from "@/components/app/app-page-container";
import { AppPageHighlightCard } from "@/components/app/app-page-highlight-card";
import { StatusBanner } from "@/components/app/status-banner";
import { ProductsDataTable } from "@/components/templates/products-data-table";
import { Card, CardContent } from "@/components/ui/card";
import { getOrganizationBlockMessage } from "@/lib/billing/subscription-service";
import { isOrganizationAdminRole } from "@/lib/organization/helpers";
import { canRoleCreateProduct } from "@/lib/organization/permissions";
import { listOrganizationProducts } from "@/lib/products/repository";
import { productStatusSchema } from "@/lib/products/schemas";
import { getTenantContext } from "@/lib/organization/tenant-context";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Produtos",
  description:
    "Gestao interna de catalogo com tabela de produtos integrada ao banco e controles por organizacao.",
  alternates: {
    canonical: "/produtos",
  },
};

type ProductsResult = {
  items: Array<{
    id: string;
    sku: string;
    name: string;
    category: string;
    status: "active" | "draft" | "archived";
    price: number;
    stock: number;
    createdAt: string;
    updatedAt: string;
  }>;
  errorMessage: string | null;
};

type SearchParamsInput =
  | Record<string, string | string[] | undefined>
  | Promise<Record<string, string | string[] | undefined>>;

function getSingleSearchParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

async function listProducts(organizationId: string | null): Promise<ProductsResult> {
  if (!organizationId) {
    return {
      items: [],
      errorMessage: null,
    };
  }

  try {
    const rows = await listOrganizationProducts(organizationId);

    return {
      items: rows.map((row) => {
        const parsedStatus = productStatusSchema.safeParse(row.status);

        return {
          id: row.id,
          sku: row.sku,
          name: row.name,
          category: row.category,
          status: parsedStatus.success ? parsedStatus.data : "draft",
          price: Number(row.price),
          stock: row.stock,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        };
      }),
      errorMessage: null,
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021") {
      return {
        items: [],
        errorMessage: "Tabela de produtos ainda nao existe no banco. Execute: pnpm run prisma:push",
      };
    }

    console.error("Falha ao listar produtos.", error);

    return {
      items: [],
      errorMessage: "Falha ao carregar produtos do banco de dados.",
    };
  }
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const initialSearchQuery = getSingleSearchParam(resolvedSearchParams.busca).trim();

  const tenantContext = await getTenantContext();
  const organizationId = tenantContext.organizationId;
  if (organizationId) {
    const blockMessage = await getOrganizationBlockMessage(organizationId);
    if (blockMessage) {
      const searchParams = new URLSearchParams();
      searchParams.set("error", blockMessage);
      redirect(`/billing?${searchParams.toString()}`);
    }
  }

  const canManage = isOrganizationAdminRole(tenantContext.role);
  const canCreate = canRoleCreateProduct(tenantContext.role, tenantContext.permissions);
  const productsResult = await listProducts(organizationId);

  return (
    <AppPageContainer className="gap-4">
      <StatusBanner message={productsResult.errorMessage} />

      <AppPageHighlightCard
        eyebrow="Produtos"
        title="Organize seu catalogo com clareza e ritmo de crescimento"
        description="Gerencie seus produtos com uma base estruturada para cadastro, atualizacao e evolucao do portfolio."
        imageSrc="/img/produtos.png"
        imageAlt="Avocato organizando produtos no computador"
      />

      <Card>
        <CardContent className="pt-6">
          <ProductsDataTable
            products={productsResult.items}
            canManage={canManage}
            canCreate={canCreate}
            initialSearchQuery={initialSearchQuery}
          />
        </CardContent>
      </Card>
    </AppPageContainer>
  );
}
