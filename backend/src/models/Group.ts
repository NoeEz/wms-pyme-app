import { Schema, model, InferSchemaType, Types } from "mongoose";

// Work group (Tesina §4.5.10 "Administración de grupos"): its members get
// the permissions of the group's roles, and the group can restrict them to
// some warehouses. Managed by the administrator only.
const groupSchema = new Schema({
  companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: "" },
  memberIds: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [] },
  roleIds: { type: [{ type: Schema.Types.ObjectId, ref: "AccessRole" }], default: [] },
  // Empty = no warehouse restriction from this group.
  warehouseIds: { type: [{ type: Schema.Types.ObjectId, ref: "Warehouse" }], default: [] },
  active: { type: Boolean, default: true },
}, { timestamps: true });

groupSchema.index({ companyId: 1, name: 1 }, { unique: true });
groupSchema.index({ companyId: 1, memberIds: 1 });

export type GroupDoc = InferSchemaType<typeof groupSchema> & { _id: Types.ObjectId };

export const Group = model("Group", groupSchema);
