import Image from "next/image";
import Link from "next/link";

export function MaxCulturalLogo({ className = "" }: { className?: string }) {
  return (
    <Image
      src="/brand/max-cultural.png"
      alt="MAX Cultural"
      width={220}
      height={72}
      className={`h-10 w-auto max-w-[220px] object-contain object-left ${className}`}
      priority
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
