import Link from "next/link";
import { GithubIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const REPOSITORY_URL = "https://github.com/vinimatheus/avocado-saas-starter";

type GitHubCreditLinkProps = {
  className?: string;
};

export function GitHubCreditLink({ className }: GitHubCreditLinkProps) {
  return (
    <Link
      href={REPOSITORY_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Repositorio vinimatheus/avocado-saas-starter no GitHub"
      className={cn(
        "text-muted-foreground hover:text-foreground inline-flex size-8 items-center justify-center rounded-full border border-border bg-card/70 transition-colors hover:bg-primary/5",
        className,
      )}
    >
      <GithubIcon className="size-3.5" />
    </Link>
  );
}
