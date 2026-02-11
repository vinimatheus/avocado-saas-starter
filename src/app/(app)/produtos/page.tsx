import { PackageSearchIcon } from "lucide-react";
import { Prisma } from "@prisma/client";

import { AppPageHero } from "@/components/app/app-page-hero";
import { AppPageContainer } from "@/components/app/app-page-container";
import { StatusBanner } from "@/components/app/status-banner";
import { ProductsDataTable } from "@/components/templates/products-data-table";
import { Card, CardContent } from "@/components/ui/card";
import { isOrganizationAdminRole } from "@/lib/organization/helpers";
import { listOrganizationProducts } from "@/lib/products/repository";
import { productStatusSchema } from "@/lib/products/schemas";
import { getTenantContext } from "@/lib/organization/tenant-context";

export const dynamic = "force-dynamic";

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
        errorMessage: "Tabela de produtos ainda nao existe no banco. Execute: npm run prisma:push",
      };
    }

    console.error("Falha ao listar produtos.", error);

    return {
      items: [],
      errorMessage: "Falha ao carregar produtos do banco de dados.",
    };
  }
}

export default async function ProductsPage() {
  const tenantContext = await getTenantContext();
  const canManage = isOrganizationAdminRole(tenantContext.role);
  const productsResult = await listProducts(tenantContext.organizationId);

  return (
    <AppPageContainer className="gap-6">
      <AppPageHero
        icon={PackageSearchIcon}
        eyebrow="Produtos"
        title="Cadastros com dados reais e fluxo pronto para evolucao"
        description="Tabela base para cadastros com dados reais via Prisma e formularios em Sheet."
        tags={[
          { label: "Template", variant: "secondary" },
          { label: "Prisma", variant: "outline" },
          { label: "TanStack Table", variant: "outline" },
          { label: "Sheet + RHF", variant: "outline" },
        ]}
      />

      <StatusBanner message={productsResult.errorMessage} />

      <Card>
        <CardContent className="pt-6">
          <ProductsDataTable products={productsResult.items} canManage={canManage} />
        </CardContent>
      </Card>
    </AppPageContainer>
  );
}
