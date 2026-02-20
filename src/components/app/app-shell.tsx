"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowUpRightIcon,
  Clock3Icon,
  LayoutDashboardIcon,
  PackageSearchIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
} from "lucide-react";

import { GitHubCreditLink } from "@/components/shared/github-credit-link";
import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { AppBreadcrumb } from "@/components/app/app-breadcrumb";
import { AppCommandBar, AppCommandBarTrigger } from "@/components/app/app-command-bar";
import {
  InvitationNotificationMenu,
  type UserInvitation,
} from "@/components/app/invitation-notification-menu";
import { OrganizationSwitcher } from "@/components/app/organization-switcher";
import { AppUserMenu } from "@/components/app/app-user-menu";
import { Badge } from "@/components/ui/badge";
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
  useSidebar,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { OrganizationUserRole } from "@/lib/organization/helpers";
import {
  canRoleReadProducts,
  defaultOrganizationPermissions,
  type OrganizationPermissions,
} from "@/lib/organization/permissions";

type AppShellProps = {
  activeOrganizationId?: string | null;
  organizationName?: string | null;
  organizations: Array<{
    id: string;
    name: string;
    slug: string;
    logo: string | null;
    platformStatus: "ACTIVE" | "BLOCKED";
    platformBlockedReason: string | null;
    planCode: "FREE" | "STARTER_50" | "PRO_100" | "SCALE_400";
    planName: string;
    isPremium: boolean;
    subscriptionStatus: "FREE" | "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED" | null;
    trialEndsAt: string | null;
    permissions: OrganizationPermissions;
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
  showWhen: (role: OrganizationUserRole, permissions: OrganizationPermissions) => boolean;
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
    showWhen: (role, permissions) => canRoleReadProducts(role, permissions),
  },
  {
    label: "Configuracoes",
    href: "/configuracoes",
    icon: SlidersHorizontalIcon,
    showWhen: () => true,
  },
];

const MINUTE_IN_MS = 60 * 1000;
const HOUR_IN_MINUTES = 60;
const DAY_IN_MINUTES = 24 * HOUR_IN_MINUTES;
const DAY_IN_MS = DAY_IN_MINUTES * MINUTE_IN_MS;

type TrialBadgeState = {
  label: string;
  isEndingSoon: boolean;
};

function resolveTrialBadgeState(
  status: AppShellProps["organizations"][number]["subscriptionStatus"],
  trialEndsAt: string | null,
  now: Date = new Date(),
): TrialBadgeState | null {
  if (status !== "TRIALING" || !trialEndsAt) {
    return null;
  }

  const trialEndDate = new Date(trialEndsAt);
  if (Number.isNaN(trialEndDate.getTime())) {
    return null;
  }

  const remainingMs = trialEndDate.getTime() - now.getTime();
  if (remainingMs <= 0) {
    return null;
  }

  const remainingMinutes = Math.ceil(remainingMs / MINUTE_IN_MS);
  const days = Math.floor(remainingMinutes / DAY_IN_MINUTES);
  const hours = Math.floor((remainingMinutes % DAY_IN_MINUTES) / HOUR_IN_MINUTES);
  const minutes = remainingMinutes % HOUR_IN_MINUTES;

  let remainingLabel = "";
  if (days > 0) {
    remainingLabel = `${days}d ${hours}h`;
  } else if (hours > 0) {
    remainingLabel = `${hours}h ${minutes}m`;
  } else {
    remainingLabel = `${Math.max(1, minutes)}m`;
  }

  return {
    label: `Trial: ${remainingLabel}`,
    isEndingSoon: remainingMs <= DAY_IN_MS,
  };
}

function resolveActiveOrganization(
  organizations: AppShellProps["organizations"],
  activeOrganizationId?: string | null,
  organizationName?: string | null,
): AppShellProps["organizations"][number] | null {
  return (
    organizations.find((organization) => organization.id === activeOrganizationId) ??
    organizations.find((organization) => organization.name === organizationName) ??
    organizations[0] ??
    null
  );
}

