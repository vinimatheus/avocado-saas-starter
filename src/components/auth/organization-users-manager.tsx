"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowUpDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  Columns3Icon,
  MoreHorizontalIcon,
  SearchIcon,
  UserPlusIcon,
  XIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";

import {
  cancelOrganizationInvitationAction,
  inviteOrganizationUserAction,
  removeOrganizationMemberAction,
  resendOrganizationInvitationAction,
  updateOrganizationMemberRoleAction,
} from "@/actions/organization-user-actions";
import { initialOrganizationUserActionState } from "@/actions/organization-user-action-state";
import { FormFeedback } from "@/components/shared/form-feedback";
import { FormSubmitButton } from "@/components/shared/form-submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { stripFieldRef } from "@/lib/forms/rhf";
import { isOrganizationOwnerRole, type OrganizationUserRole } from "@/lib/organization/helpers";
import { organizationInviteSchema, type OrganizationInviteValues } from "@/lib/users/schemas";
import { cn } from "@/lib/shared/utils";

type OrganizationMemberListItem = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "user";
  createdAt: string;
};

type OrganizationInvitationListItem = {
  id: string;
  email: string;
  role: "owner" | "admin" | "user";
  createdAt: string;
  expiresAt: string;
  inviterName: string | null;
  inviterEmail: string | null;
};

type OrganizationUsersManagerProps = {
  members: OrganizationMemberListItem[];
  pendingInvitations: OrganizationInvitationListItem[];
  currentUserId: string;
  currentUserRole: OrganizationUserRole | null;
};

type TeamAccessStatus = "active" | "pending";
type TeamAccessRole = "owner" | "admin" | "user";
type TeamAccessAssignableRole = "admin" | "user";

type TeamAccessRow = {
  id: string;
  kind: "member" | "invitation";
  name: string | null;
  email: string;
  role: TeamAccessRole;
  status: TeamAccessStatus;
  createdAt: string;
  expiresAt: string | null;
  inviter: string | null;
  memberId: string | null;
  targetUserId: string | null;
  invitationId: string | null;
};

type TeamAccessRowActionsProps = {
  row: TeamAccessRow;
  currentUserId: string;
  currentUserRole: OrganizationUserRole | null;
  onUpdateRole: (memberId: string, role: TeamAccessAssignableRole) => void;
  onRemoveMember: (memberId: string, targetUserId: string) => void;
  onResendInvitation: (email: string, role: TeamAccessAssignableRole) => void;
  onCancelInvitation: (invitationId: string) => void;
  isUpdateRolePending: boolean;
  isRemoveMemberPending: boolean;
  isResendPending: boolean;
  isCancelPending: boolean;
};

type RowSelectCheckboxProps = {
  ariaLabel: string;
  checked: boolean;
  indeterminate?: boolean;
  onCheckedChange: (checked: boolean) => void;
};

const defaultInviteValues: OrganizationInviteValues = {
  email: "",
  role: "user",
};

const inviteSheetClassName = "data-[side=right]:sm:max-w-[42vw] data-[side=right]:lg:max-w-[36vw]";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function roleLabel(role: TeamAccessRole): string {
  if (role === "owner") {
    return "Proprietario";
  }

  return role === "admin" ? "Administrador" : "Usuario";
}

function roleBadgeVariant(role: TeamAccessRole): "default" | "secondary" | "outline" {
  if (role === "owner") {
    return "default";
  }

  if (role === "admin") {
    return "secondary";
  }

  return "outline";
}

function statusLabel(status: TeamAccessStatus): string {
  return status === "active" ? "Ativo" : "Pendente";
}

function statusBadgeVariant(status: TeamAccessStatus): "secondary" | "outline" {
  return status === "active" ? "secondary" : "outline";
}

const globalTeamFilter: FilterFn<TeamAccessRow> = (row, _columnId, value) => {
  const search = String(value ?? "").trim().toLowerCase();

  if (!search) {
    return true;
  }

  return [
    row.original.name || "",
    row.original.email,
    roleLabel(row.original.role),
    statusLabel(row.original.status),
    row.original.inviter || "",
  ].some((entry) => entry.toLowerCase().includes(search));
};

