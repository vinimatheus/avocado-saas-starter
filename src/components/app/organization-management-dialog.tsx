"use client"

import * as React from "react"
import {
  Building2Icon,
  CreditCardIcon,
  CrownIcon,
  ImageUpIcon,
  MailIcon,
  SendIcon,
  ShieldCheckIcon,
  Trash2Icon,
  UsersIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"

import {
  deleteOrganizationSafelyAction,
  removeOrganizationLogoAction,
  transferOrganizationOwnershipAction,
  updateOrganizationDetailsAction,
  updateOrganizationLogoAction,
  updateOrganizationPermissionsAction,
} from "@/actions/organization-governance-actions"
import {
  inviteOrganizationUserAction,
  removeOrganizationMemberAction,
  updateOrganizationMemberRoleAction,
} from "@/actions/organization-user-actions"
import { initialOrganizationUserActionState } from "@/actions/organization-user-action-state"
import { FormFeedback } from "@/components/shared/form-feedback"
import { Logo } from "@/components/shared/logo"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { Switch } from "@/components/ui/switch"
import type { OrganizationUserRole } from "@/lib/organization/helpers"
import {
  canRoleCreateUsers,
  canRoleDeleteUsers,
  canRoleReadUsers,
  canRoleUpdateUsers,
  ownerPermissions,
  resolveOrganizationPermissions,
  type OrganizationPermissions,
  type PermissionAction,
  type PermissionResource,
} from "@/lib/organization/permissions"

type OrganizationDialogMember = {
  id: string
  userId: string
  name: string
  email: string
  role: string
}

type OrganizationDialogInvitation = {
  id: string
  email: string
  role: string
  createdAt: string
  expiresAt: string
}

type OrganizationManagementDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOrganizationLogoUpdated?: (logoUrl: string | null) => void
  organizationName: string
  organizationSlug: string | null
  organizationLogo: string | null
  planCode: "FREE" | "STARTER_50" | "PRO_100" | "SCALE_400"
  planName: string
  currentUserId: string | null
  role: OrganizationUserRole
  isOwner: boolean
  isAdmin: boolean
  permissions: OrganizationPermissions
  members: OrganizationDialogMember[]
  pendingInvitations: OrganizationDialogInvitation[]
}

type OrganizationManagementSection = "organization" | "plan" | "access"
type AccessPanel = "invites" | "members" | "ownership"
type AssignableRole = "admin" | "user"
type EditablePermissionRole = "admin" | "user"

const PERMISSION_ACTIONS: PermissionAction[] = ["create", "read", "update", "delete"]
const PERMISSION_ACTION_LABELS: Record<PermissionAction, string> = {
  create: "Criar",
  read: "Ler",
  update: "Atualizar",
  delete: "Excluir",
}

const PERMISSION_RESOURCES: PermissionResource[] = ["products", "users"]
const PERMISSION_RESOURCE_LABELS: Record<PermissionResource, string> = {
  products: "Produtos",
  users: "Usuarios",
}

const PERMISSION_ROLE_LABELS: Record<EditablePermissionRole | "owner", string> = {
  owner: "Owner",
  admin: "Admin",
  user: "User",
}

function normalizeRoleLabel(role: string): string {
  const roleList = role
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)

  if (roleList.includes("owner")) {
    return "Proprietario"
  }

  if (roleList.includes("admin")) {
    return "Administrador"
  }

  return "Usuario"
}

function formatDate(value: string): string {
  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) {
    return "-"
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsedDate)
}

function sectionLabel(section: OrganizationManagementSection): string {
  if (section === "organization") {
    return "Organizacao"
  }

  if (section === "plan") {
    return "Plano"
  }

  return "Acesso"
}

function toSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70)
}

function permissionsInputFromProps(permissions: OrganizationPermissions): OrganizationPermissions {
  return {
    admin: {
      products: { ...permissions.admin.products },
      users: { ...permissions.admin.users },
    },
    user: {
      products: { ...permissions.user.products },
      users: { ...permissions.user.users },
    },
  }
}

