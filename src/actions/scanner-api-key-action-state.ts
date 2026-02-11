export type ScannerApiKeyActionState = {
  status: "idle" | "success" | "error";
  message: string;
  plainApiKey: string | null;
};

export const initialScannerApiKeyActionState: ScannerApiKeyActionState = {
  status: "idle",
  message: "",
  plainApiKey: null,
};

