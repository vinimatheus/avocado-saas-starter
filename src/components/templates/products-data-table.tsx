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
  ArchiveIcon,
  ArrowUpDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  CheckIcon,
  Columns3Icon,
  MoreHorizontalIcon,
  PackagePlusIcon,
  PencilLineIcon,
  SearchIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm, type UseFormReturn } from "react-hook-form";

import {
  bulkDeleteProductsAction,
  bulkUpdateProductsStatusAction,
  createProductAction,
  deleteProductAction,
  updateProductAction,
} from "@/actions/product-actions";
import { initialProductActionState } from "@/actions/product-action-state";
import { FormFeedback } from "@/components/shared/form-feedback";
import { FormSubmitButton } from "@/components/shared/form-submit-button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import {
  PRODUCT_CATEGORY_OPTIONS,
  PRODUCT_STATUS_OPTIONS,
  productCreateSchema,
  type ProductCreateValues,
  type ProductStatus,
} from "@/lib/products/schemas";
import { stripFieldRef } from "@/lib/forms/rhf";
import { cn } from "@/lib/shared/utils";

export type ProductTableItem = {
  id: string;
  sku: string;
  name: string;
  category: string;
  status: ProductStatus;
  price: number;
  stock: number;
  createdAt: string;
  updatedAt: string;
};

type ProductsDataTableProps = {
  products: ProductTableItem[];
  canManage: boolean;
};

type ProductFormFieldsProps = {
  form: UseFormReturn<ProductCreateValues>;
};

type ProductRowActionsProps = {
  product: ProductTableItem;
  canManage: boolean;
  onEdit: (product: ProductTableItem) => void;
  onChangeStatus: (productId: string, nextStatus: ProductStatus) => void;
  onDelete: (product: ProductTableItem) => void;
};

type RowSelectCheckboxProps = {
  ariaLabel: string;
  checked: boolean;
  indeterminate?: boolean;
  onCheckedChange: (checked: boolean) => void;
};

type DeleteDialogState =
  | {
      mode: "single";
      productId: string;
      productName: string;
    }
  | {
      mode: "bulk";
      productIds: string[];
      count: number;
    };

const defaultProductFormValues: ProductCreateValues = {
  name: "",
  sku: "",
  category: PRODUCT_CATEGORY_OPTIONS[0],
  status: "draft",
  price: 0,
  stock: 0,
};

const statusLabel: Record<ProductStatus, string> = {
  active: "Ativo",
  draft: "Rascunho",
  archived: "Arquivado",
};

const productSheetClassName = "data-[side=right]:sm:max-w-[50vw] data-[side=right]:lg:max-w-[48vw]";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function badgeVariantForStatus(status: ProductStatus): "default" | "secondary" | "outline" {
  if (status === "active") {
    return "default";
  }

  if (status === "draft") {
    return "secondary";
  }

  return "outline";
}

function buildProductFormData(values: ProductCreateValues): FormData {
  const payload = new FormData();
  payload.set("name", values.name.trim());
  payload.set("sku", values.sku.trim().toUpperCase());
  payload.set("category", values.category);
  payload.set("status", values.status);
  payload.set("price", String(values.price));
  payload.set("stock", String(values.stock));

  return payload;
}