export function OrganizationManagementDialog({
  open,
  onOpenChange,
  onOrganizationLogoUpdated,
  organizationName,
  organizationSlug,
  organizationLogo,
  planCode,
  planName,
  currentUserId,
  role,
  isOwner,
  isAdmin,
  permissions,
  members,
  pendingInvitations,
}: OrganizationManagementDialogProps) {
  const router = useRouter()
  const [inviteEmail, setInviteEmail] = React.useState("")
  const [inviteRole, setInviteRole] = React.useState<AssignableRole>("user")
  const [selectedSectionState, setSelectedSectionState] =
    React.useState<OrganizationManagementSection>("organization")
  const [selectedAccessPanelState, setSelectedAccessPanelState] = React.useState<AccessPanel>("invites")

  const [organizationNameInput, setOrganizationNameInput] = React.useState(organizationName)
  const [organizationSlugInput, setOrganizationSlugInput] = React.useState(
    organizationSlug ?? toSlug(organizationName),
  )
  const [permissionsInput, setPermissionsInput] = React.useState<OrganizationPermissions>(
    resolveOrganizationPermissions(permissionsInputFromProps(permissions)),
  )
  const [deleteConfirmationName, setDeleteConfirmationName] = React.useState("")
  const [isDeleteConfirmationDialogOpen, setIsDeleteConfirmationDialogOpen] = React.useState(false)

  const [isInvitePending, startInviteTransition] = React.useTransition()
  const [isTransferPending, startTransferTransition] = React.useTransition()
  const [isUpdatePermissionsPending, startUpdatePermissionsTransition] = React.useTransition()
  const [isUpdateOrganizationPending, startUpdateOrganizationTransition] = React.useTransition()
  const [isUpdateOrganizationLogoPending, startUpdateOrganizationLogoTransition] = React.useTransition()
  const [isRemoveOrganizationLogoPending, startRemoveOrganizationLogoTransition] = React.useTransition()
  const [isDeletePending, startDeleteTransition] = React.useTransition()
  const [isUpdateMemberRolePending, startUpdateMemberRoleTransition] = React.useTransition()
  const [isRemoveMemberPending, startRemoveMemberTransition] = React.useTransition()

  const [inviteState, inviteAction] = React.useActionState(
    inviteOrganizationUserAction,
    initialOrganizationUserActionState,
  )
  const [transferState, transferAction] = React.useActionState(
    transferOrganizationOwnershipAction,
    initialOrganizationUserActionState,
  )
  const [updatePermissionsState, updatePermissionsActionState] = React.useActionState(
    updateOrganizationPermissionsAction,
    initialOrganizationUserActionState,
  )
  const [updateOrganizationState, updateOrganizationAction] = React.useActionState(
    updateOrganizationDetailsAction,
    initialOrganizationUserActionState,
  )
  const [updateOrganizationLogoState, updateOrganizationLogoActionState] = React.useActionState(
    updateOrganizationLogoAction,
    initialOrganizationUserActionState,
  )
  const [removeOrganizationLogoState, removeOrganizationLogoActionState] = React.useActionState(
    removeOrganizationLogoAction,
    initialOrganizationUserActionState,
  )
  const [deleteState, deleteAction] = React.useActionState(
    deleteOrganizationSafelyAction,
    initialOrganizationUserActionState,
  )
  const [updateMemberRoleState, updateMemberRoleAction] = React.useActionState(
    updateOrganizationMemberRoleAction,
    initialOrganizationUserActionState,
  )
  const [removeMemberState, removeMemberAction] = React.useActionState(
    removeOrganizationMemberAction,
    initialOrganizationUserActionState,
  )
  const canCreateUsers = canRoleCreateUsers(role, permissions)
  const canReadUsers = canRoleReadUsers(role, permissions)
  const canUpdateUsers = canRoleUpdateUsers(role, permissions)
  const canDeleteUsers = canRoleDeleteUsers(role, permissions)
  const canAccessUsersSection = isOwner || canCreateUsers || canReadUsers || canUpdateUsers || canDeleteUsers
  const canAccessDialog = isAdmin || canAccessUsersSection

  const sections = React.useMemo(() => {
    const base: Array<{
      id: OrganizationManagementSection
      label: string
      icon: React.ComponentType<{ className?: string }>
    }> = []

    if (isOwner) {
      base.push({ id: "organization", label: "Organizacao", icon: Building2Icon })
    }

    if (isAdmin) {
      base.push({ id: "plan", label: "Plano", icon: CreditCardIcon })
    }

    if (canAccessUsersSection) {
      base.push({ id: "access", label: "Acesso", icon: UsersIcon })
    }

    return base
  }, [canAccessUsersSection, isAdmin, isOwner])

  const accessPanels = React.useMemo(
    () =>
      (
        [
          ...(canCreateUsers || canReadUsers ? [{ id: "invites", label: "Convites", icon: MailIcon }] : []),
          ...(isOwner || canReadUsers || canUpdateUsers || canDeleteUsers
            ? [{ id: "members", label: "Membros", icon: UsersIcon }]
            : []),
          ...(isOwner ? [{ id: "ownership", label: "Transferencia", icon: CrownIcon }] : []),
        ] as Array<{
          id: AccessPanel
          label: string
          icon: React.ComponentType<{ className?: string }>
        }>
      ).filter(Boolean),
    [canCreateUsers, canDeleteUsers, canReadUsers, canUpdateUsers, isOwner],
  )

  const selectedAccessPanel = React.useMemo(() => {
    if (accessPanels.some((panel) => panel.id === selectedAccessPanelState)) {
      return selectedAccessPanelState
    }

    return accessPanels[0]?.id ?? "invites"
  }, [accessPanels, selectedAccessPanelState])

  const selectedSection = React.useMemo(() => {
    if (sections.some((section) => section.id === selectedSectionState)) {
      return selectedSectionState
    }

    return sections[0]?.id ?? "organization"
  }, [sections, selectedSectionState])

  const transferCandidates = React.useMemo(
    () => members.filter((member) => member.userId !== currentUserId),
    [currentUserId, members],
  )
  const [transferTargetMemberIdState, setTransferTargetMemberIdState] = React.useState("")
  const transferTargetMemberId = React.useMemo(() => {
    if (transferCandidates.some((member) => member.id === transferTargetMemberIdState)) {
      return transferTargetMemberIdState
    }

    return transferCandidates[0]?.id ?? ""
  }, [transferCandidates, transferTargetMemberIdState])

  const sortedMembers = React.useMemo(
    () =>
      members
        .slice()
        .sort((left, right) => {
          const leftRole = normalizeRoleLabel(left.role)
          const rightRole = normalizeRoleLabel(right.role)

          if (leftRole === rightRole) {
            return left.name.localeCompare(right.name)
          }

          const rank = (role: string) => {
            if (role === "Proprietario") {
              return 0
            }

            if (role === "Administrador") {
              return 1
            }

            return 2
          }

          return rank(leftRole) - rank(rightRole)
        }),
    [members],
  )
  const [failedOrganizationLogoSrc, setFailedOrganizationLogoSrc] = React.useState<string | null>(null)
  const organizationLogoFormRef = React.useRef<HTMLFormElement>(null)
  const normalizedOrganizationLogo = React.useMemo(() => {
    const value = organizationLogo?.trim() ?? ""
    return value || null
  }, [organizationLogo])
  const showOrganizationLogo =
    Boolean(normalizedOrganizationLogo) && failedOrganizationLogoSrc !== normalizedOrganizationLogo

  React.useEffect(() => {
    if (!open) {
      return
    }

    setOrganizationNameInput(organizationName)
    setOrganizationSlugInput(organizationSlug ?? toSlug(organizationName))
    setPermissionsInput(permissionsInputFromProps(permissions))
    setDeleteConfirmationName("")
    setIsDeleteConfirmationDialogOpen(false)
    setSelectedAccessPanelState("invites")
    setFailedOrganizationLogoSrc(null)
    organizationLogoFormRef.current?.reset()
  }, [open, organizationName, organizationSlug, permissions])

  React.useEffect(() => {
    if (deleteState.redirectTo) {
      onOpenChange(false)
      router.replace(deleteState.redirectTo)
      router.refresh()
      return
    }

    if (
      inviteState.status === "success" ||
      transferState.status === "success" ||
      updatePermissionsState.status === "success" ||
      updateOrganizationState.status === "success" ||
      updateOrganizationLogoState.status === "success" ||
      removeOrganizationLogoState.status === "success" ||
      deleteState.status === "success" ||
      updateMemberRoleState.status === "success" ||
      removeMemberState.status === "success"
    ) {
      router.refresh()
    }

    if (inviteState.status === "success") {
      setInviteEmail("")
    }

    if (updateOrganizationLogoState.status === "success") {
      organizationLogoFormRef.current?.reset()

      const updatedLogoUrl = updateOrganizationLogoState.organizationLogoUrl?.trim() ?? ""
      if (updatedLogoUrl) {
        setFailedOrganizationLogoSrc(null)
        onOrganizationLogoUpdated?.(updatedLogoUrl)
      }
    }

    if (removeOrganizationLogoState.status === "success") {
      organizationLogoFormRef.current?.reset()
      setFailedOrganizationLogoSrc(null)
      onOrganizationLogoUpdated?.(null)
    }
  }, [
    deleteState.redirectTo,
    deleteState.status,
    inviteState.status,
    onOpenChange,
    removeOrganizationLogoState.status,
    removeMemberState.status,
    router,
    transferState.status,
    updatePermissionsState.status,
    updateMemberRoleState.status,
    updateOrganizationLogoState.organizationLogoUrl,
    updateOrganizationLogoState.status,
    updateOrganizationState.status,
    onOrganizationLogoUpdated,
  ])

  function submitInvite(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()

    const payload = new FormData()
    payload.set("email", inviteEmail.trim())
    payload.set("role", isOwner ? inviteRole : "user")

    startInviteTransition(() => {
      inviteAction(payload)
    })
  }

  function submitOrganizationPermissions(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()

    const payload = new FormData()
    payload.set("permissions", JSON.stringify(permissionsInput))

    startUpdatePermissionsTransition(() => {
      updatePermissionsActionState(payload)
    })
  }

  function togglePermission(
    targetRole: EditablePermissionRole,
    resource: PermissionResource,
    action: PermissionAction,
    checked: boolean,
  ): void {
    setPermissionsInput((current) => ({
      ...current,
      [targetRole]: {
        ...current[targetRole],
        [resource]: {
          ...current[targetRole][resource],
          [action]: checked,
        },
      },
    }))
  }

  function submitOwnershipTransfer(): void {
    if (!transferTargetMemberId) {
      return
    }

    const payload = new FormData()
    payload.set("targetMemberId", transferTargetMemberId)

    startTransferTransition(() => {
      transferAction(payload)
    })
  }

  function submitOrganizationUpdate(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()

    const payload = new FormData()
    payload.set("name", organizationNameInput.trim())
    payload.set("slug", organizationSlugInput.trim().toLowerCase())

    startUpdateOrganizationTransition(() => {
      updateOrganizationAction(payload)
    })
  }

  function submitOrganizationLogoUpdate(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()

    const payload = new FormData(event.currentTarget)
    startUpdateOrganizationLogoTransition(() => {
      updateOrganizationLogoActionState(payload)
    })
  }

  function submitOrganizationLogoRemoval(): void {
    const payload = new FormData()
    startRemoveOrganizationLogoTransition(() => {
      removeOrganizationLogoActionState(payload)
    })
  }

  function submitDeleteOrganization(): void {
    const payload = new FormData()
    payload.set("organizationName", deleteConfirmationName.trim())

    startDeleteTransition(() => {
      deleteAction(payload)
    })
  }

  function toAssignableRole(value: string): AssignableRole {
    return value === "admin" ? "admin" : "user"
  }

  function submitMemberRoleUpdate(memberId: string, role: AssignableRole): void {
    const payload = new FormData()
    payload.set("memberId", memberId)
    payload.set("role", role)

    startUpdateMemberRoleTransition(() => {
      updateMemberRoleAction(payload)
    })
  }

  function submitRemoveMember(memberId: string, userId: string): void {
    const payload = new FormData()
    payload.set("memberId", memberId)
    payload.set("targetUserId", userId)

    startRemoveMemberTransition(() => {
      removeMemberAction(payload)
    })
  }

  if (!canAccessDialog) {
    return null
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-h-[calc(100vh-2rem)] sm:max-w-[calc(100vw-2rem)] md:h-[72vh] md:max-h-[72vh] md:min-h-0 md:w-[920px] md:max-w-[920px]">
        <DialogTitle className="sr-only">Gerenciar organizacao</DialogTitle>
        <DialogDescription className="sr-only">
          Configure dados da organizacao, plano e acessos da organizacao ativa.
        </DialogDescription>

        <SidebarProvider
          className="h-full min-h-0 items-start overflow-hidden"
          style={{ "--sidebar-width": "11rem" } as React.CSSProperties}
        >
          <Sidebar collapsible="none" className="hidden border-r md:flex">
            <SidebarHeader>
              <div className="px-2 py-1">
                <Logo size="sm" showText showGlow={false} />
              </div>
            </SidebarHeader>
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {sections.map((section) => (
                      <SidebarMenuItem key={section.id}>
                        <SidebarMenuButton
                          isActive={selectedSection === section.id}
                          onClick={() => {
                            setSelectedSectionState(section.id)
                          }}
                        >
                          <section.icon />
                          <span>{section.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
          </Sidebar>

          <main className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem className="hidden md:block">
                    <BreadcrumbLink href="#">Organizacao</BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="hidden md:block" />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{sectionLabel(selectedSection)}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </header>

            <nav
              aria-label="Secoes de gerenciamento"
              className="border-b px-3 py-2 md:hidden"
            >
              <div className="flex gap-1 overflow-x-auto">
                {sections.map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => {
                      setSelectedSectionState(section.id)
                    }}
                    className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs whitespace-nowrap transition-colors ${
                      selectedSection === section.id
                        ? "bg-background text-foreground border-border shadow-sm"
                        : "text-muted-foreground border-transparent hover:text-foreground"
                    }`}
                  >
                    <section.icon className="size-3.5" />
                    <span>{section.label}</span>
                  </button>
                ))}
              </div>
            </nav>

            <div
              className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-4 overflow-y-auto p-4"
              style={{ scrollbarGutter: "stable" }}
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{organizationName}</p>
                  <Badge variant={planCode === "FREE" ? "secondary" : "default"}>{planName}</Badge>
                </div>
                <p className="text-muted-foreground text-xs">
                  {isOwner
                    ? "Proprietario: gerencie organizacao e todo o acesso de membros em um unico lugar."
                    : isAdmin
                      ? "Administrador: visualize plano e gerencie convites em uma area unica de acesso."
                      : "Membro com RBAC ativo: seu acesso segue a matriz CRUD definida pelo owner."}
                </p>
              </div>

              {selectedSection === "plan" ? (
                <div className="space-y-4">
                  <div className="space-y-2 rounded-lg border p-3">
                    <p className="text-xs font-medium">Plano atual</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={planCode === "FREE" ? "secondary" : "default"}>{planName}</Badge>
                      <p className="text-muted-foreground text-xs">Plano vinculado a esta organizacao.</p>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-lg border p-3">
                    <p className="text-xs font-medium">Gerenciar plano</p>
                    <p className="text-muted-foreground text-xs">
                      {isOwner
                        ? "Abra a pagina de plano para upgrade, downgrade e historico de pagamentos."
                        : "Somente o proprietario pode gerenciar alteracoes de plano."}
                    </p>
                    {isOwner ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          onOpenChange(false)
                          router.push("/billing")
                        }}
                      >
                        <CreditCardIcon data-icon="inline-start" />
                        Abrir pagina de plano
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {selectedSection === "organization" ? (
                <div className="space-y-4">
                  <div className="space-y-2 rounded-lg border p-3">
                    <p className="text-xs font-medium">Dados atuais</p>
                    <div className="space-y-1 text-xs">
                      <p>
                        <span className="text-muted-foreground">Nome:</span> {organizationName}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Slug:</span>{" "}
                        {organizationSlug || toSlug(organizationName)}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Imagem:</span>{" "}
                        {normalizedOrganizationLogo ? "Configurada" : "Nao configurada"}
                      </p>
                    </div>
                  </div>

                  {isOwner ? (
                    <>
                      <form onSubmit={submitOrganizationUpdate} className="space-y-3 rounded-lg border p-3">
                        <p className="text-xs font-medium">Atualizar organizacao</p>
                        <Input
                          value={organizationNameInput}
                          onChange={(event) => {
                            const value = event.target.value
                            setOrganizationNameInput(value)
                            if (!organizationSlugInput) {
                              setOrganizationSlugInput(toSlug(value))
                            }
                          }}
                          placeholder="Nome da organizacao"
                          required
                        />
                        <Input
                          value={organizationSlugInput}
                          onChange={(event) => {
                            setOrganizationSlugInput(toSlug(event.target.value))
                          }}
                          placeholder="slug-da-organizacao"
                          required
                        />
                        <Button type="submit" size="sm" disabled={isUpdateOrganizationPending}>
                          <ShieldCheckIcon data-icon="inline-start" />
                          {isUpdateOrganizationPending ? "Salvando..." : "Salvar organizacao"}
                        </Button>
                      </form>

                      <form
                        ref={organizationLogoFormRef}
                        onSubmit={submitOrganizationLogoUpdate}
                        className="space-y-3 rounded-lg border p-3"
                      >
                        <p className="text-xs font-medium">Imagem da organizacao</p>
                        <div className="flex items-center gap-3">
                          <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center overflow-hidden rounded-md border">
                            {showOrganizationLogo && normalizedOrganizationLogo ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={normalizedOrganizationLogo}
                                alt={`Imagem de ${organizationName}`}
                                className="size-full object-cover"
                                onError={() => {
                                  setFailedOrganizationLogoSrc(normalizedOrganizationLogo)
                                }}
                              />
                            ) : (
                              <Building2Icon className="size-5" />
                            )}
                          </div>
                          <p className="text-muted-foreground text-xs">
                            Envie PNG, JPG ou WEBP com ate 5 MB.
                          </p>
                        </div>
                        <Input name="image" type="file" accept="image/*" required />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="submit"
                            size="sm"
                            disabled={isUpdateOrganizationLogoPending || isRemoveOrganizationLogoPending}
                          >
                            <ImageUpIcon data-icon="inline-start" />
                            {isUpdateOrganizationLogoPending ? "Enviando..." : "Salvar imagem"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={submitOrganizationLogoRemoval}
                            disabled={
                              isUpdateOrganizationLogoPending ||
                              isRemoveOrganizationLogoPending ||
                              !normalizedOrganizationLogo
                            }
                          >
                            <Trash2Icon data-icon="inline-start" />
                            {isRemoveOrganizationLogoPending ? "Removendo..." : "Remover imagem"}
                          </Button>
                        </div>
                      </form>
                    </>
                  ) : (
                    <div className="text-muted-foreground rounded-lg border p-3 text-xs">
                      Apenas o proprietario pode alterar nome, slug e imagem da organizacao.
                    </div>
                  )}

                  {isOwner ? (
                    <div className="border-destructive/30 bg-destructive/5 space-y-3 rounded-lg border p-3">
                      <p className="text-xs font-medium">Excluir organizacao</p>
                      <p className="text-muted-foreground text-xs">
                        Digite <strong>{organizationName}</strong> para confirmar exclusao permanente.
                      </p>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Input
                          value={deleteConfirmationName}
                          onChange={(event) => {
                            setDeleteConfirmationName(event.target.value)
                          }}
                          placeholder={organizationName}
                        />
                        <AlertDialog
                          open={isDeleteConfirmationDialogOpen}
                          onOpenChange={setIsDeleteConfirmationDialogOpen}
                        >
                          <AlertDialogTrigger asChild>
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              disabled={
                                isDeletePending || deleteConfirmationName.trim() !== organizationName
                              }
                            >
                              <Trash2Icon data-icon="inline-start" />
                              {isDeletePending ? "Excluindo..." : "Excluir organizacao"}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Confirmar exclusao da organizacao</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta acao e permanente e vai excluir <strong>{organizationName}</strong>.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel disabled={isDeletePending}>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                variant="destructive"
                                onClick={submitDeleteOrganization}
                                disabled={isDeletePending}
                              >
                                {isDeletePending ? "Excluindo..." : "Confirmar exclusao"}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {selectedSection === "access" ? (
                <div className="space-y-4">
                  {isOwner ? (
                    <form onSubmit={submitOrganizationPermissions} className="space-y-3 rounded-lg border p-3">
                      <p className="text-xs font-medium">Permissoes RBAC (CRUD)</p>
                      <p className="text-muted-foreground text-[11px]">
                        Owner sempre tem acesso total. Ajuste abaixo apenas User e Admin para esta organizacao.
                      </p>
                      <div className="space-y-3">
                        {PERMISSION_RESOURCES.map((resource) => (
                          <div key={resource} className="space-y-2 rounded-md border p-2">
                            <p className="text-xs font-medium">{PERMISSION_RESOURCE_LABELS[resource]}</p>
                            <div className="overflow-x-auto">
                              <div className="grid min-w-[480px] grid-cols-[110px_repeat(4,minmax(74px,1fr))] gap-1 text-[11px]">
                                <span className="text-muted-foreground px-2 py-1 font-medium">Papel</span>
                                {PERMISSION_ACTIONS.map((action) => (
                                  <span key={action} className="text-muted-foreground px-2 py-1 text-center font-medium">
                                    {PERMISSION_ACTION_LABELS[action]}
                                  </span>
                                ))}

                                <span className="px-2 py-1 font-medium">{PERMISSION_ROLE_LABELS.owner}</span>
                                {PERMISSION_ACTIONS.map((action) => (
                                  <span
                                    key={`owner-${resource}-${action}`}
                                    className="bg-muted text-foreground rounded px-2 py-1 text-center"
                                  >
                                    {ownerPermissions[resource][action] ? "Sempre" : "-"}
                                  </span>
                                ))}

                                {(["admin", "user"] as EditablePermissionRole[]).map((targetRole) => (
                                  <React.Fragment key={`${resource}-${targetRole}`}>
                                    <span className="px-2 py-1 font-medium">{PERMISSION_ROLE_LABELS[targetRole]}</span>
                                    {PERMISSION_ACTIONS.map((action) => (
                                      <span
                                        key={`${targetRole}-${resource}-${action}`}
                                        className="flex items-center justify-center px-2 py-1"
                                      >
                                        <Switch
                                          checked={permissionsInput[targetRole][resource][action]}
                                          onCheckedChange={(checked) => {
                                            togglePermission(targetRole, resource, action, Boolean(checked))
                                          }}
                                          disabled={isUpdatePermissionsPending}
                                        />
                                      </span>
                                    ))}
                                  </React.Fragment>
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <Button type="submit" size="sm" disabled={isUpdatePermissionsPending}>
                        <ShieldCheckIcon data-icon="inline-start" />
                        {isUpdatePermissionsPending ? "Salvando..." : "Salvar permissoes"}
                      </Button>
                    </form>
                  ) : null}

                  {canCreateUsers ? (
                    <form
                      onSubmit={submitInvite}
                      className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_auto_auto]"
                    >
                      <Input
                        value={inviteEmail}
                        onChange={(event) => {
                          setInviteEmail(event.target.value)
                        }}
                        type="email"
                        placeholder="novo-membro@organizacao.com"
                        required
                      />
                      {isOwner ? (
                        <select
                          className="border-input bg-background h-7 rounded-md border px-2 text-xs"
                          value={inviteRole}
                          onChange={(event) => {
                            setInviteRole(event.target.value === "admin" ? "admin" : "user")
                          }}
                        >
                          <option value="user">Usuario</option>
                          <option value="admin">Administrador</option>
                        </select>
                      ) : null}
                      <Button type="submit" size="sm" disabled={isInvitePending}>
                        <SendIcon data-icon="inline-start" />
                        {isInvitePending ? "Enviando..." : "Convidar"}
                      </Button>
                    </form>
                  ) : (
                    <div className="text-muted-foreground rounded-lg border p-3 text-xs">
                      Sua conta nao tem permissao para enviar convites nesta organizacao.
                    </div>
                  )}

                  <div className="space-y-3 rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-medium">Acesso centralizado</p>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="outline" className="text-[11px]">
                          {sortedMembers.length} membros
                        </Badge>
                        <Badge variant="outline" className="text-[11px]">
                          {pendingInvitations.length} convites
                        </Badge>
                      </div>
                    </div>

                    <div className="bg-muted/40 inline-flex w-full flex-wrap gap-1 rounded-md p-1">
                      {accessPanels.map((panel) => (
                        <button
                          key={panel.id}
                          type="button"
                          onClick={() => {
                            setSelectedAccessPanelState(panel.id)
                          }}
                          className={`inline-flex h-7 items-center gap-1.5 rounded-sm px-2 text-xs transition-colors ${
                            selectedAccessPanel === panel.id
                              ? "bg-background text-foreground border border-border shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <panel.icon className="size-3.5" />
                          {panel.label}
                        </button>
                      ))}
                    </div>

                    {selectedAccessPanel === "invites" ? (
                      <div className="space-y-2">
                        <p className="text-xs font-medium">Convites pendentes</p>
                        {!canReadUsers && !isOwner ? (
                          <p className="text-muted-foreground text-xs">
                            Voce pode enviar convites, mas nao tem permissao para visualizar a lista.
                          </p>
                        ) : pendingInvitations.length === 0 ? (
                          <p className="text-muted-foreground text-xs">Nenhum convite pendente.</p>
                        ) : (
                          <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                            {pendingInvitations.map((invitation) => (
                              <div
                                key={invitation.id}
                                className="flex items-center justify-between gap-3 rounded-md border p-2"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-medium">{invitation.email}</p>
                                  <p className="text-muted-foreground text-[11px]">
                                    {normalizeRoleLabel(invitation.role)} - Expira em{" "}
                                    {formatDate(invitation.expiresAt)}
                                  </p>
                                </div>
                                <MailIcon className="text-muted-foreground size-3.5 shrink-0" />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null}

                    {selectedAccessPanel === "members" ? (
                      <div className="space-y-2">
                        <p className="text-xs font-medium">Membros da organizacao</p>
                        <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                          {sortedMembers.map((member) => (
                            <div
                              key={member.id}
                              className="flex flex-col gap-2 rounded-md border p-2 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-xs font-medium">{member.name}</p>
                                <p className="text-muted-foreground truncate text-[11px]">{member.email}</p>
                              </div>

                              {member.role === "owner" ? (
                                <span className="text-muted-foreground shrink-0 text-[11px]">
                                  Proprietario atual
                                </span>
                              ) : canUpdateUsers || canDeleteUsers ? (
                                <div className="flex shrink-0 items-center gap-2">
                                  {canUpdateUsers ? (
                                    <select
                                      className="border-input bg-background h-7 rounded-md border px-2 text-xs"
                                      value={toAssignableRole(member.role)}
                                      disabled={isUpdateMemberRolePending || isRemoveMemberPending}
                                      onChange={(event) => {
                                        submitMemberRoleUpdate(
                                          member.id,
                                          event.target.value === "admin" ? "admin" : "user",
                                        )
                                      }}
                                    >
                                      <option value="user">Usuario</option>
                                      <option value="admin">Administrador</option>
                                    </select>
                                  ) : (
                                    <span className="text-muted-foreground shrink-0 text-[11px]">
                                      {normalizeRoleLabel(member.role)}
                                    </span>
                                  )}

                                  {canDeleteUsers ? (
                                    <Button
                                      type="button"
                                      size="xs"
                                      variant="destructive"
                                      disabled={
                                        isUpdateMemberRolePending ||
                                        isRemoveMemberPending ||
                                        member.userId === currentUserId
                                      }
                                      onClick={() => {
                                        submitRemoveMember(member.id, member.userId)
                                      }}
                                    >
                                      Remover
                                    </Button>
                                  ) : null}
                                </div>
                              ) : (
                                <span className="text-muted-foreground shrink-0 text-[11px]">
                                  {normalizeRoleLabel(member.role)}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {selectedAccessPanel === "ownership" ? (
                      <div className="space-y-2">
                        <p className="text-xs font-medium">Transferencia de propriedade</p>
                        <p className="text-muted-foreground text-xs">
                          Selecione o novo proprietario da organizacao.
                        </p>
                        {transferCandidates.length === 0 ? (
                          <p className="text-muted-foreground text-xs">
                            Convide ao menos mais um membro para transferir propriedade.
                          </p>
                        ) : (
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <select
                              className="border-input bg-background h-7 flex-1 rounded-md border px-2 text-xs"
                              value={transferTargetMemberId}
                              onChange={(event) => {
                                setTransferTargetMemberIdState(event.target.value)
                              }}
                            >
                              {transferCandidates.map((member) => (
                                <option key={member.id} value={member.id}>
                                  {member.name} ({member.email})
                                </option>
                              ))}
                            </select>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={submitOwnershipTransfer}
                              disabled={isTransferPending || !transferTargetMemberId}
                            >
                              <ShieldCheckIcon data-icon="inline-start" />
                              {isTransferPending ? "Transferindo..." : "Transferir propriedade"}
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <FormFeedback state={inviteState} showInline={false} />
                <FormFeedback state={transferState} showInline={false} />
                <FormFeedback state={updatePermissionsState} showInline={false} />
                <FormFeedback state={updateOrganizationState} showInline={false} />
                <FormFeedback state={updateOrganizationLogoState} showInline={false} />
                <FormFeedback state={removeOrganizationLogoState} showInline={false} />
                <FormFeedback state={deleteState} showInline={false} />
                <FormFeedback state={updateMemberRoleState} showInline={false} />
                <FormFeedback state={removeMemberState} showInline={false} />
              </div>
            </div>
          </main>
        </SidebarProvider>
      </DialogContent>
    </Dialog>
  )
}
