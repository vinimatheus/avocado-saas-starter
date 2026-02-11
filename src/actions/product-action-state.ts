export type ProductActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const initialProductActionState: ProductActionState = {
  status: "idle",
  message: "",
};
