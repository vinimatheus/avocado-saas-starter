export type InventoryActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const initialInventoryActionState: InventoryActionState = {
  status: "idle",
  message: "",
};
