"use client";
// REMINDER: React Compiler is not compatible with TanStack Table v8 yet.
"use no memo";

import { useMemo, useState } from "react";
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

import { PalletDeleteAlert } from "@/components/inventory/pallet-delete-alert";
import { PalletSheet } from "@/components/inventory/pallet-sheet";
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

type PalletDataTableRow = {
  id: number;
  code: string;
  label: string | null;
  status: string | null;
  createdAt: string;
};

type PalletDataTableTestProps = {
  pallets: PalletDataTableRow[];
};

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function PalletDataTableTest({ pallets }: PalletDataTableTestProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "createdAt", desc: true },
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const columns = useMemo<ColumnDef<PalletDataTableRow>[]>(
    () => [
      {
        accessorKey: "code",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Codigo
            <ArrowUpDownIcon />
          </Button>
        ),
        cell: ({ row }) => <Badge variant="outline">{row.original.code}</Badge>,
      },
      {
        accessorKey: "label",
        header: "Descricao",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.label?.trim() || "Sem descricao"}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant="secondary">{row.original.status?.trim() || "-"}</Badge>
        ),
      },
      {
        accessorKey: "createdAt",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Criado em
            <ArrowUpDownIcon />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground text-xs">
            {formatDateTime(row.original.createdAt)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            <PalletSheet
              mode="edit"
              triggerLabel="Editar"
              triggerVariant="outline"
              triggerSize="sm"
              defaultValues={{
                code: row.original.code,
                label: row.original.label,
                status: row.original.status,
              }}
            />
            <PalletDeleteAlert code={row.original.code} />
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
    data: pallets,
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

  const codeFilterValue = (table.getColumn("code")?.getFilterValue() as string) ?? "";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input
          className="max-w-[280px]"
          placeholder="Filtrar por codigo..."
          value={codeFilterValue}
          onChange={(event) => table.getColumn("code")?.setFilterValue(event.target.value)}
        />
        <Badge variant="outline">Total: {pallets.length}</Badge>
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
                  Nenhum pallet encontrado.
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
