import { Schema, model, InferSchemaType, Types } from "mongoose";

// A 3PL customer: a third party whose merchandise this company stores. Each
// product belongs to at most one customer (Product.customerId); users with
// role "client" are tied to one customer and only ever see its products.
const customerSchema = new Schema({
  companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
  code: { type: String, required: true, uppercase: true, trim: true },
  name: { type: String, required: true },
  contactEmail: { type: String, lowercase: true, trim: true },
  active: { type: Boolean, default: true },
}, { timestamps: true });

customerSchema.index({ companyId: 1, code: 1 }, { unique: true });

export type CustomerDoc = InferSchemaType<typeof customerSchema> & { _id: Types.ObjectId };

export const Customer = model("Customer", customerSchema);
