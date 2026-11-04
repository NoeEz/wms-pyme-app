import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { authenticate, requirePermission } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { AccessRole } from "../models/AccessRole";
import { Group } from "../models/Group";
import { User } from "../models/User";
import { MODULE_CATALOG } from "../config/modules";
import { PERMISSIONS, RESERVED_PERMISSIONS, isPermission } from "../config/permissions";
import { applyPatch, audit, updateAction } from "../services/audit";
import { ensureSystemRoles } from "../services/access";

// Roles (Tesina §4.5.10 "Administración de roles"). Only the administrator
// creates roles and decides which permissions each one carries; the
// administrator's own powers (reserved permissions) can't be delegated.
export const rolesRouter = Router();

rolesRouter.use(authenticate);

/** Modules with their permissions, for the portal's permission matrix. */
rolesRouter.get("/catalog", requirePermission("admin.roles", "admin.users"), (_req, res) => {
  res.json({
    modules: MODULE_CATALOG.map(m => ({ key: m.key, label: m.label, section: m.section, core: m.core })),
    permissions: PERMISSIONS,
  });
});

rolesRouter.get("/", requirePermission("admin.roles", "admin.users"), async (req, res, next) => {
  try {
    const companyId = req.auth!.companyId;
    await ensureSystemRoles(companyId);
    const [roles, users, groups] = await Promise.all([
      AccessRole.find({ companyId }).sort({ system: -1, name: 1 }).lean(),
      User.find({ companyId }).select("role roleIds").lean(),
      Group.find({ companyId }).select("roleIds").lean(),
    ]);
    res.json({
      roles: roles.map(r => ({
        ...r,
        // admin always holds everything, whatever is stored.
        permissions: r.key === "admin" ? PERMISSIONS.map(p => p.key) : r.permissions,
        users: users.filter(u => (r.system ? u.role === r.key : (u.roleIds ?? []).some(id => String(id) === String(r._id)))).length,
        groups: groups.filter(g => g.roleIds.some(id => String(id) === String(r._id))).length,
      })),
    });
  } catch (err) {
    next(err);
  }
});

const permissionsSchema = z.array(z.string()).max(200).superRefine((list, ctx) => {
  for (const p of list) {
    if (!isPermission(p)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `El permiso «${p}» no existe.` });
  }
}).transform(list => [...new Set(list)]);

function assertGrantable(permissions: string[]) {
  const reserved = permissions.filter(p => (RESERVED_PERMISSIONS as string[]).includes(p));
  if (reserved.length) {
    throw new HttpError(422, "reserved_permission", "Las facultades de administración (módulos, roles, usuarios, clientes y empresa) son exclusivas del administrador y no se pueden asignar a otros roles.");
  }
}

const fields = {
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(240),
  permissions: permissionsSchema,
  active: z.boolean(),
};

rolesRouter.post("/", requirePermission("admin.roles"), async (req, res, next) => {
  try {
    const body = z.object({ name: fields.name, description: fields.description.default(""), permissions: fields.permissions.default([]) }).parse(req.body);
    assertGrantable(body.permissions);
    const role = await AccessRole.create({
      companyId: req.auth!.companyId, key: `custom-${randomUUID().slice(0, 8)}`, system: false, ...body,
    });
    await audit(req.auth!, { action: "create", entity: "role", entityId: role._id, label: role.name, changes: [{ field: "permissions", from: null, to: role.permissions }] });
    res.status(201).json({ role });
  } catch (err) {
    next(err);
  }
});

rolesRouter.patch("/:id", requirePermission("admin.roles"), async (req, res, next) => {
  try {
    const body = z.object(fields).partial().parse(req.body);
    const role = await AccessRole.findOne({ _id: req.params.id, companyId: req.auth!.companyId });
    if (!role) throw new HttpError(404, "not_found", "Rol no encontrado.");
    if (role.key === "admin") {
      throw new HttpError(422, "role_locked", "El rol Administrador siempre tiene todos los permisos y no se puede modificar.");
    }
    if (role.system && ((body.name !== undefined && body.name !== role.name) || body.active === false)) {
      throw new HttpError(422, "role_locked", "Los roles predeterminados no se pueden renombrar ni desactivar; sí puedes ajustar sus permisos.");
    }
    if (body.permissions) assertGrantable(body.permissions);

    const changes = applyPatch(role, body, ["name", "description", "permissions", "active"]);
    if (changes.length) {
      await role.save();
      await audit(req.auth!, { action: updateAction(changes), entity: "role", entityId: role._id, label: role.name, changes });
    }
    res.json({ role });
  } catch (err) {
    next(err);
  }
});
