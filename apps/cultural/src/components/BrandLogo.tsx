import Link from "next/link";

export function MaxCulturalLogo({ className = "" }: { className?: string }) {
  return (
    <img
      src="/brand/max-cultural.png"
      alt="MAX Cultural"
      width={1531}
      height={571}
      className={`h-12 w-auto max-w-[240px] bg-transparent object-contain object-left ${className}`}
    />
  );
}

export function MaxCulturalLogoLink({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-block">
      <MaxCulturalLogo />
    </Link>
  );
}
