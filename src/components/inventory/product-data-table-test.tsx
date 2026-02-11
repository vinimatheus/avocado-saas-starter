"use client";
// REMINDER: React Compiler is not compatible with TanStack Table v8 yet.
"use no memo";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef, ColumnFiltersState, SortingState } from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowUpDownIcon } from "lucide-react";

import { ProductSheet } from "@/components/inventory/product-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ProductDataTableRow = {
  id: number;
  sku: string;
  name: string;
  description: string | null;
  category: string | null;
  updatedAt: string;
};

type ProductDataTableTestProps = {
  products: ProductDataTableRow[];
};

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function ProductDataTableTest({ products }: ProductDataTableTestProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "updatedAt", desc: true },
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const columns = useMemo<ColumnDef<ProductDataTableRow>[]>(
    () => [
      {
        accessorKey: "sku",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            SKU
            <ArrowUpDownIcon />
          </Button>
        ),
        cell: ({ row }) => <Badge variant="outline">{row.original.sku}</Badge>,
      },
      {
        accessorKey: "name",
        header: "Nome",
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        accessorKey: "category",
        header: "Categoria",
        cell: ({ row }) => (
          <Badge variant="secondary">{row.original.category?.trim() || "-"}</Badge>
        ),
      },
      {
        accessorKey: "updatedAt",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Atualizado em
            <ArrowUpDownIcon />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground text-xs">
            {formatDateTime(row.original.updatedAt)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            <Button asChild variant="secondary" size="sm">
              <Link href={`/cadastros/produto/${encodeURIComponent(row.original.sku)}`}>
                Detalhes
              </Link>
            </Button>
            <ProductSheet
              mode="edit"
              triggerLabel="Editar"
              triggerVariant="outline"
              triggerSize="sm"
              defaultValues={{
                sku: row.original.sku,
                name: row.original.name,
                description: row.original.description,
                category: row.original.category,
              }}
            />
          </div>
        ),
      },
    ],
    [],
  );

  // TanStack Table APIs are currently flagged by react-hooks/incompatible-library.
  // We intentionally use it here for the DataTable behavior.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: products,
    columns,
    state: {
      sorting,
      columnFilters,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 8,
      },
    },
  });

  const skuFilterValue = (table.getColumn("sku")?.getFilterValue() as string) ?? "";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input
          className="max-w-[280px]"
          placeholder="Filtrar por SKU..."
          value={skuFilterValue}
          onChange={(event) => table.getColumn("sku")?.setFilterValue(event.target.value)}
        />
        <Badge variant="outline">Total: {products.length}</Badge>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader className="bg-muted/40">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
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
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-muted-foreground h-24 text-center">
                  Nenhum produto encontrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs">
          Pagina {table.getState().pagination.pageIndex + 1} de {Math.max(table.getPageCount(), 1)}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Proxima
          </Button>
        </div>
      </div>
    </div>
  );
}
