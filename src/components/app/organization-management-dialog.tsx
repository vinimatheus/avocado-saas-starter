"use client"

import * as React from "react"
import {
  Building2Icon,
  CrownIcon,
  MailIcon,
  SendIcon,
  ShieldCheckIcon,
  Trash2Icon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"

import {
  deleteOrganizationSafelyAction,
  transferOrganizationOwnershipAction,
  updateOrganizationDetailsAction,
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
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
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
  organizationName: string
  organizationSlug: string | null
  currentUserId: string | null
  isOwner: boolean
  isAdmin: boolean
  members: OrganizationDialogMember[]
  pendingInvitations: OrganizationDialogInvitation[]
}

type OrganizationManagementSection = "organization" | "invites" | "members" | "ownership"
type AssignableRole = "admin" | "user"

function normalizeRoleLabel(role: string): string {
  const roleList = role
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)

  if (roleList.includes("owner")) {
    return "Owner"
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

  if (section === "members") {
    return "Membros"
  }

  if (section === "ownership") {
    return "Transferencia"
  }

  return "Convites"
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

export function OrganizationManagementDialog({
  open,
  onOpenChange,
  organizationName,
  organizationSlug,
  currentUserId,
  isOwner,
  isAdmin,
  members,
  pendingInvitations,
}: OrganizationManagementDialogProps) {
  const router = useRouter()
  const [inviteEmail, setInviteEmail] = React.useState("")
  const [inviteRole, setInviteRole] = React.useState<AssignableRole>("user")
  const [selectedSectionState, setSelectedSectionState] =
    React.useState<OrganizationManagementSection>("organization")

  const [organizationNameInput, setOrganizationNameInput] = React.useState(organizationName)
  const [organizationSlugInput, setOrganizationSlugInput] = React.useState(
    organizationSlug ?? toSlug(organizationName),
  )
  const [deleteConfirmationName, setDeleteConfirmationName] = React.useState("")

  const [isInvitePending, startInviteTransition] = React.useTransition()
  const [isTransferPending, startTransferTransition] = React.useTransition()
  const [isUpdateOrganizationPending, startUpdateOrganizationTransition] = React.useTransition()
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
  const [updateOrganizationState, updateOrganizationAction] = React.useActionState(
    updateOrganizationDetailsAction,
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

  const sections = React.useMemo(() => {
    const base: Array<{
      id: OrganizationManagementSection
      label: string
      icon: React.ComponentType<{ className?: string }>
    }> = [
      { id: "invites", label: "Convites", icon: UserPlusIcon },
    ]

    if (isOwner) {
      base.unshift({ id: "organization", label: "Organizacao", icon: Building2Icon })
      base.push(
        { id: "members", label: "Membros", icon: UsersIcon },
        { id: "ownership", label: "Transferencia", icon: CrownIcon },
      )
    }

    return base
  }, [isOwner])

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
            if (role === "Owner") {
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

  React.useEffect(() => {
    if (!open) {
      return
    }

    setOrganizationNameInput(organizationName)
    setOrganizationSlugInput(organizationSlug ?? toSlug(organizationName))
    setDeleteConfirmationName("")
  }, [open, organizationName, organizationSlug])

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
      updateOrganizationState.status === "success" ||
      deleteState.status === "success" ||
      updateMemberRoleState.status === "success" ||
      removeMemberState.status === "success"
    ) {
      router.refresh()
    }

    if (inviteState.status === "success") {
      setInviteEmail("")
    }
  }, [
    deleteState.redirectTo,
    deleteState.status,
    inviteState.status,
    onOpenChange,
    removeMemberState.status,
    router,
    transferState.status,
    updateMemberRoleState.status,
    updateOrganizationState.status,
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

  if (!isAdmin) {
    return null
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-h-[calc(100vh-2rem)] sm:max-w-[calc(100vw-2rem)] md:h-[72vh] md:max-h-[72vh] md:min-h-0 md:w-[920px] md:max-w-[920px]">
        <DialogTitle className="sr-only">Gerenciar organizacao</DialogTitle>
        <DialogDescription className="sr-only">
          Configure dados da organizacao, convites, membros e ownership da organizacao ativa.
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

            <div
              className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-4 overflow-y-auto p-4"
              style={{ scrollbarGutter: "stable" }}
            >
              <div className="space-y-1">
                <p className="text-sm font-medium">{organizationName}</p>
                <p className="text-muted-foreground text-xs">
                  {isOwner
                    ? "Owner: gerencie organizacao, convites, membros e transferencia."
                    : "Administrador: apenas convites de membros."}
                </p>
              </div>

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
                    </div>
                  </div>

                  {isOwner ? (
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
                        placeholder="Nome da empresa"
                        required
                      />
                      <Input
                        value={organizationSlugInput}
                        onChange={(event) => {
                          setOrganizationSlugInput(toSlug(event.target.value))
                        }}
                        placeholder="slug-da-empresa"
                        required
                      />
                      <Button type="submit" size="sm" disabled={isUpdateOrganizationPending}>
                        <ShieldCheckIcon data-icon="inline-start" />
                        {isUpdateOrganizationPending ? "Salvando..." : "Salvar organizacao"}
                      </Button>
                    </form>
                  ) : (
                    <div className="text-muted-foreground rounded-lg border p-3 text-xs">
                      Apenas o owner pode alterar nome e slug da organizacao.
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
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={submitDeleteOrganization}
                          disabled={
                            isDeletePending || deleteConfirmationName.trim() !== organizationName
                          }
                        >
                          <Trash2Icon data-icon="inline-start" />
                          {isDeletePending ? "Excluindo..." : "Excluir organizacao"}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {selectedSection === "invites" ? (
                <div className="space-y-4">
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
                      placeholder="novo-membro@empresa.com"
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

                  <div className="space-y-2 rounded-lg border p-3">
                    <p className="text-xs font-medium">Convites pendentes</p>
                    {pendingInvitations.length === 0 ? (
                      <p className="text-muted-foreground text-xs">Nenhum convite pendente.</p>
                    ) : (
                      pendingInvitations.map((invitation) => (
                        <div key={invitation.id} className="flex items-center justify-between gap-3 rounded-md border p-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium">{invitation.email}</p>
                            <p className="text-muted-foreground text-[11px]">
                              {normalizeRoleLabel(invitation.role)} - Expira em {formatDate(invitation.expiresAt)}
                            </p>
                          </div>
                          <MailIcon className="text-muted-foreground size-3.5 shrink-0" />
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : null}

              {selectedSection === "members" ? (
                <div className="space-y-2 rounded-lg border p-3">
                  <p className="text-xs font-medium">Membros da organizacao</p>
                  {sortedMembers.map((member) => (
                    <div key={member.id} className="flex items-center justify-between gap-3 rounded-md border p-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">{member.name}</p>
                        <p className="text-muted-foreground truncate text-[11px]">{member.email}</p>
                      </div>
                      <span className="text-muted-foreground shrink-0 text-[11px]">
                        {normalizeRoleLabel(member.role)}
                      </span>
                      {member.role === "owner" ? (
                        <span className="text-muted-foreground shrink-0 text-[11px]">
                          Transferencia para alterar owner
                        </span>
                      ) : (
                        <div className="flex shrink-0 items-center gap-2">
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
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}

              {selectedSection === "ownership" ? (
                <div className="space-y-3 rounded-lg border p-3">
                  <p className="text-xs font-medium">Transferencia de organizacao</p>
                  <p className="text-muted-foreground text-xs">Selecione o novo owner da empresa.</p>

                  {transferCandidates.length === 0 ? (
                    <p className="text-muted-foreground text-xs">
                      Convide ao menos mais um membro para transferir ownership.
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
                        {isTransferPending ? "Transferindo..." : "Transferir ownership"}
                      </Button>
                    </div>
                  )}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <FormFeedback state={inviteState} showInline={false} />
                <FormFeedback state={transferState} showInline={false} />
                <FormFeedback state={updateOrganizationState} showInline={false} />
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
