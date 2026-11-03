import { Schema, model, InferSchemaType, Types } from "mongoose";

const locationSchema = new Schema({
  warehouseId: { type: Schema.Types.ObjectId, ref: "Warehouse", required: true },
  zone: { type: String, required: true },
  aisle: { type: String, required: true },
  rack: { type: String, required: true },
  position: { type: String, required: true },
  code: { type: String, required: true }, // compact code, e.g. A-03-R02-P04
  active: { type: Boolean, default: true },
}, { timestamps: true });

locationSchema.index({ warehouseId: 1, code: 1 }, { unique: true });

export type LocationDoc = InferSchemaType<typeof locationSchema> & { _id: Types.ObjectId };

export const Location = model("Location", locationSchema);
