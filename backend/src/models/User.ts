import { Schema, model, InferSchemaType, Types } from "mongoose";

// "client" is an external 3PL customer's user: web portal only, read-only,
// scoped to its customer's products.
export const ROLES = ["operator", "supervisor", "admin", "client"] as const;
export type Role = (typeof ROLES)[number];

const userSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ROLES, required: true },
  companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
  customerId: { type: Schema.Types.ObjectId, ref: "Customer" }, // required for role "client"
  active: { type: Boolean, default: true },
  // RBAC (Tesina §4.5.10). `role` above is the base (system) role; these are
  // extra custom roles, the warehouses the user may operate (empty = all,
  // unless a group restricts them) and individual exceptions — each with
  // its justification, set by an administrator and audited.
  roleIds: { type: [{ type: Schema.Types.ObjectId, ref: "AccessRole" }], default: [] },
  warehouseIds: { type: [{ type: Schema.Types.ObjectId, ref: "Warehouse" }], default: [] },
  permissionOverrides: {
    type: [{
      _id: false,
      permission: { type: String, required: true },
      effect: { type: String, enum: ["allow", "deny"], required: true },
      reason: { type: String, required: true },
      grantedBy: { type: Schema.Types.ObjectId, ref: "User" },
      grantedByName: { type: String },
      grantedAt: { type: Date, default: () => new Date() },
    }],
    default: [],
  },
}, { timestamps: true });

// Emails are unique per company, not globally — login names the company.
userSchema.index({ companyId: 1, email: 1 }, { unique: true });

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: Types.ObjectId };

export const User = model("User", userSchema);
