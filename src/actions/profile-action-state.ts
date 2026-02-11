export type ProfileActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const initialProfileActionState: ProfileActionState = {
  status: "idle",
  message: "",
};
