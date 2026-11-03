import { Schema, model, InferSchemaType, Types } from "mongoose";

export const AUDIT_ENTITIES = ["company", "modules", "warehouse", "location", "product", "customer", "user", "count"] as const;
export type AuditEntity = (typeof AUDIT_ENTITIES)[number];

export const AUDIT_ACTIONS = ["create", "update", "deactivate", "activate", "count"] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

// Who changed what and when, for everything managed from the web portal.
// Stock movements aren't duplicated here — Movement already records the
// user, time and lines of every stock change.
const auditLogSchema = new Schema({
  companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  userName: { type: String, required: true }, // as it was at the time
  action: { type: String, enum: AUDIT_ACTIONS, required: true },
  entity: { type: String, enum: AUDIT_ENTITIES, required: true },
  entityId: { type: Schema.Types.ObjectId },
  label: { type: String }, // human handle: SKU, location code, email…
  changes: [{ _id: false, field: String, from: Schema.Types.Mixed, to: Schema.Types.Mixed }],
}, { timestamps: { createdAt: "createdAt", updatedAt: false } });

auditLogSchema.index({ companyId: 1, createdAt: -1 });

export type AuditLogDoc = InferSchemaType<typeof auditLogSchema> & { _id: Types.ObjectId };

export const AuditLog = model("AuditLog", auditLogSchema);