function AppSidebar({
  activeOrganizationId,
  organizationName,
  organizations,
  role,
  userName,
  userImage,
}: Omit<AppShellProps, "children" | "pendingInvitations">) {
  const pathname = usePathname();
  const { isMobile, open, openMobile, setOpenMobile } = useSidebar();
  const activeOrganization = resolveActiveOrganization(
    organizations,
    activeOrganizationId,
    organizationName,
  );
  const shouldShowUpgradePrompt =
    (isMobile ? openMobile : open) && activeOrganization?.planCode === "FREE";
  const activeOrganizationPermissions =
    activeOrganization?.permissions ?? defaultOrganizationPermissions;

  useEffect(() => {
    if (!isMobile) {
      return;
    }

    setOpenMobile(false);
  }, [activeOrganizationId, organizationName, isMobile, pathname, setOpenMobile]);

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
              onOrganizationSwitch={() => {
                if (!isMobile) {
                  return;
                }

                setOpenMobile(false);
              }}
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navegacao</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.filter((item) => item.showWhen(role, activeOrganizationPermissions)).map((item) => {
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
          {shouldShowUpgradePrompt ? (
            <SidebarMenuItem>
              <Link
                href="/billing"
                className="group relative block overflow-hidden rounded-xl border border-sidebar-border/70 bg-gradient-to-br from-sidebar-accent/60 via-sidebar/95 to-sidebar p-3 transition-colors hover:border-sidebar-primary/45 hover:from-sidebar-accent/75"
              >
                <span className="bg-sidebar-primary/20 pointer-events-none absolute -top-6 right-1 size-16 rounded-full blur-xl" />
                <div className="relative flex items-start gap-2.5">
                  <div className="bg-sidebar-primary/18 text-sidebar-primary ring-sidebar-primary/35 mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md ring-1">
                    <SparklesIcon className="size-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sidebar-foreground/70 text-[0.65rem] font-semibold tracking-[0.14em] uppercase">
                      Plano Gratis
                    </p>
                    <p className="text-sidebar-foreground mt-1 text-[0.72rem] leading-snug">
                      Assine para liberar mais recursos no seu workspace.
                    </p>
                    <span className="text-sidebar-primary mt-1.5 inline-flex items-center gap-1 text-[0.68rem] font-semibold">
                      Ver planos
                      <ArrowUpRightIcon className="size-3" />
                    </span>
                  </div>
                </div>
              </Link>
            </SidebarMenuItem>
          ) : null}
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
  const activeOrganization = resolveActiveOrganization(
    organizations,
    activeOrganizationId,
    organizationName,
  );
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const activeOrganizationPermissions =
    activeOrganization?.permissions ?? defaultOrganizationPermissions;
  const canReadProducts = canRoleReadProducts(role, activeOrganizationPermissions);
  const trialStatus = activeOrganization?.subscriptionStatus ?? null;
  const trialEndsAt = activeOrganization?.trialEndsAt ?? null;
  const trialBadgeState = resolveTrialBadgeState(trialStatus, trialEndsAt, currentTime);

  useEffect(() => {
    if (trialStatus !== "TRIALING" || !trialEndsAt) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setCurrentTime(new Date());
    }, MINUTE_IN_MS);

    return () => window.clearInterval(intervalId);
  }, [trialStatus, trialEndsAt]);

  return (
    <AppCommandBar canReadProducts={canReadProducts}>
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
                {trialBadgeState ? (
                  <Link href="/billing" className="hidden sm:inline-flex">
                    <Badge
                      variant={trialBadgeState.isEndingSoon ? "destructive" : "secondary"}
                      className="h-7 px-2.5 text-[0.68rem] font-semibold whitespace-nowrap"
                    >
                      <Clock3Icon className="mr-1 size-3.5" />
                      {trialBadgeState.label}
                    </Badge>
                  </Link>
                ) : null}
                <AppCommandBarTrigger />
                <GitHubCreditLink />
                <ThemeToggle />
                <InvitationNotificationMenu initialInvitations={pendingInvitations} />
              </div>
            </header>

            <div className="flex flex-1 flex-col">{children}</div>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </AppCommandBar>
  );
}
