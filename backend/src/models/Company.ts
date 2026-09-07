import { Schema, model, InferSchemaType, Types } from "mongoose";
import { ALL_MODULE_KEYS } from "../config/modules";

const companySchema = new Schema({
  name: { type: String, required: true },
  // EPIC-6 "Módulos Personalizables" — which operational modules this
  // company's admin has enabled. Defaults to everything on.
  enabledModules: { type: [String], default: () => [...ALL_MODULE_KEYS] },
}, { timestamps: true });

export type CompanyDoc = InferSchemaType<typeof companySchema> & { _id: Types.ObjectId };

export const Company = model("Company", companySchema);
