import { useState } from "react";
import { errorMessage } from "../lib/api";
import { useCan } from "../lib/auth";
import { useModuleSetting } from "../lib/data";
import { exportExcel, exportPdf, type ExportSpec } from "../lib/export";
import { Button } from "./ui";

/** "Excel" and "PDF" buttons for whatever table a page is showing. */
export function ExportButtons<T>({ spec, disabled }: { spec: () => ExportSpec<T>; disabled?: boolean }) {
  const [busy, setBusy] = useState<"xlsx" | "pdf" | null>(null);
  // Permission "reports.export" and the reports module's "allowExport" setting.
  const canExport = useCan("reports.export");
  const allowed = useModuleSetting("reports", "allowExport");

  async function run(kind: "xlsx" | "pdf") {
    setBusy(kind);
    try {
      await (kind === "xlsx" ? exportExcel(spec()) : exportPdf(spec()));
    } catch (err) {
      window.alert(`No se pudo generar el archivo: ${errorMessage(err)}`);
    } finally {
      setBusy(null);
    }
  }

  if (!canExport || allowed === false) return null;
  return (
    <>
      <Button variant="secondary" size="sm" icon="download" loading={busy === "xlsx"} disabled={disabled || !!busy} onClick={() => run("xlsx")}>Excel</Button>
      <Button variant="secondary" size="sm" icon="download" loading={busy === "pdf"} disabled={disabled || !!busy} onClick={() => run("pdf")}>PDF</Button>
    </>
  );
}