function RowSelectCheckbox({
  ariaLabel,
  checked,
  indeterminate = false,
  onCheckedChange,
}: RowSelectCheckboxProps) {
  const checkboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!checkboxRef.current) {
      return;
    }

    checkboxRef.current.indeterminate = !checked && indeterminate;
  }, [checked, indeterminate]);

  return (
    <input
      ref={checkboxRef}
      aria-label={ariaLabel}
      type="checkbox"
      checked={checked}
      onChange={(event) => {
        onCheckedChange(event.currentTarget.checked);
      }}
      className={cn(
        "border-input text-primary focus-visible:ring-ring/40 size-4 rounded border align-middle",
        "focus-visible:ring-2 focus-visible:outline-none",
      )}
    />
  );
}

function ColumnVisibilityMenu({ columns }: { columns: Column<TeamAccessRow, unknown>[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Columns3Icon data-icon="inline-start" />
          Colunas
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>Exibir colunas</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns
          .filter((column) => column.getCanHide())
          .map((column) => (
            <DropdownMenuCheckboxItem
              key={column.id}
              checked={column.getIsVisible()}
              onCheckedChange={(value) => {
                column.toggleVisibility(value === true);
              }}
            >
              {column.id === "name"
                ? "Nome"
                : column.id === "email"
                  ? "E-mail"
                  : column.id === "role"
                    ? "Cargo"
                    : column.id === "status"
                      ? "Status"
                      : column.id === "createdAt"
                        ? "Criado em"
                        : column.id === "expiresAt"
                          ? "Expira em"
                          : column.id === "inviter"
                            ? "Convidado por"
                            : column.id}
            </DropdownMenuCheckboxItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TeamAccessRowActions({
  row,
  currentUserId,
  currentUserRole,
  onUpdateRole,
  onRemoveMember,
  onResendInvitation,
  onCancelInvitation,
  isUpdateRolePending,
  isRemoveMemberPending,
  isResendPending,
  isCancelPending,
}: TeamAccessRowActionsProps) {
  if (row.kind === "member") {
    const canManageAdmins = isOrganizationOwnerRole(currentUserRole);
    const isOwnerMember = row.role === "owner";
    const isCurrentUser = row.targetUserId === currentUserId;
    const nextRole: TeamAccessAssignableRole = row.role === "admin" ? "user" : "admin";

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Acoes de ${row.email}`}>
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>Acoes</DropdownMenuLabel>
          {isOwnerMember ? (
            <DropdownMenuItem disabled>Use transferencia de propriedade</DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              disabled={
                isCurrentUser ||
                isUpdateRolePending ||
                (nextRole === "admin" && !canManageAdmins)
              }
              onSelect={() => {
                if (!row.memberId) {
                  return;
                }

                onUpdateRole(row.memberId, nextRole);
              }}
            >
              {nextRole === "admin" ? "Tornar administrador" : "Tornar usuario"}
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            variant="destructive"
            disabled={isCurrentUser || isOwnerMember || isRemoveMemberPending}
            onSelect={() => {
              if (!row.memberId || !row.targetUserId) {
                return;
              }

              onRemoveMember(row.memberId, row.targetUserId);
            }}
          >
            Remover usuario
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Acoes do convite ${row.email}`}>
          <MoreHorizontalIcon />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Acoes</DropdownMenuLabel>
        <DropdownMenuItem
          disabled={
            isResendPending ||
            ((row.role === "admin" || row.role === "owner") &&
              !isOrganizationOwnerRole(currentUserRole))
          }
          onSelect={() => {
            if (row.role === "owner") {
              onResendInvitation(row.email, "admin");
              return;
            }

            onResendInvitation(row.email, row.role);
          }}
        >
          Reenviar convite
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          variant="destructive"
          disabled={isCancelPending}
          onSelect={() => {
            if (!row.invitationId) {
              return;
            }

            onCancelInvitation(row.invitationId);
          }}
        >
          Cancelar convite
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function OrganizationUsersManager({
  members,
  pendingInvitations,
  currentUserId,
  currentUserRole,
}: OrganizationUsersManagerProps) {
  const router = useRouter();
  const canInviteAdmins = isOrganizationOwnerRole(currentUserRole);

  const [isInvitePending, startInviteTransition] = useTransition();
  const [isUpdateRolePending, startUpdateRoleTransition] = useTransition();
  const [isRemoveMemberPending, startRemoveMemberTransition] = useTransition();
  const [isResendPending, startResendTransition] = useTransition();
  const [isCancelPending, startCancelTransition] = useTransition();

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [globalFilter, setGlobalFilter] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const [inviteSheetOpen, setInviteSheetOpen] = useState(false);

  const [inviteState, inviteAction] = useActionState(
    inviteOrganizationUserAction,
    initialOrganizationUserActionState,
  );
  const [updateRoleState, updateRoleAction] = useActionState(
    updateOrganizationMemberRoleAction,
    initialOrganizationUserActionState,
  );
  const [removeMemberState, removeMemberAction] = useActionState(
    removeOrganizationMemberAction,
    initialOrganizationUserActionState,
  );
  const [resendInvitationState, resendInvitationAction] = useActionState(
    resendOrganizationInvitationAction,
    initialOrganizationUserActionState,
  );
  const [cancelInvitationState, cancelInvitationAction] = useActionState(
    cancelOrganizationInvitationAction,
    initialOrganizationUserActionState,
  );

  const inviteForm = useForm<OrganizationInviteValues>({
    resolver: zodResolver(organizationInviteSchema),
    defaultValues: defaultInviteValues,
  });

  useEffect(() => {
    if (inviteState.status !== "success") {
      return;
    }

    setInviteSheetOpen(false);
    inviteForm.reset(defaultInviteValues);
    router.refresh();
  }, [inviteForm, inviteState.status, router]);

  useEffect(() => {
    if (
      updateRoleState.status !== "success" &&
      removeMemberState.status !== "success" &&
      resendInvitationState.status !== "success" &&
      cancelInvitationState.status !== "success"
    ) {
      return;
    }

    setRowSelection({});
    router.refresh();
  }, [
    cancelInvitationState.status,
    removeMemberState.status,
    resendInvitationState.status,
    router,
    updateRoleState.status,
  ]);

  const rows = useMemo<TeamAccessRow[]>(() => {
    const activeRows: TeamAccessRow[] = members.map((member) => ({
      id: `member-${member.id}`,
      kind: "member",
      name: member.name,
      email: member.email,
      role: member.role,
      status: "active",
      createdAt: member.createdAt,
      expiresAt: null,
      inviter: null,
      memberId: member.id,
      targetUserId: member.userId,
      invitationId: null,
    }));

    const pendingRows: TeamAccessRow[] = pendingInvitations.map((invitation) => ({
      id: `invitation-${invitation.id}`,
      kind: "invitation",
      name: null,
      email: invitation.email,
      role: invitation.role,
      status: "pending",
      createdAt: invitation.createdAt,
      expiresAt: invitation.expiresAt,
      inviter: invitation.inviterName || invitation.inviterEmail || null,
      memberId: null,
      targetUserId: null,
      invitationId: invitation.id,
    }));

    return [...activeRows, ...pendingRows].sort(
      (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    );
  }, [members, pendingInvitations]);

  const onInviteSubmit = inviteForm.handleSubmit((values) => {
    const payload = new FormData();
    payload.set("email", values.email);
    payload.set("role", values.role);

    startInviteTransition(() => {
      inviteAction(payload);
    });
  });

  const handleUpdateRole = useCallback(
    (memberId: string, role: TeamAccessAssignableRole) => {
      const payload = new FormData();
      payload.set("memberId", memberId);
      payload.set("role", role);

      startUpdateRoleTransition(() => {
        updateRoleAction(payload);
      });
    },
    [updateRoleAction],
  );

  const handleRemoveMember = useCallback(
    (memberId: string, targetUserId: string) => {
      const payload = new FormData();
      payload.set("memberId", memberId);
      payload.set("targetUserId", targetUserId);

      startRemoveMemberTransition(() => {
        removeMemberAction(payload);
      });
    },
    [removeMemberAction],
  );

  const handleResendInvitation = useCallback(
    (email: string, role: TeamAccessAssignableRole) => {
      const payload = new FormData();
      payload.set("email", email);
      payload.set("role", role);

      startResendTransition(() => {
        resendInvitationAction(payload);
      });
    },
    [resendInvitationAction],
  );

  const handleCancelInvitation = useCallback(
    (invitationId: string) => {
      const payload = new FormData();
      payload.set("invitationId", invitationId);

      startCancelTransition(() => {
        cancelInvitationAction(payload);
      });
    },
    [cancelInvitationAction],
  );

  const columns = useMemo<ColumnDef<TeamAccessRow>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <RowSelectCheckbox
            ariaLabel="Selecionar todas as linhas da pagina"
            checked={table.getIsAllPageRowsSelected()}
            indeterminate={table.getIsSomePageRowsSelected()}
            onCheckedChange={(checked) => {
              table.toggleAllPageRowsSelected(checked);
            }}
          />
        ),
        cell: ({ row }) => (
          <RowSelectCheckbox
            ariaLabel={`Selecionar ${row.original.email}`}
            checked={row.getIsSelected()}
            onCheckedChange={(checked) => {
              row.toggleSelected(checked);
            }}
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "name",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              column.toggleSorting(column.getIsSorted() === "asc");
            }}
          >
            Nome
            <ArrowUpDownIcon />
          </Button>
        ),
        cell: ({ row }) => {
          if (row.original.kind === "invitation") {
            return <span className="text-muted-foreground">Convite pendente</span>;
          }

          const isCurrentUser = row.original.targetUserId === currentUserId;

          return (
            <div className="flex flex-wrap items-center gap-2">
              <span>{row.original.name || "Sem nome"}</span>
              {isCurrentUser ? <Badge variant="outline">Voce</Badge> : null}
            </div>
          );
        },
      },
      {
        accessorKey: "email",
        header: "E-mail",
        cell: ({ row }) => row.original.email,
      },
      {
        accessorKey: "role",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              column.toggleSorting(column.getIsSorted() === "asc");
            }}
          >
            Cargo
            <ArrowUpDownIcon />
          </Button>
        ),
        cell: ({ row }) => <Badge variant={roleBadgeVariant(row.original.role)}>{roleLabel(row.original.role)}</Badge>,
      },
      {
        accessorKey: "status",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              column.toggleSorting(column.getIsSorted() === "asc");
            }}
          >
            Status
            <ArrowUpDownIcon />
          </Button>
        ),
        cell: ({ row }) => (
          <Badge variant={statusBadgeVariant(row.original.status)}>{statusLabel(row.original.status)}</Badge>
        ),
      },
      {
        accessorKey: "createdAt",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              column.toggleSorting(column.getIsSorted() === "asc");
            }}
          >
            Criado em
            <ArrowUpDownIcon />
          </Button>
        ),
        cell: ({ row }) => formatDate(row.original.createdAt),
      },
      {
        accessorKey: "expiresAt",
        header: "Expira em",
        cell: ({ row }) =>
          row.original.expiresAt ? formatDate(row.original.expiresAt) : <span className="text-muted-foreground">-</span>,
      },
      {
        accessorKey: "inviter",
        header: "Convidado por",
        cell: ({ row }) => row.original.inviter || <span className="text-muted-foreground">-</span>,
      },
      {
        id: "actions",
        enableHiding: false,
        cell: ({ row }) => (
          <div className="text-right">
            <TeamAccessRowActions
              row={row.original}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
              onUpdateRole={handleUpdateRole}
              onRemoveMember={handleRemoveMember}
              onResendInvitation={handleResendInvitation}
              onCancelInvitation={handleCancelInvitation}
              isUpdateRolePending={isUpdateRolePending}
              isRemoveMemberPending={isRemoveMemberPending}
              isResendPending={isResendPending}
              isCancelPending={isCancelPending}
            />
          </div>
        ),
      },
    ],
    [
      currentUserRole,
      currentUserId,
      handleCancelInvitation,
      handleRemoveMember,
      handleResendInvitation,
      handleUpdateRole,
      isCancelPending,
      isRemoveMemberPending,
      isResendPending,
      isUpdateRolePending,
    ],
  );

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table API is designed around mutable table instance methods.
  const table = useReactTable({
    data: rows,
    columns,
    getRowId: (row) => row.id,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      globalFilter,
      pagination,
    },
    enableRowSelection: true,
    globalFilterFn: globalTeamFilter,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  const statusColumn = table.getColumn("status");
  const roleColumn = table.getColumn("role");

  const statusFilterValue = (statusColumn?.getFilterValue() as string | undefined) ?? "all";
  const roleFilterValue = (roleColumn?.getFilterValue() as string | undefined) ?? "all";

  const hasFilters = table.getState().columnFilters.length > 0 || table.getState().globalFilter.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-64 flex-1 sm:max-w-sm">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1.5 left-2.5 size-3.5" />
          <Input
            className="pl-8"
            value={globalFilter}
            onChange={(event) => {
              setGlobalFilter(event.target.value);
            }}
            placeholder="Buscar por nome, e-mail, cargo, status..."
          />
        </div>

        <Select
          value={statusFilterValue}
          onValueChange={(value) => {
            statusColumn?.setFilterValue(value === "all" ? undefined : value);
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="active">Ativo</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={roleFilterValue}
          onValueChange={(value) => {
            roleColumn?.setFilterValue(value === "all" ? undefined : value);
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Cargo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos cargos</SelectItem>
            <SelectItem value="owner">Proprietario</SelectItem>
            <SelectItem value="admin">Administrador</SelectItem>
            <SelectItem value="user">Usuario</SelectItem>
          </SelectContent>
        </Select>

        {hasFilters ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setGlobalFilter("");
              table.resetColumnFilters();
            }}
          >
            <XIcon data-icon="inline-start" />
            Limpar filtros
          </Button>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          <ColumnVisibilityMenu columns={table.getAllColumns()} />

          <Sheet
            open={inviteSheetOpen}
            onOpenChange={(open) => {
              setInviteSheetOpen(open);
              if (!open) {
                inviteForm.reset(defaultInviteValues);
              }
            }}
          >
            <SheetTrigger asChild>
              <Button size="sm">
                <UserPlusIcon data-icon="inline-start" />
                Convidar usuario
              </Button>
            </SheetTrigger>

            <SheetContent side="right" className={inviteSheetClassName}>
              <SheetHeader>
                <SheetTitle>Convidar usuario</SheetTitle>
                <SheetDescription>
                  Convites sao enviados por e-mail e o acesso sera vinculado a esta empresa.
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-4 overflow-y-auto border-t bg-muted/20 px-6 py-6">
                <div className="rounded-xl border bg-background p-4 shadow-xs">
                  <Form {...inviteForm}>
                    <form onSubmit={onInviteSubmit} className="space-y-4">
                      <FormField
                        control={inviteForm.control}
                        name="email"
                        render={({ field }) => {
                          const fieldProps = stripFieldRef(field);

                          return (
                            <FormItem>
                              <FormLabel>E-mail</FormLabel>
                              <FormControl>
                                <Input
                                  {...fieldProps}
                                  type="email"
                                  autoComplete="email"
                                  placeholder="usuario@empresa.com"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          );
                        }}
                      />

                      <FormField
                        control={inviteForm.control}
                        name="role"
                        render={({ field }) => {
                          const fieldProps = stripFieldRef(field);

                          return (
                            <FormItem>
                              <FormLabel>Cargo inicial</FormLabel>
                              <FormControl>
                                <select
                                  {...fieldProps}
                                  className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                                >
                                  <option value="user">Usuario</option>
                                  {canInviteAdmins ? (
                                    <option value="admin">Administrador</option>
                                  ) : null}
                                </select>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          );
                        }}
                      />

                      <FormSubmitButton pending={isInvitePending} pendingLabel="Enviando convite...">
                        Enviar convite
                      </FormSubmitButton>
                    </form>
                  </Form>
                </div>

                <FormFeedback state={inviteState} showInline={false} />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["active", "pending"] as const).map((status) => {
          const count = Number(statusColumn?.getFacetedUniqueValues().get(status) ?? 0);

          return (
            <Badge key={status} variant="outline">
              {statusLabel(status)}: {count}
            </Badge>
          );
        })}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={table.getVisibleFlatColumns().length} className="h-24 text-center">
                  Nenhum usuario ou convite encontrado para os filtros aplicados.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() ? "selected" : undefined}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap gap-2">
        <FormFeedback state={updateRoleState} showInline={false} />
        <FormFeedback state={removeMemberState} showInline={false} />
        <FormFeedback state={resendInvitationState} showInline={false} />
        <FormFeedback state={cancelInvitationState} showInline={false} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-xs">
          {table.getFilteredSelectedRowModel().rows.length} de {table.getFilteredRowModel().rows.length} linha(s)
          selecionada(s)
        </p>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <p className="text-xs">Linhas por pagina</p>
            <Select
              value={String(table.getState().pagination.pageSize)}
              onValueChange={(value) => {
                table.setPageSize(Number(value));
              }}
            >
              <SelectTrigger className="w-[76px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 30, 40, 50].map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs font-medium">
            Pagina {table.getState().pagination.pageIndex + 1} de {Math.max(table.getPageCount(), 1)}
          </p>

          <div className="flex items-center gap-1">
            <Button
              size="icon-sm"
              variant="outline"
              onClick={() => table.firstPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Primeira pagina"
            >
              <ChevronsLeftIcon />
            </Button>
            <Button
              size="icon-sm"
              variant="outline"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Pagina anterior"
            >
              <ChevronLeftIcon />
            </Button>
            <Button
              size="icon-sm"
              variant="outline"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Proxima pagina"
            >
              <ChevronRightIcon />
            </Button>
            <Button
              size="icon-sm"
              variant="outline"
              onClick={() => table.lastPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Ultima pagina"
            >
              <ChevronsRightIcon />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
