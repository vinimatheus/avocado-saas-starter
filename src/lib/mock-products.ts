export type ProductStatus = "active" | "draft" | "archived";

export type ProductCategory =
  | "Assinatura"
  | "Hardware"
  | "Servicos"
  | "Marketing"
  | "Educacao"
  | "Financeiro";

export type Product = {
  id: string;
  sku: string;
  name: string;
  category: ProductCategory;
  status: ProductStatus;
  price: number;
  stock: number;
  rating: number;
  updatedAt: string;
};

const productNames = [
  "Starter CRM",
  "Growth CRM",
  "Enterprise CRM",
  "Analytics Hub",
  "Insights Pro",
  "Email Booster",
  "Campaign Pilot",
  "Lead Capture",
  "Checkout Smart",
  "Inventory Sync",
  "Support Desk",
  "Help Center",
  "Billing Flow",
  "Cashboard",
  "KPI Watch",
  "Cloud Gateway",
  "Edge Sensor",
  "Smart Terminal",
  "Onboarding Kit",
  "Academy Plus",
];

const categoryByIndex: ProductCategory[] = [
  "Assinatura",
  "Hardware",
  "Servicos",
  "Marketing",
  "Educacao",
  "Financeiro",
];

const statusByIndex: ProductStatus[] = ["active", "active", "draft", "archived"];

function toProductId(index: number): string {
  return `prod-${String(index + 1).padStart(3, "0")}`;
}

function toSku(index: number): string {
  return `SKU-${String(1000 + index)}`;
}

function buildUpdatedAt(index: number): string {
  const day = (index % 28) + 1;
  const hour = 8 + (index % 10);

  return new Date(Date.UTC(2025, (index % 12), day, hour, 20, 0)).toISOString();
}

export const mockProducts: Product[] = Array.from({ length: 72 }, (_, index) => {
  const basePrice = 79 + (index % 12) * 37;

  return {
    id: toProductId(index),
    sku: toSku(index),
    name: `${productNames[index % productNames.length]} ${Math.floor(index / productNames.length) + 1}`,
    category: categoryByIndex[index % categoryByIndex.length],
    status: statusByIndex[index % statusByIndex.length],
    price: Number((basePrice + (index % 5) * 8.5).toFixed(2)),
    stock: 6 + (index * 3) % 95,
    rating: Number((3 + (index % 12) * 0.15).toFixed(1)),
    updatedAt: buildUpdatedAt(index),
  };
});

export const productCategories = categoryByIndex;
export const productStatuses: ProductStatus[] = ["active", "draft", "archived"];
