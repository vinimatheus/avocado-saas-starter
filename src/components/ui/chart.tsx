"use client";

import * as React from "react";
import * as RechartsPrimitive from "recharts";

import { cn } from "@/lib/shared/utils";

export type ChartConfig = Record<
  string,
  {
    label: string;
    color: string;
  }
>;

type ChartContextValue = {
  config: ChartConfig;
};

const ChartContext = React.createContext<ChartContextValue | null>(null);

function useChartContext(): ChartContextValue {
  const context = React.useContext(ChartContext);

  if (!context) {
    throw new Error("Chart components should be used inside <ChartContainer>.");
  }

  return context;
}

type ChartContainerProps = React.ComponentProps<"div"> & {
  config: ChartConfig;
};

export function ChartContainer({ config, className, children, ...props }: ChartContainerProps) {
  const chartStyle = React.useMemo(() => {
    const cssVariables: Record<string, string> = {};

    for (const [key, value] of Object.entries(config)) {
      cssVariables[`--color-${key}`] = value.color;
    }

    return cssVariables as React.CSSProperties;
  }, [config]);

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        className={cn(
          "flex w-full justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground",
          "[&_.recharts-cartesian-grid_line]:stroke-border/60 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border",
          "[&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-none",
          "[&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-sector]:outline-none",
          "[&_.recharts-surface]:outline-none",
          className,
        )}
        style={chartStyle}
        {...props}
      >
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

export const ChartTooltip = RechartsPrimitive.Tooltip;
export const ChartLegend = RechartsPrimitive.Legend;

type ChartDatumPayload = {
  value?: number | string;
  dataKey?: string | number;
  name?: string | number;
  color?: string;
};

type ChartTooltipContentProps = React.ComponentProps<"div"> & {
  active?: boolean;
  payload?: ChartDatumPayload[];
  label?: string | number;
  hideLabel?: boolean;
};

function toLabel(config: ChartConfig, payload: ChartDatumPayload): string {
  const dataKey = String(payload.dataKey ?? payload.name ?? "");

  if (dataKey && config[dataKey]) {
    return config[dataKey].label;
  }

  if (payload.name) {
    return String(payload.name);
  }

  return dataKey;
}

function toColor(config: ChartConfig, payload: ChartDatumPayload): string {
  const dataKey = String(payload.dataKey ?? payload.name ?? "");

  if (payload.color) {
    return payload.color;
  }

  if (dataKey && config[dataKey]) {
    return config[dataKey].color;
  }

  return "hsl(var(--border))";
}

function toValue(value: number | string | undefined): string {
  if (typeof value === "number") {
    return value.toLocaleString("pt-BR");
  }

  return value ? String(value) : "0";
}

export function ChartTooltipContent({
  active,
  payload,
  label,
  hideLabel = false,
  className,
}: ChartTooltipContentProps) {
  const { config } = useChartContext();

  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <div className={cn("bg-popover min-w-44 rounded-lg border p-2 shadow-md", className)}>
      {!hideLabel && label ? (
        <p className="mb-1 text-[0.7rem] font-medium text-foreground/80">{String(label)}</p>
      ) : null}

      <div className="space-y-1">
        {payload.map((entry) => {
          const labelText = toLabel(config, entry);
          const color = toColor(config, entry);

          return (
            <div key={`${entry.dataKey ?? entry.name}-${labelText}`} className="flex items-center gap-2 text-xs">
              <span className="size-2 rounded-full" style={{ backgroundColor: color }} aria-hidden />
              <span className="text-muted-foreground">{labelText}</span>
              <span className="ml-auto font-medium tabular-nums">{toValue(entry.value)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type ChartLegendPayload = {
  color?: string;
  dataKey?: string | number;
  value?: string | number;
};

type ChartLegendContentProps = React.ComponentProps<"div"> & {
  payload?: ChartLegendPayload[];
};

export function ChartLegendContent({ payload, className }: ChartLegendContentProps) {
  const { config } = useChartContext();

  if (!payload || payload.length === 0) {
    return null;
  }

  return (
    <div className={cn("mt-3 flex flex-wrap items-center gap-3 text-xs", className)}>
      {payload.map((entry) => {
        const dataKey = String(entry.dataKey ?? entry.value ?? "");
        const configEntry = config[dataKey];
        const color = entry.color || configEntry?.color || "hsl(var(--border))";
        const label = configEntry?.label || dataKey;

        return (
          <div key={dataKey} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ backgroundColor: color }} aria-hidden />
            <span className="text-muted-foreground">{label}</span>
          </div>
        );
      })}
    </div>
  );
}