const globalProductFilter: FilterFn<ProductTableItem> = (row, _columnId, value) => {
  const search = String(value ?? "").trim().toLowerCase();

  if (!search) {
    return true;
  }

  return [
    row.original.name,
    row.original.sku,
    row.original.category,
    statusLabel[row.original.status],
    String(row.original.price),
    String(row.original.stock),
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

function ProductFormFields({ form }: ProductFormFieldsProps) {
  return (
    <>
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => {
          const fieldProps = stripFieldRef(field);

          return (
            <FormItem>
              <FormLabel>Nome</FormLabel>
              <FormControl>
                <Input {...fieldProps} type="text" placeholder="Ex.: CRM Starter" />
              </FormControl>
              <FormMessage />
            </FormItem>
          );
        }}
      />

      <FormField
        control={form.control}
        name="sku"
        render={({ field }) => {
          const fieldProps = stripFieldRef(field);

          return (
            <FormItem>
              <FormLabel>SKU</FormLabel>
              <FormControl>
                <Input {...fieldProps} type="text" placeholder="CRM_STARTER" />
              </FormControl>
              <FormMessage />
            </FormItem>
          );
        }}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="category"
          render={({ field }) => {
            const fieldProps = stripFieldRef(field);

            return (
              <FormItem>
                <FormLabel>Categoria</FormLabel>
                <FormControl>
                  <select
                    {...fieldProps}
                    className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                  >
                    {PRODUCT_CATEGORY_OPTIONS.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />

        <FormField
          control={form.control}
          name="status"
          render={({ field }) => {
            const fieldProps = stripFieldRef(field);

            return (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <FormControl>
                  <select
                    {...fieldProps}
                    className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                  >
                    {PRODUCT_STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {statusLabel[status]}
                      </option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="price"
          render={({ field }) => {
            const fieldProps = stripFieldRef(field);

            return (
              <FormItem>
                <FormLabel>Preco</FormLabel>
                <FormControl>
                  <Input
                    {...fieldProps}
                    type="number"
                    step="0.01"
                    min={0}
                    onChange={(event) => {
                      const value = Number(event.currentTarget.value);
                      field.onChange(Number.isFinite(value) ? value : 0);
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />

        <FormField
          control={form.control}
          name="stock"
          render={({ field }) => {
            const fieldProps = stripFieldRef(field);

            return (
              <FormItem>
                <FormLabel>Estoque</FormLabel>
                <FormControl>
                  <Input
                    {...fieldProps}
                    type="number"
                    step="1"
                    min={0}
                    onChange={(event) => {
                      const value = Number(event.currentTarget.value);
                      field.onChange(Number.isFinite(value) ? Math.trunc(value) : 0);
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />
      </div>
    </>
  );
}

function ProductRowActions({
  product,
  canManage,
  onEdit,
  onChangeStatus,
  onDelete,
}: ProductRowActionsProps) {
  if (!canManage) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Acoes de ${product.name}`}>
          <MoreHorizontalIcon />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Acoes</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onEdit(product)}>
          <PencilLineIcon data-icon="inline-start" />
          Editar produto
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={() => onChangeStatus(product.id, "active")}>Marcar como ativo</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onChangeStatus(product.id, "draft")}>Marcar como rascunho</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onChangeStatus(product.id, "archived")}>Marcar como arquivado</DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem variant="destructive" onSelect={() => onDelete(product)}>
          <Trash2Icon data-icon="inline-start" />
          Remover produto
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ColumnVisibilityMenu({ columns }: { columns: Column<ProductTableItem, unknown>[] }) {
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
              {column.id === "updatedAt"
                ? "Atualizado"
                : column.id === "sku"
                  ? "SKU"
                  : column.id === "name"
                    ? "Produto"
                    : column.id === "category"
                      ? "Categoria"
                      : column.id === "status"
                        ? "Status"
                        : column.id === "price"
                          ? "Preco"
                          : column.id === "stock"
                            ? "Estoque"
                            : column.id}
            </DropdownMenuCheckboxItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ProductsDataTable({ products, canManage }: ProductsDataTableProps) {
  const router = useRouter();

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [globalFilter, setGlobalFilter] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });

  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductTableItem | null>(null);
  const [deleteDialogState, setDeleteDialogState] = useState<DeleteDialogState | null>(null);

  const [isCreatePending, startCreateTransition] = useTransition();
  const [isUpdatePending, startUpdateTransition] = useTransition();
  const [isDeletePending, startDeleteTransition] = useTransition();
  const [isBulkStatusPending, startBulkStatusTransition] = useTransition();
  const [isBulkDeletePending, startBulkDeleteTransition] = useTransition();

  const [createState, createAction] = useActionState(createProductAction, initialProductActionState);
  const [updateState, updateAction] = useActionState(updateProductAction, initialProductActionState);
  const [deleteState, deleteAction] = useActionState(deleteProductAction, initialProductActionState);
  const [bulkStatusState, bulkStatusAction] = useActionState(
    bulkUpdateProductsStatusAction,
    initialProductActionState,
  );
  const [bulkDeleteState, bulkDeleteAction] = useActionState(
    bulkDeleteProductsAction,
    initialProductActionState,
  );

  const createForm = useForm<ProductCreateValues>({
    resolver: zodResolver(productCreateSchema),
    defaultValues: defaultProductFormValues,
  });

  const editForm = useForm<ProductCreateValues>({
    resolver: zodResolver(productCreateSchema),
    defaultValues: defaultProductFormValues,
  });

  useEffect(() => {
    if (createState.status !== "success") {
      return;
    }

    setCreateSheetOpen(false);
    createForm.reset(defaultProductFormValues);
    router.refresh();
  }, [createForm, createState, router]);

  useEffect(() => {
    if (updateState.status !== "success") {
      return;
    }

    setEditSheetOpen(false);
    setSelectedProduct(null);
    router.refresh();
  }, [router, updateState]);

  useEffect(() => {
    if (
      deleteState.status !== "success" &&
      bulkStatusState.status !== "success" &&
      bulkDeleteState.status !== "success"
    ) {
      return;
    }

    setRowSelection({});
    router.refresh();
  }, [bulkDeleteState, bulkStatusState, deleteState, router]);

  const onCreateSubmit = createForm.handleSubmit((values) => {
    const payload = buildProductFormData(values);

    startCreateTransition(() => {
      createAction(payload);
    });
  });

  const onEditSubmit = editForm.handleSubmit((values) => {
    if (!selectedProduct) {
      return;
    }

    const payload = buildProductFormData(values);
    payload.set("productId", selectedProduct.id);

    startUpdateTransition(() => {
      updateAction(payload);
    });
  });

  const handleOpenEdit = useCallback(
    (product: ProductTableItem) => {
      setSelectedProduct(product);
      editForm.reset({
        name: product.name,
        sku: product.sku,
        category: product.category as ProductCreateValues["category"],
        status: product.status,
        price: product.price,
        stock: product.stock,
      });
      setEditSheetOpen(true);
    },
    [editForm],
  );

  const handleDeleteProduct = useCallback(
    (productId: string) => {
      const payload = new FormData();
      payload.set("productId", productId);

      startDeleteTransition(() => {
        deleteAction(payload);
      });
    },
    [deleteAction],
  );

  const handleBulkStatus = useCallback(
    (productIds: string[], status: ProductStatus) => {
      const payload = new FormData();
      for (const productId of productIds) {
        payload.append("productIds", productId);
      }
      payload.set("status", status);

      startBulkStatusTransition(() => {
        bulkStatusAction(payload);
      });
    },
    [bulkStatusAction],
  );

  const handleBulkDelete = useCallback(
    (productIds: string[]) => {
      const payload = new FormData();
      for (const productId of productIds) {
        payload.append("productIds", productId);
      }

      startBulkDeleteTransition(() => {
        bulkDeleteAction(payload);
      });
    },
    [bulkDeleteAction],
  );

  const handleOpenSingleDeleteDialog = useCallback((product: ProductTableItem) => {
    setDeleteDialogState({
      mode: "single",
      productId: product.id,
      productName: product.name,
    });
  }, []);

  const handleOpenBulkDeleteDialog = useCallback((productIds: string[], count: number) => {
    setDeleteDialogState({
      mode: "bulk",
      productIds: [...productIds],
      count,
    });
  }, []);

  const handleConfirmDelete = useCallback(() => {
    setDeleteDialogState((current) => {
      if (!current) {
        return null;
      }

      if (current.mode === "single") {
        handleDeleteProduct(current.productId);
        return null;
      }

      handleBulkDelete(current.productIds);
      return null;
    });
  }, [handleBulkDelete, handleDeleteProduct]);

  const columns = useMemo<ColumnDef<ProductTableItem>[]>(() => {
    const coreColumns: ColumnDef<ProductTableItem>[] = [
      {
        accessorKey: "sku",
        header: "SKU",
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.sku}</span>,
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
            Produto
            <ArrowUpDownIcon />
          </Button>
        ),
        cell: ({ row }) => (
          <div className="min-w-52">
            <p className="font-medium">{row.original.name}</p>
            <p className="text-muted-foreground text-xs">ID: {row.original.id}</p>
          </div>
        ),
      },
      {
        accessorKey: "category",
        header: "Categoria",
        cell: ({ row }) => <Badge variant="outline">{row.original.category}</Badge>,
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
          <Badge variant={badgeVariantForStatus(row.original.status)}>
            {statusLabel[row.original.status]}
          </Badge>
        ),
      },
      {
        accessorKey: "price",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              column.toggleSorting(column.getIsSorted() === "asc");
            }}
          >
            Preco
            <ArrowUpDownIcon />
          </Button>
        ),
        cell: ({ row }) => <span className="font-medium">{formatCurrency(row.original.price)}</span>,
      },
      {
        accessorKey: "stock",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              column.toggleSorting(column.getIsSorted() === "asc");
            }}
          >
            Estoque
            <ArrowUpDownIcon />
          </Button>
        ),
        cell: ({ row }) => (
          <span className={cn(row.original.stock < 15 && "text-destructive font-medium")}>
            {row.original.stock}
          </span>
        ),
      },
      {
        accessorKey: "updatedAt",
        header: "Atualizado",
        cell: ({ row }) => <span>{formatDate(row.original.updatedAt)}</span>,
      },
    ];

    if (!canManage) {
      return coreColumns;
    }

    return [
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
            ariaLabel={`Selecionar ${row.original.name}`}
            checked={row.getIsSelected()}
            onCheckedChange={(checked) => {
              row.toggleSelected(checked);
            }}
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      ...coreColumns,
      {
        id: "actions",
        enableHiding: false,
        cell: ({ row }) => (
          <div className="text-right">
            <ProductRowActions
              product={row.original}
              canManage={canManage}
              onEdit={handleOpenEdit}
              onChangeStatus={(productId, status) => {
                handleBulkStatus([productId], status);
              }}
              onDelete={handleOpenSingleDeleteDialog}
            />
          </div>
        ),
      },
    ];
  }, [canManage, handleBulkStatus, handleOpenEdit, handleOpenSingleDeleteDialog]);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table API is designed around mutable table instance methods.
  const table = useReactTable({
    data: products,
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
    enableRowSelection: canManage,
    globalFilterFn: globalProductFilter,
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

  const selectedRows = table.getFilteredSelectedRowModel().rows;
  const selectedCount = selectedRows.length;
  const selectedIds = selectedRows.map((row) => row.original.id);
  const isBulkActionPending = isBulkStatusPending || isBulkDeletePending;

  const statusColumn = table.getColumn("status");
  const categoryColumn = table.getColumn("category");

  const statusFilterValue = (statusColumn?.getFilterValue() as string | undefined) ?? "all";
  const categoryFilterValue = (categoryColumn?.getFilterValue() as string | undefined) ?? "all";

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
            placeholder="Buscar por nome, SKU, categoria, status..."
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
            {PRODUCT_STATUS_OPTIONS.map((status) => (
              <SelectItem key={status} value={status}>
                {statusLabel[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={categoryFilterValue}
          onValueChange={(value) => {
            categoryColumn?.setFilterValue(value === "all" ? undefined : value);
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas categorias</SelectItem>
            {PRODUCT_CATEGORY_OPTIONS.map((category) => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
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

          {canManage ? (
            <Sheet
              open={createSheetOpen}
              onOpenChange={(open) => {
                setCreateSheetOpen(open);
                if (!open) {
                  createForm.reset(defaultProductFormValues);
                }
              }}
            >
              <SheetTrigger asChild>
                <Button size="sm">
                  <PackagePlusIcon data-icon="inline-start" />
                  Novo produto
                </Button>
              </SheetTrigger>

              <SheetContent side="right" className={productSheetClassName}>
                <SheetHeader>
                  <SheetTitle>Cadastrar produto</SheetTitle>
                  <SheetDescription>
                    Preencha os dados para criar um produto na empresa atual.
                  </SheetDescription>
                </SheetHeader>

                <div className="space-y-4 overflow-y-auto border-t bg-muted/20 px-6 py-6">
                  <div className="rounded-xl border bg-background p-4 shadow-xs">
                    <Form {...createForm}>
                      <form onSubmit={onCreateSubmit} className="space-y-4">
                        <ProductFormFields form={createForm} />

                        <FormSubmitButton
                          pending={isCreatePending}
                          pendingLabel="Cadastrando produto..."
                        >
                          Cadastrar produto
                        </FormSubmitButton>
                      </form>
                    </Form>
                  </div>

                  <FormFeedback state={createState} showInline={false} />
                </div>
              </SheetContent>
            </Sheet>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PRODUCT_STATUS_OPTIONS.map((status) => {
          const count = Number(statusColumn?.getFacetedUniqueValues().get(status) ?? 0);

          return (
            <Badge key={status} variant="outline">
              {statusLabel[status]}: {count}
            </Badge>
          );
        })}
      </div>

      {canManage && selectedCount > 0 ? (
        <div className="ring-foreground/5 bg-background flex flex-wrap items-center gap-2 rounded-2xl border p-2 shadow-sm ring-1">
          <div className="bg-muted/80 text-muted-foreground rounded-full px-3 py-1 text-xs font-medium">
            {selectedCount} selecionado(s)
          </div>

          <Button
            size="sm"
            variant="outline"
            className="rounded-full"
            disabled={isBulkActionPending}
            onClick={() => {
              handleBulkStatus(selectedIds, "active");
            }}
          >
            <CheckIcon data-icon="inline-start" />
            Ativar
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="rounded-full"
            disabled={isBulkActionPending}
            onClick={() => {
              handleBulkStatus(selectedIds, "draft");
            }}
          >
            <PencilLineIcon data-icon="inline-start" />
            Rascunho
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="rounded-full"
            disabled={isBulkActionPending}
            onClick={() => {
              handleBulkStatus(selectedIds, "archived");
            }}
          >
            <ArchiveIcon data-icon="inline-start" />
            Arquivar
          </Button>

          <div className="ml-auto flex items-center gap-1.5">
            <Button
              size="sm"
              variant="destructive"
              className="rounded-full"
              disabled={isBulkActionPending}
              onClick={() => {
                handleOpenBulkDeleteDialog(selectedIds, selectedCount);
              }}
            >
              <Trash2Icon data-icon="inline-start" />
              Excluir
            </Button>

            <Button
              size="sm"
              variant="ghost"
              className="rounded-full"
              onClick={() => {
                setRowSelection({});
              }}
            >
              <XIcon data-icon="inline-start" />
              Fechar
            </Button>
          </div>
        </div>
      ) : null}

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
                  Nenhum produto encontrado para os filtros aplicados.
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
        <FormFeedback state={deleteState} />
        <FormFeedback state={bulkStatusState} />
        <FormFeedback state={bulkDeleteState} />
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

      {canManage ? (
        <Sheet
          open={editSheetOpen}
          onOpenChange={(open) => {
            setEditSheetOpen(open);
            if (!open) {
              setSelectedProduct(null);
            }
          }}
        >
          <SheetContent side="right" className={productSheetClassName}>
            <SheetHeader>
              <SheetTitle>Editar produto</SheetTitle>
              <SheetDescription>
                Atualize os dados do produto selecionado para manter o cadastro consistente.
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-4 overflow-y-auto border-t bg-muted/20 px-6 py-6">
              <div className="rounded-xl border bg-background p-4 shadow-xs">
                <Form {...editForm}>
                  <form onSubmit={onEditSubmit} className="space-y-4">
                    <ProductFormFields form={editForm} />

                    <FormSubmitButton pending={isUpdatePending} pendingLabel="Salvando alteracoes...">
                      Salvar alteracoes
                    </FormSubmitButton>
                  </form>
                </Form>
              </div>

              <FormFeedback state={updateState} showInline={false} />
            </div>
          </SheetContent>
        </Sheet>
      ) : null}

      <AlertDialog
        open={deleteDialogState !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteDialogState(null);
          }
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/15 text-destructive">
              <Trash2Icon />
            </AlertDialogMedia>
            <AlertDialogTitle>Confirmar exclusao</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDialogState?.mode === "single"
                ? `Voce esta prestes a excluir o produto \"${deleteDialogState.productName}\". Esta acao nao pode ser desfeita.`
                : `Voce esta prestes a excluir ${deleteDialogState?.count ?? 0} produto(s) selecionado(s). Esta acao nao pode ser desfeita.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleConfirmDelete}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isDeletePending ? <span className="sr-only">Removendo produto</span> : null}
    </div>
  );
}
