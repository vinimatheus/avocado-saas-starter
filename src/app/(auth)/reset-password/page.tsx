import { ResetPasswordForm } from "@/components/auth/reset-password-form";

type SearchParamsInput =
  | Record<string, string | string[] | undefined>
  | Promise<Record<string, string | string[] | undefined>>;

function getSingleSearchParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function resolveCallbackPath(value: string): string {
  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return "/";
  }
  if (!normalizedValue.startsWith("/")) {
    return "/";
  }
  if (normalizedValue.startsWith("//")) {
    return "/";
  }

  return normalizedValue;
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const token = getSingleSearchParam(resolvedSearchParams.token).trim() || null;
  const tokenError = getSingleSearchParam(resolvedSearchParams.error).trim() || null;
  const callbackPath = resolveCallbackPath(getSingleSearchParam(resolvedSearchParams.next));

  return <ResetPasswordForm token={token} tokenError={tokenError} callbackPath={callbackPath} />;
}
