"use client";

import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import { BoxesIcon, MailPlusIcon, UsersIcon } from "lucide-react";

import type { DashboardTrendPoint } from "@/lib/dashboard/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

type DashboardAreaChartsProps = {
  data: DashboardTrendPoint[];
};

const usersChartConfig = {
  usersTotal: {
    label: "Usuarios no time",
    color: "var(--chart-2)",
  },
  usersNew: {
    label: "Novos usuarios",
    color: "var(--chart-4)",
  },
} satisfies ChartConfig;

const teamChartConfig = {
  invitationsSent: {
    label: "Convites enviados",
    color: "var(--chart-1)",
  },
  invitationsPending: {
    label: "Pendentes",
    color: "var(--chart-5)",
  },
} satisfies ChartConfig;

const productsChartConfig = {
  productsNew: {
    label: "Produtos criados",
    color: "var(--chart-3)",
  },
  productsActive: {
    label: "Produtos ativos",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

function areaChartAxis() {
  return (
    <XAxis
      dataKey="month"
      tickLine={false}
      axisLine={false}
      tickMargin={8}
      minTickGap={18}
    />
  );
}

export function DashboardAreaCharts({ data }: DashboardAreaChartsProps) {
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UsersIcon className="size-4" />
            Usuarios
          </CardTitle>
          <CardDescription>Crescimento mensal e total acumulado do time.</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <ChartContainer config={usersChartConfig} className="h-72 w-full">
            <AreaChart data={data} margin={{ top: 8, right: 6, left: 6, bottom: 0 }}>
              <defs>
                <linearGradient id="usersTotalFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-usersTotal)" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="var(--color-usersTotal)" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="usersNewFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-usersNew)" stopOpacity={0.24} />
                  <stop offset="95%" stopColor="var(--color-usersNew)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="4 4" />
              {areaChartAxis()}
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <Area
                type="monotone"
                dataKey="usersTotal"
                stroke="var(--color-usersTotal)"
                strokeWidth={2.2}
                fill="url(#usersTotalFill)"
                fillOpacity={1}
              />
              <Area
                type="monotone"
                dataKey="usersNew"
                stroke="var(--color-usersNew)"
                strokeWidth={2}
                fill="url(#usersNewFill)"
                fillOpacity={1}
              />
              <ChartLegend content={<ChartLegendContent />} />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MailPlusIcon className="size-4" />
            Time
          </CardTitle>
          <CardDescription>Convites enviados e convites ainda pendentes por mes.</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <ChartContainer config={teamChartConfig} className="h-72 w-full">
            <AreaChart data={data} margin={{ top: 8, right: 6, left: 6, bottom: 0 }}>
              <defs>
                <linearGradient id="teamInvitationsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-invitationsSent)" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="var(--color-invitationsSent)" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="teamPendingFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-invitationsPending)" stopOpacity={0.24} />
                  <stop offset="95%" stopColor="var(--color-invitationsPending)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="4 4" />
              {areaChartAxis()}
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <Area
                type="monotone"
                dataKey="invitationsSent"
                stroke="var(--color-invitationsSent)"
                strokeWidth={2.2}
                fill="url(#teamInvitationsFill)"
                fillOpacity={1}
              />
              <Area
                type="monotone"
                dataKey="invitationsPending"
                stroke="var(--color-invitationsPending)"
                strokeWidth={2}
                fill="url(#teamPendingFill)"
                fillOpacity={1}
              />
              <ChartLegend content={<ChartLegendContent />} />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BoxesIcon className="size-4" />
            Produtos
          </CardTitle>
          <CardDescription>Novos cadastros e produtos ativos nos ultimos meses.</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <ChartContainer config={productsChartConfig} className="h-72 w-full">
            <AreaChart data={data} margin={{ top: 8, right: 6, left: 6, bottom: 0 }}>
              <defs>
                <linearGradient id="productsNewFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-productsNew)" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="var(--color-productsNew)" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="productsActiveFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-productsActive)" stopOpacity={0.24} />
                  <stop offset="95%" stopColor="var(--color-productsActive)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="4 4" />
              {areaChartAxis()}
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <Area
                type="monotone"
                dataKey="productsNew"
                stroke="var(--color-productsNew)"
                strokeWidth={2.2}
                fill="url(#productsNewFill)"
                fillOpacity={1}
              />
              <Area
                type="monotone"
                dataKey="productsActive"
                stroke="var(--color-productsActive)"
                strokeWidth={2}
                fill="url(#productsActiveFill)"
                fillOpacity={1}
              />
              <ChartLegend content={<ChartLegendContent />} />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}
