import { Schema, model, InferSchemaType, Types } from "mongoose";

// A physical count of one location. `expected` is what the system had when
// the count was saved; any difference was corrected by the adjustment
// movement. Source of the inventory-accuracy KPI (WERC "inventory count
// accuracy by location": share of counted locations with no discrepancy).
const countLineSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
  expected: { type: Number, required: true },
  counted: { type: Number, required: true },
}, { _id: false });

const inventoryCountSchema = new Schema({
  companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
  warehouseId: { type: Schema.Types.ObjectId, ref: "Warehouse", required: true },
  locationId: { type: Schema.Types.ObjectId, ref: "Location", required: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  lines: { type: [countLineSchema], required: true },
  accurate: { type: Boolean, required: true },
  adjustmentId: { type: Schema.Types.ObjectId, ref: "Movement" },
  notes: { type: String },
}, { timestamps: { createdAt: "createdAt", updatedAt: false } });

inventoryCountSchema.index({ companyId: 1, createdAt: -1 });

export type InventoryCountDoc = InferSchemaType<typeof inventoryCountSchema> & { _id: Types.ObjectId };

export const InventoryCount = model("InventoryCount", inventoryCountSchema);
