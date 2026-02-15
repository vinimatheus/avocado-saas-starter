import type { ReactNode } from "react";

import Image from "next/image";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/shared/utils";

type AppPageHighlightCardProps = {
  eyebrow: string;
  title: string;
  description: string;
  imageSrc: string;
  imageAlt: string;
  beforeTitle?: ReactNode;
  className?: string;
  imagePriority?: boolean;
};

export function AppPageHighlightCard({
  eyebrow,
  title,
  description,
  imageSrc,
  imageAlt,
  beforeTitle,
  className,
  imagePriority = true,
}: AppPageHighlightCardProps) {
  return (
    <Card
      className={cn(
        "overflow-hidden border-primary/30 bg-gradient-to-br from-background via-background to-primary/10",
        className,
      )}
    >
      <CardContent className="p-0">
        <div className="grid items-center gap-3 sm:grid-cols-[1.3fr_0.7fr]">
          <div className="space-y-2 px-5 py-4 sm:px-6 sm:py-4">
            <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[0.12em]">
              {eyebrow}
            </p>
            {beforeTitle}
            <h2 className="text-lg font-semibold tracking-tight sm:text-xl">{title}</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
          </div>

          <div className="relative order-last h-28 w-full sm:order-none sm:h-[150px]">
            <div className="relative ml-auto h-full w-[72%] sm:w-[88%]">
              <Image
                src={imageSrc}
                alt={imageAlt}
                fill
                priority={imagePriority}
                sizes="(max-width: 640px) 72vw, 28vw"
                className="object-contain object-right"
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
