import { Types } from "mongoose";
import type { AuthPayload } from "../middleware/auth";
import { AuditLog, type AuditAction, type AuditEntity } from "../models/AuditLog";

export interface AuditChange { field: string; from: unknown; to: unknown }

function plain(v: unknown): unknown {
  return v instanceof Types.ObjectId ? v.toString() : v ?? null;
}

/**
 * Applies `patch` to `doc` for the given fields and returns what actually
 * changed (unchanged and absent fields are skipped). `null` clears a field.
 */
export function applyPatch(doc: any, patch: Record<string, unknown>, fields: readonly string[]): AuditChange[] {
  const changes: AuditChange[] = [];
  for (const field of fields) {
    if (!(field in patch)) continue;
    const from = plain(doc.get(field));
    const to = plain(patch[field]);
    if (JSON.stringify(from) === JSON.stringify(to)) continue;
    doc.set(field, to ?? undefined);
    changes.push({ field, from, to });
  }
  return changes;
}

export async function audit(
  auth: AuthPayload,
  entry: { action: AuditAction; entity: AuditEntity; entityId?: unknown; label?: string; reason?: string; changes?: AuditChange[] },
): Promise<void> {
  await AuditLog.create({ companyId: auth.companyId, userId: auth.sub, userName: auth.name, ...entry });
}

/** "update" — or "deactivate" / "activate" when the only change is the active flag. */
export function updateAction(changes: AuditChange[], activeField = "active"): AuditAction {
  if (changes.length === 1 && changes[0].field === activeField) {
    const to = changes[0].to;
    return to === false || to === "inactive" ? "deactivate" : "activate";
  }
  return "update";
}
