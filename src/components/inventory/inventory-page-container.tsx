import { cn } from "@/lib/utils";

type InventoryPageContainerProps = {
  children: React.ReactNode;
  className?: string;
};

export function InventoryPageContainer({
  children,
  className,
}: InventoryPageContainerProps) {
  return (
    <main className={cn("mx-auto flex w-full max-w-7xl flex-col gap-5 p-4 sm:p-6 lg:p-8", className)}>
      {children}
    </main>
  );
}
