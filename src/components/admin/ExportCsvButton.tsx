"use client";

import { Download } from "lucide-react";

export default function ExportCsvButton({
  href,
  label = "Export CSV",
}: {
  href: string;
  label?: string;
}) {
  return (
    <a
      href={href}
      download
      className="admin-button-secondary inline-flex items-center gap-1.5 px-3 py-2 text-xs"
    >
      <Download size={14} />
      {label}
    </a>
  );
}
