import Image from "next/image";
import { cn } from "@/lib/shared/utils";

type LogoProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
  showText?: boolean;
  showGlow?: boolean;
};

export function Logo({
  size = "md",
  className,
  showText = true,
  showGlow = true,
}: LogoProps) {
  const sizes = {
    sm: { img: 20, text: "text-[0.65rem]", saasText: "text-[0.58rem]" },
    md: { img: 26, text: "text-[0.75rem]", saasText: "text-[0.66rem]" },
    lg: { img: 36, text: "text-[0.9rem]", saasText: "text-[0.78rem]" },
  };

  const { img, text, saasText } = sizes[size];

  return (
    <div className={cn("inline-flex items-center gap-2.5", className)}>
      <div className="relative flex items-center justify-center">
        {showGlow && (
          <div className="bg-primary/20 absolute -inset-2 animate-pulse rounded-full blur-xl" />
        )}
        <Image
          src="/img/logo.png"
          alt="avocado SaaS"
          width={img}
          height={img}
          className="relative object-contain"
          priority
        />
      </div>
      {showText && (
        <div className="flex flex-col leading-tight">
          <span className={cn("text-muted-foreground font-bold tracking-[0.1em] uppercase", text)}>
            avocado
          </span>
          <span
            className={cn(
              "text-muted-foreground/80 font-semibold tracking-[0.06em]",
              saasText,
            )}
          >
            SaaS
          </span>
        </div>
      )}
    </div>
  );
}
