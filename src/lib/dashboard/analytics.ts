import { Prisma } from "@prisma/client";

import type { DashboardInsights, DashboardTrendPoint } from "@/lib/dashboard/types";
import { prisma } from "@/lib/db/prisma";

const TREND_MONTH_WINDOW = 6;

type MonthBucket = {
  key: string;
  label: string;
  start: Date;
  end: Date;
};

function startOfMonth(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), 1, 0, 0, 0, 0);
}

function addMonths(value: Date, amount: number): Date {
  return new Date(value.getFullYear(), value.getMonth() + amount, 1, 0, 0, 0, 0);
}

function monthKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(value: Date): string {
  const month = new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(value).replace(".", "");
  const year = String(value.getFullYear()).slice(-2);

  return `${month}/${year}`;
}

function buildMonthBuckets(windowSize: number, referenceDate: Date): MonthBucket[] {
  const firstMonthStart = addMonths(startOfMonth(referenceDate), -(windowSize - 1));
  const buckets: MonthBucket[] = [];

  for (let index = 0; index < windowSize; index += 1) {
    const start = addMonths(firstMonthStart, index);
    const end = addMonths(start, 1);
    buckets.push({
      key: monthKey(start),
      label: monthLabel(start),
      start,
      end,
    });
  }

  return buckets;
}

function toMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export async function getDashboardInsights(organizationId: string): Promise<DashboardInsights> {
  const buckets = buildMonthBuckets(TREND_MONTH_WINDOW, new Date());
  const windowStart = buckets[0]!.start;
  const bucketIndex = new Map(buckets.map((bucket, index) => [bucket.key, index]));
  const chartData: DashboardTrendPoint[] = buckets.map((bucket) => ({
    month: bucket.label,
    usersNew: 0,
    usersTotal: 0,
    invitationsSent: 0,
    invitationsPending: 0,
    productsNew: 0,
    productsActive: 0,
  }));
  const errors: string[] = [];

  let memberCount = 0;
  let pendingInvitationCount = 0;
  let membersBeforeWindow = 0;
  let membersInWindow: Array<{ createdAt: Date }> = [];
  let invitationsInWindow: Array<{ createdAt: Date; status: string }> = [];
  let productCount = 0;
  let productActiveCount = 0;
  let productsInWindow: Array<{ createdAt: Date; status: string }> = [];

  try {
    const [
      memberCountResult,
      pendingInvitationCountResult,
      membersBeforeWindowResult,
      membersInWindowResult,
      invitationsInWindowResult,
    ] = await Promise.all([
      prisma.member.count({
        where: {
          organizationId,
        },
      }),
      prisma.invitation.count({
        where: {
          organizationId,
          status: "pending",
        },
      }),
      prisma.member.count({
        where: {
          organizationId,
          createdAt: {
            lt: windowStart,
          },
        },
      }),
      prisma.member.findMany({
        where: {
          organizationId,
          createdAt: {
            gte: windowStart,
          },
        },
        select: {
          createdAt: true,
        },
      }),
      prisma.invitation.findMany({
        where: {
          organizationId,
          createdAt: {
            gte: windowStart,
          },
        },
        select: {
          createdAt: true,
          status: true,
        },
      }),
    ]);

    memberCount = memberCountResult;
    pendingInvitationCount = pendingInvitationCountResult;
    membersBeforeWindow = membersBeforeWindowResult;
    membersInWindow = membersInWindowResult;
    invitationsInWindow = invitationsInWindowResult;
  } catch (error) {
    errors.push(toMessage(error, "Nao foi possivel carregar os indicadores de usuarios e equipe."));
  }

  try {
    const [productCountResult, productActiveCountResult, productsInWindowResult] = await Promise.all([
      prisma.product.count({
        where: {
          organizationId,
        },
      }),
      prisma.product.count({
        where: {
          organizationId,
          status: "active",
        },
      }),
      prisma.product.findMany({
        where: {
          organizationId,
          createdAt: {
            gte: windowStart,
          },
        },
        select: {
          createdAt: true,
          status: true,
        },
      }),
    ]);

    productCount = productCountResult;
    productActiveCount = productActiveCountResult;
    productsInWindow = productsInWindowResult;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021") {
      errors.push("Tabela de produtos ainda nao existe no banco. Execute: npm run prisma:push");
    } else {
      errors.push(toMessage(error, "Nao foi possivel carregar os indicadores de produtos."));
    }
  }

  for (const row of membersInWindow) {
    const point = chartData[bucketIndex.get(monthKey(row.createdAt)) ?? -1];
    if (point) {
      point.usersNew += 1;
    }
  }

  for (const row of invitationsInWindow) {
    const point = chartData[bucketIndex.get(monthKey(row.createdAt)) ?? -1];
    if (!point) {
      continue;
    }

    point.invitationsSent += 1;
    if (row.status === "pending") {
      point.invitationsPending += 1;
    }
  }

  for (const row of productsInWindow) {
    const point = chartData[bucketIndex.get(monthKey(row.createdAt)) ?? -1];
    if (!point) {
      continue;
    }

    point.productsNew += 1;
    if (row.status === "active") {
      point.productsActive += 1;
    }
  }

  let runningUsersTotal = membersBeforeWindow;
  for (const point of chartData) {
    runningUsersTotal += point.usersNew;
    point.usersTotal = runningUsersTotal;
  }

  return {
    memberCount,
    pendingInvitationCount,
    productCount,
    productActiveCount,
    chartData,
    errorMessage: errors.length > 0 ? errors.join(" ") : null,
  };
}
