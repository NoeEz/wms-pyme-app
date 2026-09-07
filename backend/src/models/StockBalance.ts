import { Schema, model, InferSchemaType, Types } from "mongoose";

const stockBalanceSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
  locationId: { type: Schema.Types.ObjectId, ref: "Location", required: true },
  available: { type: Number, required: true, default: 0 },
  reserved: { type: Number, required: true, default: 0 },
}, { timestamps: true });

stockBalanceSchema.index({ productId: 1, locationId: 1 }, { unique: true });

export type StockBalanceDoc = InferSchemaType<typeof stockBalanceSchema> & { _id: Types.ObjectId };

export const StockBalance = model("StockBalance", stockBalanceSchema);
