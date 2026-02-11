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

import { LocationDeleteAlert } from "@/components/inventory/location-delete-alert";
import { LocationSheet } from "@/components/inventory/location-sheet";
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

type LocationDataTableRow = {
  id: number;
  code: string;
  name: string | null;
  zone: string | null;
  createdAt: string;
};

type LocationDataTableTestProps = {
  locations: LocationDataTableRow[];
};

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function LocationDataTableTest({ locations }: LocationDataTableTestProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "createdAt", desc: true },
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const columns = useMemo<ColumnDef<LocationDataTableRow>[]>(
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
        accessorKey: "name",
        header: "Nome",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.name?.trim() || "Sem nome"}
          </span>
        ),
      },
      {
        accessorKey: "zone",
        header: "Zona",
        cell: ({ row }) => (
          <Badge variant="secondary">{row.original.zone?.trim() || "-"}</Badge>
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
            <LocationSheet
              mode="edit"
              triggerLabel="Editar"
              triggerVariant="outline"
              triggerSize="sm"
              defaultValues={{
                code: row.original.code,
                name: row.original.name,
                zone: row.original.zone,
              }}
            />
            <LocationDeleteAlert code={row.original.code} />
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
    data: locations,
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
        <Badge variant="outline">Total: {locations.length}</Badge>
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
                  Nenhuma localizacao encontrada.
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
