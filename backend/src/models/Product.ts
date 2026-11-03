import { Schema, model, InferSchemaType, Types } from "mongoose";

export const TRACKING_MODES = ["none", "lot", "serial"] as const;
export type TrackingMode = (typeof TRACKING_MODES)[number];

const productSchema = new Schema({
  companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
  sku: { type: String, required: true },
  name: { type: String, required: true },
  barcodeValues: { type: [String], default: [] },
  unit: { type: String, default: "pza" },
  tracking: { type: String, enum: TRACKING_MODES, default: "none" },
  lowStockThreshold: { type: Number, default: 0 },
  // Optional unit cost, for inventory valuation and turnover in money.
  cost: { type: Number, min: 0 },
  // 3PL owner; unset means the company's own merchandise.
  customerId: { type: Schema.Types.ObjectId, ref: "Customer" },
  active: { type: Boolean, default: true },
}, { timestamps: true });

productSchema.index({ companyId: 1, sku: 1 }, { unique: true });

export type ProductDoc = InferSchemaType<typeof productSchema> & { _id: Types.ObjectId };

export const Product = model("Product", productSchema);
