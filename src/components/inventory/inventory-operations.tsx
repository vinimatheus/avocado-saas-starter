"use client";

import { MoreVerticalIcon, ScanLineIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { READING_TIPS } from "./constants";

type InventoryOperationsProps = {
  className?: string;
  showFeedback?: boolean;
};

export function InventoryOperations({
  className,
  showFeedback,
}: InventoryOperationsProps) {
  void showFeedback;

  return (
    <div className={`flex flex-wrap justify-end gap-2 ${className ?? ""}`}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            <MoreVerticalIcon data-icon="inline-start" />
            Dicas de leitura
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>Boas praticas</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {READING_TIPS.map((tip) => (
            <DropdownMenuItem key={tip}>
              <ScanLineIcon />
              {tip}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
