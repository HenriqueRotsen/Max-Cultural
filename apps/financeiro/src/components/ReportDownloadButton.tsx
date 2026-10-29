"use client";

type Props = {
  href: string;
  label?: string;
};

export function ReportDownloadButton({ href, label = "Gerar relatório PDF" }: Props) {
  return (
    <a className="btn btn-gold" href={href} target="_blank" rel="noreferrer">
      {label}
    </a>
  );
}
