import { Schema, model, InferSchemaType, Types } from "mongoose";

export const ROLES = ["operator", "supervisor", "admin"] as const;
export type Role = (typeof ROLES)[number];

const userSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ROLES, required: true },
  companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
}, { timestamps: true });

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: Types.ObjectId };

export const User = model("User", userSchema);
