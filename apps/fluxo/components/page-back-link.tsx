"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  href: string;
  label?: string;
  className?: string;
};

export function PageBackLink({ href, label = "Voltar", className }: Props) {
  const router = useRouter();

  return (
    <Link
      href={href}
      onClick={(e) => {
        e.preventDefault();
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
          return;
        }
        router.push(href);
      }}
      className={cn(
        "inline-flex max-w-[min(100%,14rem)] items-center gap-1.5 truncate rounded-lg px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-brand-mist/60 hover:text-brand-deep sm:max-w-none",
        className,
      )}
    >
      <ArrowLeft className="size-4 shrink-0" aria-hidden />
      {label}
    </Link>
  );
}
