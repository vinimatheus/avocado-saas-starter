import type { Metadata } from "next";
import { Prisma } from "@prisma/client";
import Image from "next/image";

import { AppPageContainer } from "@/components/app/app-page-container";
import { StatusBanner } from "@/components/app/status-banner";
import { ProductsDataTable } from "@/components/templates/products-data-table";
import { Card, CardContent } from "@/components/ui/card";
import { isOrganizationAdminRole } from "@/lib/organization/helpers";
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

export default async function ProductsPage() {
  const tenantContext = await getTenantContext();
  const canManage = isOrganizationAdminRole(tenantContext.role);
  const productsResult = await listProducts(tenantContext.organizationId);

  return (
    <AppPageContainer className="gap-6">
      <section className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Produtos</h1>
        <p className="text-muted-foreground text-sm sm:text-base">
          Tabela base para cadastros com dados reais via Prisma e formularios em Sheet.
        </p>
      </section>

      <StatusBanner message={productsResult.errorMessage} />

      <Card className="overflow-hidden border-primary/30 bg-gradient-to-br from-background via-background to-primary/10">
        <CardContent className="p-0">
          <div className="grid items-center gap-4 md:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-2 px-5 py-5 sm:px-6">
              <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[0.12em]">
                Catalogo em foco
              </p>
              <h2 className="text-xl font-semibold tracking-tight">
                Organize seu catalogo com clareza e ritmo de crescimento
              </h2>
              <p className="text-muted-foreground text-sm">
                Gerencie seus produtos com uma base estruturada para cadastro, atualizacao e
                evolucao do seu portfolio.
              </p>
            </div>

            <div className="relative h-48 w-full md:h-full md:min-h-[220px]">
              <Image
                src="/img/produtos.png"
                alt="Avocato organizando produtos no computador"
                fill
                priority
                sizes="(max-width: 768px) 100vw, 34vw"
                className="object-cover object-center md:object-[56%_center]"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <ProductsDataTable products={productsResult.items} canManage={canManage} />
        </CardContent>
      </Card>
    </AppPageContainer>
  );
}
