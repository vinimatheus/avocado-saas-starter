import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/shared/utils";

type AppPageHeroTag = {
  label: string;
  variant?: React.ComponentProps<typeof Badge>["variant"];
};

type AppPageHeroProps = {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  tags?: AppPageHeroTag[];
  className?: string;
};

export function AppPageHero({
  icon: Icon,
  eyebrow,
  title,
  description,
  tags = [],
  className,
}: AppPageHeroProps) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-gradient-to-br from-background via-background to-primary/5 p-6 sm:p-8",
        className,
      )}
    >
      <Icon className="text-primary/20 absolute -top-6 -right-6 size-24" />

      <div className="relative z-10 space-y-4">
        <div className="max-w-2xl space-y-2">
          <Badge variant="secondary" className="w-fit">
            <Icon data-icon="inline-start" />
            {eyebrow}
          </Badge>

          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          <p className="text-muted-foreground text-sm sm:text-base">{description}</p>
        </div>

        {tags.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {tags.map((tag) => (
              <Badge key={`${tag.label}-${tag.variant ?? "default"}`} variant={tag.variant ?? "outline"}>
                {tag.label}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
