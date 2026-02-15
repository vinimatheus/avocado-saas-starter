import { prisma as prismaClient } from "@/lib/db/prisma";

// Legacy inventory code expects delegates not present in the current Prisma schema.
// Keeping this as `any` preserves backward compatibility for those modules.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const prisma: any = prismaClient;
