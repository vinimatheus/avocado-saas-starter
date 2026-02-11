import { redirect } from "next/navigation";

import { SignUpForm } from "@/components/auth/sign-up-form";
import { getServerSession } from "@/lib/auth/session";

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

export default async function SignUpPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const callbackPath = resolveCallbackPath(getSingleSearchParam(resolvedSearchParams.next));
  const initialEmail = getSingleSearchParam(resolvedSearchParams.email);
  const skipOrganizationCreation = callbackPath.startsWith("/convites/aceitar");

  const session = await getServerSession();
  if (session?.user) {
    redirect(callbackPath);
  }

  return (
    <SignUpForm
      callbackPath={callbackPath}
      initialEmail={initialEmail}
      skipOrganizationCreation={skipOrganizationCreation}
    />
  );
}
