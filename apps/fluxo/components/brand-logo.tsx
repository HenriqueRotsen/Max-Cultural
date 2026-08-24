import Link from "next/link";
import { cn } from "@/lib/utils";

const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "MAX Fluxo";

type BrandLogoProps = {
  href?: string;
  markOnly?: boolean;
  className?: string;
  priority?: boolean;
};

export function BrandLogo({
  href = "/dashboard",
  markOnly = false,
  className,
}: BrandLogoProps) {
  const content = (
    <img
      src="/brand/max-fluxo.png"
      alt={appName}
      width={1668}
      height={645}
      className={cn(
        "w-auto bg-transparent object-contain object-left",
        markOnly ? "h-9 max-w-[180px]" : "h-12 max-w-[220px]",
      )}
    />
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
