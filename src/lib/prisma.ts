import { prisma as prismaClient } from "@/lib/db/prisma";

// Legacy inventory code expects delegates not present in the current Prisma schema.
// Keeping this as `any` preserves backward compatibility for those modules.
export const prisma: any = prismaClient;
