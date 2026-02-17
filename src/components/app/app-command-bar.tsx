"use client";

import { useEffect, useMemo, useState } from "react";
import { SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  KBarAnimator,
  KBarPortal,
  KBarPositioner,
  KBarProvider,
  KBarResults,
  KBarSearch,
  type Action,
  useKBar,
  useMatches,
  useRegisterActions,
} from "kbar";

import { Button } from "@/components/ui/button";
import { searchProductsAction } from "@/actions/product-search-actions";
import { cn } from "@/lib/shared/utils";

const MIN_PRODUCT_QUERY_LENGTH = 2;
const PRODUCT_RESULTS_LIMIT = 8;
const PRODUCT_SEARCH_DEBOUNCE_MS = 180;

type ProductSearchResult = {
  id: string;
  name: string;
  sku: string;
  category: string;
  status: string;
};

function parseProductSearchResponse(payload: unknown): ProductSearchResult[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const maybeItems = (payload as { items?: unknown }).items;
  if (!Array.isArray(maybeItems)) {
    return [];
  }

  const parsedItems: ProductSearchResult[] = [];

  for (const item of maybeItems) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const maybeProduct = item as Partial<ProductSearchResult>;
    if (
      typeof maybeProduct.id !== "string" ||
      typeof maybeProduct.name !== "string" ||
      typeof maybeProduct.sku !== "string" ||
      typeof maybeProduct.category !== "string" ||
      typeof maybeProduct.status !== "string"
    ) {
      continue;
    }

    parsedItems.push({
      id: maybeProduct.id,
      name: maybeProduct.name,
      sku: maybeProduct.sku,
      category: maybeProduct.category,
      status: maybeProduct.status,
    });
  }

  return parsedItems;
}

function buildProductsQueryParam(searchTerm: string): string {
  const searchParams = new URLSearchParams();
  searchParams.set("busca", searchTerm);
  return searchParams.toString();
}

function AppCommandActions() {
  const router = useRouter();
  const { searchQuery } = useKBar((state) => ({
    searchQuery: state.searchQuery,
  }));
  const normalizedQuery = searchQuery.trim();
  const hasProductQuery = normalizedQuery.length >= MIN_PRODUCT_QUERY_LENGTH;
  const [productSearchSnapshot, setProductSearchSnapshot] = useState<{
    query: string;
    results: ProductSearchResult[];
  }>({
    query: "",
    results: [],
  });

  const pageActions = useMemo<Action[]>(
    () => [
      {
        id: "go-dashboard",
        name: "Painel",
        section: "Paginas",
        subtitle: "Abrir painel principal",
        keywords: "dashboard painel home inicio",
        shortcut: ["g", "d"],
        perform: () => {
          router.push("/dashboard");
        },
      },
      {
        id: "go-products",
        name: "Produtos",
        section: "Paginas",
        subtitle: "Abrir catalogo de produtos",
        keywords: "produtos catalogo itens sku",
        shortcut: ["g", "p"],
        perform: () => {
          router.push("/produtos");
        },
      },
      {
        id: "go-billing",
        name: "Plano",
        section: "Paginas",
        subtitle: "Abrir pagina de assinatura",
        keywords: "billing plano assinatura pagamento",
        perform: () => {
          router.push("/billing");
        },
      },
      {
        id: "go-profile",
        name: "Perfil",
        section: "Paginas",
        subtitle: "Abrir configuracoes da conta",
        keywords: "perfil conta usuario",
        perform: () => {
          router.push("/profile");
        },
      },
    ],
    [router],
  );

  useRegisterActions(pageActions, [pageActions]);

  useEffect(() => {
    if (!hasProductQuery) {
      return;
    }

    let isDisposed = false;
    const timeoutId = window.setTimeout(() => {
      void (async () => {
        try {
          const payload = await searchProductsAction({
            query: normalizedQuery,
            limit: PRODUCT_RESULTS_LIMIT,
          });
          if (isDisposed) {
            return;
          }

          setProductSearchSnapshot({
            query: normalizedQuery,
            results: parseProductSearchResponse(payload),
          });
        } catch {
          if (isDisposed) {
            return;
          }

          setProductSearchSnapshot({
            query: normalizedQuery,
            results: [],
          });
        }
      })();
    }, PRODUCT_SEARCH_DEBOUNCE_MS);

    return () => {
      isDisposed = true;
      window.clearTimeout(timeoutId);
    };
  }, [hasProductQuery, normalizedQuery]);

  const productResults = useMemo(
    () => (productSearchSnapshot.query === normalizedQuery ? productSearchSnapshot.results : []),
    [normalizedQuery, productSearchSnapshot.query, productSearchSnapshot.results],
  );

  const productActions = useMemo<Action[]>(() => {
    if (!hasProductQuery) {
      return [];
    }

    const actions: Action[] = [
      {
        id: "search-products-query",
        name: `Buscar produtos por "${normalizedQuery}"`,
        section: "Produtos",
        subtitle: "Abrir pagina de produtos com filtro aplicado",
        keywords: "buscar produtos catalogo filtro",
        priority: 100,
        perform: () => {
          router.push(`/produtos?${buildProductsQueryParam(normalizedQuery)}`);
        },
      },
    ];

    for (const product of productResults) {
      actions.push({
        id: `search-product-${product.id}`,
        name: product.name,
        section: "Produtos",
        subtitle: `${product.sku} - ${product.category}`,
        keywords: `${product.sku} ${product.category} ${product.status}`,
        priority: 10,
        perform: () => {
          router.push(`/produtos?${buildProductsQueryParam(product.sku)}`);
        },
      });
    }

    return actions;
  }, [hasProductQuery, normalizedQuery, productResults, router]);

  useRegisterActions(productActions, [productActions]);

  return null;
}

