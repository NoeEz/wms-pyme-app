// Excel / PDF export of any table, built in the browser. The libraries are
// loaded on demand so they don't weigh on the first page load.
import type { SheetData } from "write-excel-file/browser";

export type CellValue = string | number | Date | null | undefined;

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => CellValue;
  kind?: "text" | "number" | "money" | "date" | "datetime";
  width?: number; // Excel width in characters
}

export interface ExportSpec<T> {
  fileName: string; // without extension
  title: string;
  subtitle?: string;
  columns: ExportColumn<T>[];
  rows: T[];
}

const EXCEL_FORMAT = {
  number: "#,##0.###",
  money: "$#,##0.00",
  date: "dd/mm/yyyy",
  datetime: "dd/mm/yyyy hh:mm",
} as const;

function pdfText(value: CellValue, kind: ExportColumn<unknown>["kind"]): string {
  if (value == null || value === "") return "";
  if (value instanceof Date) {
    return kind === "date"
      ? value.toLocaleDateString("es-MX")
      : value.toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
  }
  if (typeof value === "number") {
    return kind === "money"
      ? value.toLocaleString("es-MX", { style: "currency", currency: "MXN" })
      : value.toLocaleString("es-MX", { maximumFractionDigits: 3 });
  }
  return String(value);
}

export async function exportExcel<T>(spec: ExportSpec<T>): Promise<void> {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const header = spec.columns.map(c => ({ value: c.header, fontWeight: "bold" as const }));
  const body = spec.rows.map(row => spec.columns.map(c => {
    const value = c.value(row);
    if (value == null || value === "") return null;
    const format = c.kind && c.kind !== "text" ? EXCEL_FORMAT[c.kind] : undefined;
    return format ? { value, format } : { value };
  }));
  const titleRows = [[{ value: spec.title, fontWeight: "bold" as const }], ...(spec.subtitle ? [[{ value: spec.subtitle }]] : []), [null]];
  await writeExcelFile([...titleRows, header, ...body] as SheetData, {
    columns: spec.columns.map(c => ({ width: c.width ?? Math.max(10, Math.min(40, c.header.length + 4)) })),
  }).toFile(`${spec.fileName}.xlsx`);
}

export async function exportPdf<T>(spec: ExportSpec<T>): Promise<void> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const landscape = spec.columns.length > 6;
  const doc = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "pt", format: "letter" });
  doc.setFontSize(14);
  doc.text(spec.title, 40, 40);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text([spec.subtitle ?? "", `Generado el ${new Date().toLocaleString("es-MX")} · WMS PyME`].filter(Boolean), 40, 56);
  autoTable(doc, {
    startY: spec.subtitle ? 80 : 70,
    head: [spec.columns.map(c => c.header)],
    body: spec.rows.map(row => spec.columns.map(c => pdfText(c.value(row), c.kind))),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: Object.fromEntries(spec.columns.map((c, i) => [i, { halign: c.kind === "number" || c.kind === "money" ? "right" : "left" }])),
    margin: { left: 40, right: 40 },
  });
  doc.save(`${spec.fileName}.pdf`);
}

/** "kardex-BAL-6204-2026-11-03" style names, safe for every OS. */
export function exportName(...parts: string[]): string {
  return [...parts, new Date().toISOString().slice(0, 10)].join("-").replace(/[^\w.-]+/g, "_");
}
