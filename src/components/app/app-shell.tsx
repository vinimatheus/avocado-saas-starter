"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboardIcon, PackageSearchIcon } from "lucide-react";

import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { AppBreadcrumb } from "@/components/app/app-breadcrumb";
import {
  InvitationNotificationMenu,
  type UserInvitation,
} from "@/components/app/invitation-notification-menu";
import { OrganizationSwitcher } from "@/components/app/organization-switcher";
import { AppUserMenu } from "@/components/app/app-user-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { OrganizationUserRole } from "@/lib/organization/helpers";

type AppShellProps = {
  activeOrganizationId?: string | null;
  organizationName?: string | null;
  organizations: Array<{
    id: string;
    name: string;
    slug: string;
    logo: string | null;
    planCode: "FREE" | "STARTER_50" | "PRO_100" | "SCALE_400";
    planName: string;
    isPremium: boolean;
  }>;
  pendingInvitations: UserInvitation[];
  role: OrganizationUserRole;
  userName?: string | null;
  userImage?: string | null;
  children: React.ReactNode;
};

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  showWhen: (role: OrganizationUserRole) => boolean;
};

const NAV_ITEMS: NavItem[] = [
  {
    label: "Painel",
    href: "/dashboard",
    icon: LayoutDashboardIcon,
    showWhen: () => true,
  },
  {
    label: "Produtos",
    href: "/produtos",
    icon: PackageSearchIcon,
    showWhen: () => true,
  },
];

function AppSidebar({
  activeOrganizationId,
  organizationName,
  organizations,
  role,
  userName,
  userImage,
}: Omit<AppShellProps, "children" | "pendingInvitations">) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <Link
              href="/dashboard"
              className="group flex items-center gap-3 px-2 py-2 transition-all hover:bg-sidebar-accent/50 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:px-0"
            >
              <span className="group-data-[collapsible=icon]:hidden">
                <Logo size="sm" showText showGlow />
              </span>
              <span className="hidden group-data-[collapsible=icon]:inline-flex">
                <Logo size="sm" showText={false} showGlow={false} className="scale-110" />
              </span>
            </Link>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <OrganizationSwitcher
              organizations={organizations}
              activeOrganizationId={activeOrganizationId ?? null}
              fallbackOrganizationName={organizationName}
              role={role}
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navegacao</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.filter((item) => item.showWhen(role)).map((item) => {
                const isActive = pathname === item.href;

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      tooltip={item.label}
                      isActive={isActive}
                      variant={isActive ? "outline" : "default"}
                    >
                      <Link
                        href={item.href}
                        className="flex w-full items-center gap-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0"
                      >
                        <item.icon className="size-4" />
                        <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <AppUserMenu role={role} userName={userName} userImage={userImage} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

export function AppShell({
  activeOrganizationId = null,
  organizationName = null,
  organizations,
  pendingInvitations,
  role,
  userName = null,
  userImage = null,
  children,
}: AppShellProps) {
  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen>
        <AppSidebar
          activeOrganizationId={activeOrganizationId}
          organizationName={organizationName}
          organizations={organizations}
          role={role}
          userName={userName}
          userImage={userImage}
        />
        <SidebarInset>
          <header className="bg-background/95 supports-backdrop-filter:bg-background/60 sticky top-0 z-20 flex h-14 items-center gap-2 border-b px-5 sm:px-6 backdrop-blur">
            <SidebarTrigger />
            <div className="min-w-0 flex-1">
              <AppBreadcrumb />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle />
              <InvitationNotificationMenu initialInvitations={pendingInvitations} />
            </div>
          </header>

          <div className="flex flex-1 flex-col">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
