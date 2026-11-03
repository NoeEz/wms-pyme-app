// Parsing of whatever a scan produces — camera, handheld (keyboard-wedge)
// reader or a pasted string — into something we can look up in the catalog.
//
// Two kinds of codes are accepted:
//
// 1. WMS PyME labels (QR), versioned:
//      WMSPYME|v1|sku=BAL-6204|lot=L2408|serial=SN-0001
//    - Fields are `key=value`, separated by `|`, any order after the version.
//    - At least one of `sku` or `productId` is required; `lot` and `serial` are optional.
//    - Unknown keys are ignored, so v1 readers tolerate extra fields.
//    - A version this app doesn't know is rejected rather than half-parsed.
//
// 2. Plain barcodes (EAN-13, Code 128, a bare SKU…) printed by the supplier.
//    These carry no lot/serial and are resolved against the product's
//    `sku` / `barcodeValues` in the backend.

export const WMS_QR_PREFIX = "WMSPYME";
export const SUPPORTED_QR_VERSIONS = ["v1"] as const;

export type ParsedScan =
  | { kind: "wms"; version: string; code: string; sku?: string; productId?: string; lot?: string; serial?: string }
  | { kind: "barcode"; code: string };

export type ParseResult =
  | { ok: true; scan: ParsedScan }
  | { ok: false; error: string };

// Handheld readers sometimes append CR/LF/tab; strip anything non-printable.
function clean(raw: string): string {
  return raw.replace(/[\x00-\x1F\x7F]/g, "").trim();
}

export function parseScan(raw: string): ParseResult {
  const value = clean(raw);
  if (!value) return { ok: false, error: "Código vacío" };

  if (!value.toUpperCase().startsWith(`${WMS_QR_PREFIX}|`)) {
    if (value.includes("|")) return { ok: false, error: "Formato no reconocido" };
    if (value.length > 64) return { ok: false, error: "Código demasiado largo" };
    return { ok: true, scan: { kind: "barcode", code: value } };
  }

  const [, version = "", ...fields] = value.split("|");
  if (!(SUPPORTED_QR_VERSIONS as readonly string[]).includes(version.toLowerCase())) {
    return { ok: false, error: `Versión de etiqueta no soportada (${version || "sin versión"})` };
  }

  const data: Record<string, string> = {};
  for (const field of fields) {
    const eq = field.indexOf("=");
    if (eq <= 0) continue;
    const key = field.slice(0, eq).trim().toLowerCase();
    const val = field.slice(eq + 1).trim();
    if (val) data[key] = val;
  }

  const code = data.sku ?? data.productid;
  if (!code) return { ok: false, error: "Código sin producto identificado" };

  return {
    ok: true,
    scan: {
      kind: "wms",
      version: version.toLowerCase(),
      code,
      sku: data.sku,
      productId: data.productid,
      lot: data.lot,
      serial: data.serial,
    },
  };
}

/** Builds a v1 label string — handy for printing labels and for tests. */
export function buildWmsQr(fields: { sku: string; lot?: string; serial?: string }): string {
  const parts = [WMS_QR_PREFIX, "v1", `sku=${fields.sku}`];
  if (fields.lot) parts.push(`lot=${fields.lot}`);
  if (fields.serial) parts.push(`serial=${fields.serial}`);
  return parts.join("|");
}
