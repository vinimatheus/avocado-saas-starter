type StatusBannerProps = {
  message: string | null;
};

export function StatusBanner({ message }: StatusBannerProps) {
  if (!message) {
    return null;
  }

  return <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs">{message}</div>;
}
