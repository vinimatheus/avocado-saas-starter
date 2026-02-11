type InventoryErrorBannerProps = {
  errorMessage: string | null;
};

export function InventoryErrorBanner({ errorMessage }: InventoryErrorBannerProps) {
  if (!errorMessage) {
    return null;
  }

  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs">
      {errorMessage}
    </div>
  );
}
