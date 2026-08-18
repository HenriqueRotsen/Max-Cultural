import Image from "next/image";

type Variant = "horizontal" | "stacked" | "mark";

export function MaxOrigemLogo({ className = "" }: { className?: string }) {
  return (
    <Image
      src="/brand/max-origem.png"
      alt="MAX Origem"
      width={220}
      height={72}
      className={`h-10 w-auto max-w-[200px] object-contain object-left ${className}`}
      priority
    />
  );
}

/** @deprecated use MaxOrigemLogo */
export function SalinkLogo({
  variant = "horizontal",
  className = "",
}: {
  variant?: Variant;
  className?: string;
  showTagline?: boolean;
  compact?: boolean;
}) {
  if (variant === "mark") {
    return (
      <Image
        src="/brand/max-origem.png"
        alt="MAX Origem"
        width={72}
        height={70}
        className={`h-9 w-auto object-contain ${className}`}
        priority
      />
    );
  }

  return <MaxOrigemLogo className={className} />;
}

export function SalinkMark({ className = "h-8 w-auto" }: { className?: string }) {
  return (
    <Image
      src="/brand/mark-ui.png"
      alt=""
      width={64}
      height={62}
      className={`object-contain ${className}`}
      aria-hidden
    />
  );
}
