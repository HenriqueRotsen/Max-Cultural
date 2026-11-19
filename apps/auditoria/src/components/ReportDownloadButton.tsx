"use client";

import { useReportDownload } from "./useReportDownload";

type Props = {
  href: string;
  label?: string;
  className?: string;
};

export function ReportDownloadButton({ href, label = "Gerar relatório PDF", className = "btn btn-gold" }: Props) {
  const { download, pending, dialog } = useReportDownload();
  return (
    <>
      <button type="button" className={className} disabled={pending} onClick={() => download(href)}>
        {pending ? "Gerando PDF…" : label}
      </button>
      {dialog}
    </>
  );
}
