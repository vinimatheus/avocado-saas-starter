import { cn } from "@/lib/shared/utils";

type AppPageContainerProps = {
  children: React.ReactNode;
  className?: string;
};

export function AppPageContainer({ children, className }: AppPageContainerProps) {
  return <main className={cn("mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6 lg:p-8", className)}>{children}</main>;
}
