import { useCallback, useRef } from "react";
import { parseScan } from "./scanCodes";
import { findProductByCode } from "./products";
import { scanFeedback } from "./feedback";
import type { MovementItem, Product, ScanState } from "../types";

// Shared read pipeline for every scan source (handheld/keyboard-wedge reader
// and camera): parse → resolve product (server, or cached catalog offline)
// → validate against what's already in the movement → add + feedback.

export interface ScanOutcome {
  state: Extract<ScanState, "added" | "duplicate" | "invalid_format" | "not_found" | "needs_serial">;
  message: string;
  raw: string;
  product?: Product;
  lot?: string;
  serial?: string;
}

const FEEDBACK: Record<ScanOutcome["state"], "success" | "warning" | "error"> = {
  added: "success",
  duplicate: "warning",
  needs_serial: "warning",
  invalid_format: "error",
  not_found: "error",
};

export function useScanProcessor({ token, items, onAddItem }: {
  token: string;
  items: MovementItem[];
  onAddItem: (item: MovementItem) => void;
}) {
  const busy = useRef(false);
  // Serials accepted during this screen's lifetime: `items` updates a render
  // later, so a fast reader could otherwise slip the same serial in twice.
  const seenSerials = useRef(new Set<string>());

  const run = useCallback(async (raw: string): Promise<ScanOutcome> => {
    const parsed = parseScan(raw);
    if (!parsed.ok) return { state: "invalid_format", message: parsed.error, raw };
    const scan = parsed.scan;

    let product: Product | null;
    try {
      product = await findProductByCode(token, scan.code);
    } catch {
      return { state: "not_found", message: "Sin conexión y el producto no está en el catálogo del dispositivo", raw };
    }
    if (!product) return { state: "not_found", message: "Producto no encontrado en el sistema", raw };

    const lot = scan.kind === "wms" ? scan.lot : undefined;
    const serial = scan.kind === "wms" ? scan.serial : undefined;

    if (product.serialized) {
      if (!serial) {
        return { state: "needs_serial", message: `${product.sku} requiere número de serie — escanea su etiqueta WMS o usa captura manual`, raw, product };
      }
      const key = `${product.id}|${serial}`;
      const inMovement = items.some(i => i.product.id === product!.id && i.serials.includes(serial));
      if (inMovement || seenSerials.current.has(key)) {
        return { state: "duplicate", message: `Serie ${serial} ya fue registrada`, raw, product, serial };
      }
      seenSerials.current.add(key);
    }

    onAddItem({
      id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      product,
      lot,
      serials: serial ? [serial] : [],
      quantity: 1,
      scannedAt: new Date(),
    });
    return { state: "added", message: `${product.name} agregado`, raw, product, lot, serial };
  }, [token, items, onAddItem]);

  /** Returns null when a previous read is still being processed (the new one is dropped). */
  const process = useCallback(async (raw: string): Promise<ScanOutcome | null> => {
    if (busy.current || !raw.trim()) return null;
    busy.current = true;
    try {
      const outcome = await run(raw);
      scanFeedback(FEEDBACK[outcome.state]);
      return outcome;
    } finally {
      busy.current = false;
    }
  }, [run]);

  return { process };
}
