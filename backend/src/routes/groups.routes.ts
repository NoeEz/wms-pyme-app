import { Router } from "express";
import { z } from "zod";
import { authenticate, requirePermission } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { AccessRole } from "../models/AccessRole";
import { Group } from "../models/Group";
import { User } from "../models/User";
import { Warehouse } from "../models/Warehouse";
import { applyPatch, audit, updateAction } from "../services/audit";

// Work groups (Tesina §4.5.10 "Administración de grupos"): collective
// assignment of roles and warehouse restrictions. Administrator only.
export const groupsRouter = Router();

groupsRouter.use(authenticate);

groupsRouter.get("/", requirePermission("admin.roles", "admin.users"), async (req, res, next) => {
  try {
    const groups = await Group.find({ companyId: req.auth!.companyId }).sort({ name: 1 });
    res.json({ groups });
  } catch (err) {
    next(err);
  }
});

const ids = z.array(z.string().regex(/^[a-f0-9]{24}$/i, "Identificador inválido.")).max(500).transform(list => [...new Set(list)]);

const fields = {
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(240),
  memberIds: ids,
  roleIds: ids,
  warehouseIds: ids,
  active: z.boolean(),
};

/** Every referenced user, role and warehouse must be the company's own. */
async function assertRefs(companyId: string, body: { memberIds?: string[]; roleIds?: string[]; warehouseIds?: string[] }) {
  if (body.memberIds?.length) {
    const users = await User.find({ _id: { $in: body.memberIds }, companyId }).select("role");
    if (users.length !== body.memberIds.length) throw new HttpError(422, "user_not_found", "Uno o más usuarios no existen en tu empresa.");
    if (users.some(u => u.role === "client")) throw new HttpError(422, "client_in_group", "Los usuarios de clientes 3PL no pueden pertenecer a grupos operativos.");
  }
  if (body.roleIds?.length) {
    const roles = await AccessRole.find({ _id: { $in: body.roleIds }, companyId });
    if (roles.length !== body.roleIds.length) throw new HttpError(422, "role_not_found", "Uno o más roles no existen en tu empresa.");
    if (roles.some(r => r.key === "admin")) throw new HttpError(422, "reserved_permission", "El rol Administrador no se puede asignar a un grupo.");
  }
  if (body.warehouseIds?.length) {
    const count = await Warehouse.countDocuments({ _id: { $in: body.warehouseIds }, companyId });
    if (count !== body.warehouseIds.length) throw new HttpError(404, "warehouse_not_found", "El almacén no existe en tu empresa.");
  }
}

groupsRouter.post("/", requirePermission("admin.roles"), async (req, res, next) => {
  try {
    const body = z.object({
      name: fields.name, description: fields.description.default(""),
      memberIds: fields.memberIds.default([]), roleIds: fields.roleIds.default([]), warehouseIds: fields.warehouseIds.default([]),
    }).parse(req.body);
    await assertRefs(req.auth!.companyId, body);
    const group = await Group.create({ ...body, companyId: req.auth!.companyId });
    await audit(req.auth!, { action: "create", entity: "group", entityId: group._id, label: group.name });
    res.status(201).json({ group });
  } catch (err) {
    next(err);
  }
});

groupsRouter.patch("/:id", requirePermission("admin.roles"), async (req, res, next) => {
  try {
    const body = z.object(fields).partial().parse(req.body);
    const group = await Group.findOne({ _id: req.params.id, companyId: req.auth!.companyId });
    if (!group) throw new HttpError(404, "not_found", "Grupo no encontrado.");
    await assertRefs(req.auth!.companyId, body);
    const changes = applyPatch(group, body, ["name", "description", "memberIds", "roleIds", "warehouseIds", "active"]);
    if (changes.length) {
      await group.save();
      await audit(req.auth!, { action: updateAction(changes), entity: "group", entityId: group._id, label: group.name, changes });
    }
    res.json({ group });
  } catch (err) {
    next(err);
  }
});
