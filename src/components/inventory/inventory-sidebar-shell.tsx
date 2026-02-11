"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BoxesIcon,
  ChevronDownIcon,
  ClipboardListIcon,
  DatabaseIcon,
  FolderOpenIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  MapPinnedIcon,
  PackageIcon,
  PackageSearchIcon,
  PlusIcon,
  SparklesIcon,
  User2Icon,
} from "lucide-react";

import { SignOutForm } from "@/components/auth/sign-out-form";
import {
  InventoryCommandBarProvider,
  InventoryCommandBarTrigger,
} from "@/components/inventory/inventory-command-bar";
import { InventoryOperations } from "@/components/inventory/inventory-operations";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

type InventorySidebarShellProps = {
  locationCount: number;
  palletCount: number;
  productCount: number;
  latestRecordAt: string | null;
  organizationName?: string | null;
  role: "admin" | "user";
  userName?: string | null;
  userEmail?: string | null;
  errorMessage?: string | null;
  children: React.ReactNode;
};

type NavSubItem = {
  label: string;
  href: string;
};

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  children?: NavSubItem[];
  match?: (pathname: string) => boolean;
};

function formatLatestRecord(value: string | null): string {
  if (!value) {
    return "Sem leitura";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatRoleLabel(role: "admin" | "user"): string {
  return role === "admin" ? "Administrador" : "Usuario";
}

function isItemActive(pathname: string, item: NavItem): boolean {
  if (item.match) {
    return item.match(pathname);
  }

  return pathname === item.href;
}

function InventorySidebar({
  locationCount,
  palletCount,
  productCount,
  latestRecordAt,
  organizationName,
  role,
  userName,
  userEmail,
}: Omit<InventorySidebarShellProps, "children" | "errorMessage">) {
  const pathname = usePathname();

  const items = useMemo<NavItem[]>(
    () => {
      const baseItems: NavItem[] = [
        {
          label: "Visao Geral",
          href: "/visao-geral",
          icon: LayoutDashboardIcon,
        },
        {
          label: "Indicadores",
          href: "/indicadores",
          icon: SparklesIcon,
        },
      ];

      if (role === "admin") {
        baseItems.push(
          {
            label: "Cadastros",
            href: "/cadastros",
            icon: FolderOpenIcon,
            badge: locationCount + palletCount + productCount,
            match: (path) => path.startsWith("/cadastros"),
            children: [
              { label: "Localizacao", href: "/cadastros/localizacao" },
              { label: "Localizacao em massa", href: "/cadastros/localizacao-massa" },
              { label: "Produto", href: "/cadastros/produto" },
              { label: "Pallet", href: "/cadastros/pallet" },
            ],
          },
          {
            label: "Integracoes",
            href: "/integracoes/chaves-scanner",
            icon: KeyRoundIcon,
            match: (path) => path.startsWith("/integracoes"),
            children: [{ label: "Chaves Scanner", href: "/integracoes/chaves-scanner" }],
          },
          {
            label: "Usuarios",
            href: "/usuarios",
            icon: User2Icon,
            match: (path) => path.startsWith("/usuarios"),
          },
        );
      }

      return baseItems;
    },
    [locationCount, palletCount, productCount, role],
  );

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg">
                  <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-md">
                    <BoxesIcon className="size-4" />
                  </div>
                  <div className="grid flex-1 text-left text-xs leading-tight">
                    <span className="truncate font-medium">Logistic MVP</span>
                    <span className="text-muted-foreground truncate text-[0.7rem]">
                      {organizationName || "Inventario + Scanner"}
                    </span>
                  </div>
                  <ChevronDownIcon className="ml-auto" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>Contexto</DropdownMenuLabel>
                <DropdownMenuItem>
                  <DatabaseIcon />
                  PostgreSQL + Prisma
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <MapPinnedIcon />
                  Localizacoes: {locationCount}
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <PackageIcon />
                  Pallets: {palletCount}
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <PackageSearchIcon />
                  Produtos: {productCount}
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <User2Icon />
                  Perfil: {formatRoleLabel(role)}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <ClipboardListIcon />
                  Ultima leitura: {formatLatestRecord(latestRecordAt)}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
        <InventoryCommandBarTrigger />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navegacao</SidebarGroupLabel>
          <SidebarGroupAction title="Atalho rapido">
            <PlusIcon />
            <span className="sr-only">Atalho rapido</span>
          </SidebarGroupAction>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const isActive = isItemActive(pathname, item);

                return (
                  <SidebarMenuItem key={item.label}>
                    <SidebarMenuButton
                      asChild
                      tooltip={item.label}
                      isActive={isActive}
                      variant={isActive ? "outline" : "default"}
                    >
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                    <SidebarMenuAction showOnHover title="Abrir secao">
                      <FolderOpenIcon />
                    </SidebarMenuAction>
                    {typeof item.badge === "number" ? (
                      <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
                    ) : null}

                    {item.children?.length ? (
                      <SidebarMenuSub>
                        {item.children.map((subItem) => (
                          <SidebarMenuSubItem key={subItem.label}>
                            <SidebarMenuSubButton asChild isActive={pathname === subItem.href}>
                              <Link href={subItem.href}>
                                <span>{subItem.label}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    ) : null}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>Status de Carregamento</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuSkeleton showIcon />
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuSkeleton showIcon />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg">
                  <div className="bg-sidebar-accent text-sidebar-accent-foreground flex aspect-square size-8 items-center justify-center rounded-md">
                    <User2Icon className="size-4" />
                  </div>
                  <div className="grid flex-1 text-left text-xs leading-tight">
                    <span className="truncate font-medium">{userName || "Operador"}</span>
                    <span className="text-muted-foreground truncate text-[0.7rem]">
                      {userEmail || "Turno inventario"}
                    </span>
                  </div>
                  <ChevronDownIcon className="ml-auto" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="end" className="w-56">
                <DropdownMenuLabel>Conta</DropdownMenuLabel>
                {userEmail ? (
                  <DropdownMenuItem>
                    <User2Icon />
                    {userEmail}
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem>
                  <ClipboardListIcon />
                  Ultima leitura: {formatLatestRecord(latestRecordAt)}
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <MapPinnedIcon />
                  Localizacoes: {locationCount}
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <PackageIcon />
                  Pallets: {palletCount}
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <PackageSearchIcon />
                  Produtos: {productCount}
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <User2Icon />
                  Perfil: {formatRoleLabel(role)}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

export function InventorySidebarShell({
  locationCount,
  palletCount,
  productCount,
  latestRecordAt,
  organizationName = null,
  role,
  userName = null,
  userEmail = null,
  errorMessage = null,
  children,
}: InventorySidebarShellProps) {
  return (
    <TooltipProvider>
      <InventoryCommandBarProvider role={role}>
        <SidebarProvider defaultOpen>
          <InventorySidebar
            locationCount={locationCount}
            palletCount={palletCount}
            productCount={productCount}
            latestRecordAt={latestRecordAt}
            organizationName={organizationName}
            role={role}
            userName={userName}
            userEmail={userEmail}
          />
          <SidebarInset>
            <header className="bg-background/95 supports-backdrop-filter:bg-background/60 sticky top-0 z-20 flex h-14 items-center gap-2 border-b px-4 backdrop-blur">
              <SidebarTrigger />
              <div className="ml-auto flex items-center gap-2">
                <InventoryOperations showFeedback={false} />
                <SignOutForm />
              </div>
            </header>

            {errorMessage ? (
              <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs">
                {errorMessage}
              </div>
            ) : null}

            <div className="flex flex-1 flex-col">{children}</div>
          </SidebarInset>
        </SidebarProvider>
      </InventoryCommandBarProvider>
    </TooltipProvider>
  );
}
