import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "MAX Fluxo";

type BrandLogoProps = {
  href?: string;
  tone?: "light" | "dark";
  markOnly?: boolean;
  wordmarkOnly?: boolean;
  markSize?: number;
  wordmarkHeight?: number;
  showTagline?: boolean;
  className?: string;
  priority?: boolean;
};

export function BrandLogo({
  href = "/dashboard",
  markOnly = false,
  wordmarkHeight = 36,
  showTagline = false,
  className,
  priority = false,
}: BrandLogoProps) {
  const content = markOnly ? (
    <Image
      src="/brand/max-fluxo.png"
      alt={appName}
      width={wordmarkHeight * 3}
      height={wordmarkHeight}
      priority={priority}
      className="h-9 w-auto max-w-[180px] object-contain object-left"
    />
  ) : (
    <span className="flex min-w-0 flex-col">
      <Image
        src="/brand/max-fluxo.png"
        alt={appName}
        width={220}
        height={56}
        priority={priority}
        className="h-10 w-auto max-w-[200px] object-contain object-left"
      />
      {showTagline ? (
        <span className="mt-0.5 hidden text-[11px] tracking-wide text-muted-foreground sm:block">
          Execução · Gestão · Acompanhamento
        </span>
      ) : null}
    </span>
  );

  if (!href) {
    return (
      <span className={cn("inline-flex items-center", className)}>{content}</span>
    );
  }

  return (
    <Link
      href={href}
      className={cn("group inline-flex items-center transition-opacity hover:opacity-90", className)}
      aria-label={appName}
    >
      {content}
    </Link>
  );
}
