export type OrganizationUserActionState = {
  status: "idle" | "success" | "error";
  message: string;
  redirectTo: string | null;
};

export const initialOrganizationUserActionState: OrganizationUserActionState = {
  status: "idle",
  message: "",
  redirectTo: null,
};
