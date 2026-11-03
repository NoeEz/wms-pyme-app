import type { MovementType } from "../models/Movement";

const PREFIX: Record<MovementType, string> = {
  inbound: "ENT",
  outbound: "SAL",
  transfer: "TRA",
  adjustment: "AJU",
};

export function generateFolio(type: MovementType, sequence: number, now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const seq = String(sequence).padStart(4, "0");
  return `${PREFIX[type]}-${y}${m}${d}-${seq}`;
}
