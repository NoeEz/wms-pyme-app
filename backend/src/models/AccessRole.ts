import { Schema, model, InferSchemaType, Types } from "mongoose";

// A role of the company's RBAC (Tesina §4.5.10): a named set of permissions.
// System roles ("operator", "supervisor", "admin") are created automatically
// per company and can't be renamed or deactivated; operator and supervisor
// permissions can be tuned, admin always has every permission. Custom roles
// are created by the administrator and assigned to users or groups.
// (Named AccessRole to avoid clashing with User's base `role` field.)
const accessRoleSchema = new Schema({
  companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
  key: { type: String, required: true }, // "operator" | "supervisor" | "admin" | "custom-…"
  name: { type: String, required: true, trim: true },
  description: { type: String, default: "" },
  permissions: { type: [String], default: [] },
  system: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
}, { timestamps: true, collection: "roles" });

accessRoleSchema.index({ companyId: 1, key: 1 }, { unique: true });
accessRoleSchema.index({ companyId: 1, name: 1 }, { unique: true });

export type AccessRoleDoc = InferSchemaType<typeof accessRoleSchema> & { _id: Types.ObjectId };

export const AccessRole = model("AccessRole", accessRoleSchema);
