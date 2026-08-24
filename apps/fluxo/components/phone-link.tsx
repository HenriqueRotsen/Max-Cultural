import { cn } from "@/lib/utils";
import { formatPhoneDisplay, whatsappUrl } from "@/lib/normalize";

type PhoneLinkProps = {
  phone: unknown;
  className?: string;
  /** Texto exibido; se omitido, formata o telefone. */
  label?: string;
};

/** Telefone clicável abrindo conversa no WhatsApp. */
export function PhoneLink({ phone, className, label }: PhoneLinkProps) {
  const display = (label ?? formatPhoneDisplay(phone)).trim();
  if (!display) return null;

  const href = whatsappUrl(phone);
  if (!href) {
    return <span className={className}>{display}</span>;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "text-brand underline-offset-2 hover:underline",
        className,
      )}
      title="Abrir no WhatsApp"
    >
      {display}
    </a>
  );
}