function AppCommandPalette() {
  const { results } = useMatches();
  const { searchQuery } = useKBar((state) => ({
    searchQuery: state.searchQuery,
  }));
  const hasSearchQuery = searchQuery.trim().length > 0;

  return (
    <KBarPortal>
      <KBarPositioner className="bg-background/75 z-[80] p-4 backdrop-blur-sm">
        <KBarAnimator className="bg-card text-card-foreground w-full max-w-2xl overflow-hidden rounded-xl border shadow-2xl">
          <div className="border-b px-3 py-2">
            <KBarSearch
              className="text-foreground placeholder:text-muted-foreground h-9 w-full border-0 bg-transparent text-sm outline-none"
              placeholder="Navegue por paginas ou pesquise produtos..."
            />
          </div>

          <KBarResults
            items={results}
            maxHeight={440}
            onRender={({ item, active }) => {
              if (typeof item === "string") {
                return (
                  <div className="text-muted-foreground bg-muted/60 px-3 py-1.5 text-[0.65rem] font-semibold tracking-[0.16em] uppercase">
                    {item}
                  </div>
                );
              }

              return (
                <div
                  className={cn(
                    "flex items-center justify-between gap-3 px-3 py-2",
                    active ? "bg-primary/10 text-foreground" : "bg-transparent",
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    {item.subtitle ? (
                      <p className="text-muted-foreground truncate text-xs">{item.subtitle}</p>
                    ) : null}
                  </div>

                  {item.shortcut?.length ? (
                    <kbd className="text-muted-foreground bg-muted rounded px-1.5 py-0.5 text-[0.65rem] font-medium">
                      {item.shortcut.join(" ")}
                    </kbd>
                  ) : null}
                </div>
              );
            }}
          />

          {results.length === 0 ? (
            <div className="text-muted-foreground px-3 py-6 text-center text-xs">
              {hasSearchQuery
                ? "Nenhum resultado encontrado para a busca atual."
                : "Use Cmd/Ctrl + K para navegar rapido entre paginas."}
            </div>
          ) : null}
        </KBarAnimator>
      </KBarPositioner>
    </KBarPortal>
  );
}

export function AppCommandBar({ children }: { children: React.ReactNode }) {
  return (
    <KBarProvider>
      <AppCommandActions />
      <AppCommandPalette />
      {children}
    </KBarProvider>
  );
}

export function AppCommandBarTrigger() {
  const { query } = useKBar();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="max-w-[220px] gap-1.5"
      onClick={() => {
        query.toggle();
      }}
      aria-label="Abrir busca de comandos"
    >
      <SearchIcon className="size-3.5" />
      <span className="hidden sm:inline">Buscar</span>
      <span className="text-muted-foreground hidden lg:inline text-[0.65rem]">Cmd/Ctrl + K</span>
    </Button>
  );
}
