"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronUpIcon, LogOutIcon, SlidersHorizontalIcon, UserRoundIcon } from "lucide-react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { signOut } from "@/lib/auth/client";
import { localizeAuthErrorMessage } from "@/lib/auth/error-messages";
import type { OrganizationUserRole } from "@/lib/organization/helpers";

type AppUserMenuProps = {
  role: OrganizationUserRole;
  userName?: string | null;
  userImage?: string | null;
};

function roleLabel(role: OrganizationUserRole): string {
  if (role === "owner") {
    return "Proprietario";
  }

  return role === "admin" ? "Administrador" : "Usuario";
}

function initialsFromUserName(userName: string | null | undefined, role: OrganizationUserRole): string {
  const trimmedName = userName?.trim() ?? "";
  if (!trimmedName) {
    return role === "owner" ? "OW" : role === "admin" ? "AD" : "US";
  }

  const parts = trimmedName.split(/\s+/).filter(Boolean);
  const firstInitial = parts[0]?.[0] ?? "";
  const lastInitial = parts[1]?.[0] ?? "";
  const initials = `${firstInitial}${lastInitial}`.toUpperCase();

  if (initials) {
    return initials;
  }

  return role === "owner" ? "OW" : role === "admin" ? "AD" : "US";
}

function normalizeUserImage(userImage: string | null | undefined): string | null {
  const normalizedImage = userImage?.trim() ?? "";
  return normalizedImage || null;
}

export function AppUserMenu({ role, userName = null, userImage = null }: AppUserMenuProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [failedImageSrc, setFailedImageSrc] = useState<string | null>(null);
  const normalizedUserImage = normalizeUserImage(userImage);
  const showImageAvatar = Boolean(normalizedUserImage) && failedImageSrc !== normalizedUserImage;

  function handleSignOut(): void {
    startTransition(async () => {
      const result = await signOut();
      if (result.error) {
        toast.error(localizeAuthErrorMessage(result.error.message ?? "Nao foi possivel encerrar a sessao."));
        return;
      }

      toast.success("Logout realizado com sucesso.");
      router.replace("/sign-in");
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="lg"
          className="group-data-[collapsible=icon]:justify-center"
          tooltip="Conta"
        >
          <div className="border-sidebar-border/60 bg-sidebar-primary text-sidebar-primary-foreground relative flex size-8 items-center justify-center overflow-hidden rounded-full border text-[11px] font-semibold">
            {showImageAvatar && normalizedUserImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={normalizedUserImage}
                alt={`Foto de ${userName || "Usuario"}`}
                className="size-full object-cover"
                onError={() => {
                  setFailedImageSrc(normalizedUserImage);
                }}
              />
            ) : (
              initialsFromUserName(userName, role)
            )}
          </div>
          <div className="grid flex-1 text-left text-xs leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate font-medium">{userName || "Usuario"}</span>
            <span className="text-muted-foreground truncate text-[0.7rem]">{roleLabel(role)}</span>
          </div>
          <ChevronUpIcon className="text-muted-foreground size-3.5 group-data-[collapsible=icon]:hidden" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" side="top">
        <DropdownMenuItem asChild>
          <Link href="/configuracoes" className="flex items-center gap-2">
            <SlidersHorizontalIcon className="size-3.5" />
            Configuracoes
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profile" className="flex items-center gap-2">
            <UserRoundIcon className="size-3.5" />
            Perfil
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={isPending}
          onSelect={(event) => {
            event.preventDefault();
            handleSignOut();
          }}
        >
          <LogOutIcon className="size-3.5" />
          {isPending ? "Saindo..." : "Sair"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
