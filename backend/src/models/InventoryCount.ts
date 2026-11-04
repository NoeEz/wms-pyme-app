import { Schema, model, InferSchemaType, Types } from "mongoose";

// A physical count of one location. `expected` is what the system had when
// the count was saved; any difference was corrected by the adjustment
// movement. Source of the inventory-accuracy KPI (WERC "inventory count
// accuracy by location": share of counted locations with no discrepancy).
const countLineSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
  expected: { type: Number, required: true },
  counted: { type: Number, required: true },
  // Balance right before the adjustment was applied: equals `expected` when
  // applied at once, may differ when the adjustment waited for approval.
  before: { type: Number },
}, { _id: false });

// applied: stock set to the counted quantities (AJU movement if any diff).
// pending: critical difference waiting for another user's authorization
// (inventory module setting); stock untouched. rejected: never applied.
export const COUNT_STATUSES = ["applied", "pending", "rejected"] as const;

const inventoryCountSchema = new Schema({
  companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
  warehouseId: { type: Schema.Types.ObjectId, ref: "Warehouse", required: true },
  locationId: { type: Schema.Types.ObjectId, ref: "Location", required: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  lines: { type: [countLineSchema], required: true },
  accurate: { type: Boolean, required: true },
  adjustmentId: { type: Schema.Types.ObjectId, ref: "Movement" },
  notes: { type: String },
  status: { type: String, enum: COUNT_STATUSES, default: "applied" },
  reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
  reviewedAt: { type: Date },
  reviewNote: { type: String },
}, { timestamps: { createdAt: "createdAt", updatedAt: false } });

inventoryCountSchema.index({ companyId: 1, createdAt: -1 });

export type InventoryCountDoc = InferSchemaType<typeof inventoryCountSchema> & { _id: Types.ObjectId };

export const InventoryCount = model("InventoryCount", inventoryCountSchema);
