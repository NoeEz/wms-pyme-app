import { Schema, model, InferSchemaType, Types } from "mongoose";

const warehouseSchema = new Schema({
  companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
  name: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, enum: ["active", "inactive"], default: "active" },
}, { timestamps: true });

export type WarehouseDoc = InferSchemaType<typeof warehouseSchema> & { _id: Types.ObjectId };

export const Warehouse = model("Warehouse", warehouseSchema);
