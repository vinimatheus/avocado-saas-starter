"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon } from "lucide-react";
import {
  type Action,
  KBarAnimator,
  KBarPortal,
  KBarPositioner,
  KBarProvider,
  KBarResults,
  KBarSearch,
  useKBar,
  useMatches,
} from "kbar";

import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type InventoryCommandBarProviderProps = {
  role: "admin" | "user";
  children: React.ReactNode;
};

type InventoryCommandBarTriggerProps = {
  className?: string;
  ariaLabel?: string;
};

type NavigationActionDefinition = {
  id: string;
  name: string;
  subtitle: string;
  href: string;
  keywords: string;
  shortcut: string[];
};

const BASE_ACTIONS: NavigationActionDefinition[] = [
  {
    id: "goto-overview",
    name: "Abrir Visao Geral",
    subtitle: "Resumo principal do inventario",
    href: "/visao-geral",
    keywords: "dashboard overview visao geral inicio home",
    shortcut: ["v", "g"],
  },
  {
    id: "goto-indicators",
    name: "Abrir Indicadores",
    subtitle: "Metricas e indicadores de operacao",
    href: "/indicadores",
    keywords: "indicadores metricas analytics desempenho",
    shortcut: ["i"],
  },
];

const ADMIN_ACTIONS: NavigationActionDefinition[] = [
  {
    id: "goto-registrations",
    name: "Abrir Cadastros",
    subtitle: "Area principal de cadastros",
    href: "/cadastros",
    keywords: "cadastros administracao configuracao",
    shortcut: ["c"],
  },
  {
    id: "goto-locations",
    name: "Abrir Localizacao",
    subtitle: "Gerenciar localizacoes",
    href: "/cadastros/localizacao",
    keywords: "localizacao endereco posicao rua",
    shortcut: ["l"],
  },
  {
    id: "goto-locations-bulk",
    name: "Abrir Localizacao em Massa",
    subtitle: "Cadastro em lote de localizacoes",
    href: "/cadastros/localizacao-massa",
    keywords: "massa lote importacao localizacao",
    shortcut: ["m"],
  },
  {
    id: "goto-pallets",
    name: "Abrir Pallet",
    subtitle: "Gerenciar pallets",
    href: "/cadastros/pallet",
    keywords: "pallet estoque base item",
    shortcut: ["p"],
  },
  {
    id: "goto-products",
    name: "Abrir Produto",
    subtitle: "Gerenciar produtos por SKU",
    href: "/cadastros/produto",
    keywords: "produto sku descricao categoria cadastro",
    shortcut: ["g", "p"],
  },
  {
    id: "goto-scanner-keys",
    name: "Abrir Chaves Scanner",
    subtitle: "Gerenciar integracoes do scanner",
    href: "/integracoes/chaves-scanner",
    keywords: "integracoes scanner chaves api key",
    shortcut: ["s"],
  },
  {
    id: "goto-users",
    name: "Abrir Usuarios",
    subtitle: "Gestao de usuarios e convites",
    href: "/usuarios",
    keywords: "usuarios user convite perfil role admin",
    shortcut: ["u"],
  },
];

function InventoryCommandPalette() {
  const { results } = useMatches();

  return (
    <KBarPortal>
      <KBarPositioner className="z-[80] bg-black/45 p-4 backdrop-blur-sm">
        <KBarAnimator className="bg-background text-foreground w-full max-w-2xl overflow-hidden rounded-xl border shadow-xl">
          <KBarSearch
            className="h-12 w-full border-b px-4 text-sm outline-none"
            defaultPlaceholder="Digite um comando ou tela..."
          />
          <KBarResults
            items={results}
            onRender={({ item, active }) =>
              typeof item === "string" ? (
                <div className="text-muted-foreground bg-muted/40 px-4 py-2 text-[0.65rem] font-semibold uppercase tracking-wide">
                  {item}
                </div>
              ) : (
                <div
                  className={cn(
                    "flex items-center justify-between border-b px-4 py-3",
                    active ? "bg-primary/10" : "bg-background",
                  )}
                >
                  <div className="space-y-0.5">
                    <div className="text-sm font-medium">{item.name}</div>
                    {item.subtitle ? (
                      <div className="text-muted-foreground text-xs">{item.subtitle}</div>
                    ) : null}
                  </div>
                  {item.shortcut?.length ? (
                    <div className="text-muted-foreground flex items-center gap-1 text-[0.65rem]">
                      {item.shortcut.map((key) => (
                        <kbd key={key} className="bg-muted rounded border px-1.5 py-0.5 uppercase">
                          {key}
                        </kbd>
                      ))}
                    </div>
                  ) : null}
                </div>
              )
            }
          />
        </KBarAnimator>
      </KBarPositioner>
    </KBarPortal>
  );
}

function buildNavigationAction(
  definition: NavigationActionDefinition,
  onNavigate: (href: string) => void,
): Action {
  return {
    id: definition.id,
    name: definition.name,
    subtitle: definition.subtitle,
    section: "Navegacao",
    keywords: definition.keywords,
    shortcut: definition.shortcut,
    perform: () => onNavigate(definition.href),
  };
}

export function InventoryCommandBarProvider({
  role,
  children,
}: InventoryCommandBarProviderProps) {
  const router = useRouter();

  const actions = useMemo<Action[]>(() => {
    const definitions = role === "admin" ? [...BASE_ACTIONS, ...ADMIN_ACTIONS] : BASE_ACTIONS;
    return definitions.map((definition) =>
      buildNavigationAction(definition, (href) => router.push(href)),
    );
  }, [role, router]);

  return (
    <KBarProvider actions={actions}>
      <InventoryCommandPalette />
      {children}
    </KBarProvider>
  );
}

export function InventoryCommandBarTrigger({
  className,
  ariaLabel = "Buscar",
}: InventoryCommandBarTriggerProps) {
  const { query } = useKBar();
  const { isMobile, state } = useSidebar();
  const showCompactTrigger = !isMobile && state === "collapsed";

  return (
    <Button
      type="button"
      variant="outline"
      size={showCompactTrigger ? "icon-sm" : "sm"}
      className={cn(
        showCompactTrigger ? "shrink-0" : "w-full justify-start",
        className,
      )}
      onClick={() => query.toggle()}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      <SearchIcon className="size-3.5" />
      {showCompactTrigger ? <span className="sr-only">{ariaLabel}</span> : <span>{ariaLabel}</span>}
    </Button>
  );
}
