import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authenticate, requirePermission } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { AccessRole } from "../models/AccessRole";
import { Group } from "../models/Group";
import { ROLES, User } from "../models/User";
import { Warehouse } from "../models/Warehouse";
import { RESERVED_PERMISSIONS, isPermission, permissionDef } from "../config/permissions";
import { moduleSettings } from "../config/modules";
import { applyPatch, audit, updateAction } from "../services/audit";
import { computeAccess } from "../services/access";
import { assertCustomer } from "../services/scope";

// The company's users (Tesina §4.5.10 "Administración de usuarios"),
// managed by its administrator only: accounts, base role, extra roles,
// warehouses they may operate and individual permission exceptions.
export const usersRouter = Router();

usersRouter.use(authenticate, requirePermission("admin.users"));

usersRouter.get("/", async (req, res, next) => {
  try {
    const users = await User.find({ companyId: req.auth!.companyId })
      .select("-passwordHash")
      .populate("customerId", "code name")
      .sort({ name: 1 });
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

const objectIds = z.array(z.string().regex(/^[a-f0-9]{24}$/i, "Identificador inválido.")).max(200).transform(l => [...new Set(l)]);

const fields = {
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(ROLES),
  customerId: z.string().nullable(),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres.").max(128),
  roleIds: objectIds,
  warehouseIds: objectIds,
};

/** A "client" user must belong to a customer; staff never do. */
async function resolveCustomer(companyId: string, role: string, customerId: string | null | undefined) {
  if (role !== "client") return null;
  if (!customerId) throw new HttpError(422, "customer_required", "Un usuario cliente debe pertenecer a un cliente 3PL.");
  return (await assertCustomer(companyId, customerId))._id.toString();
}

/** Extra roles must be the company's active custom roles; warehouses its own. */
async function assertAssignments(companyId: string, role: string, roleIds?: string[], warehouseIds?: string[]) {
  if (roleIds?.length) {
    if (role === "client" || role === "admin") {
      throw new HttpError(422, "roles_not_applicable", "Los roles adicionales solo aplican a operadores y supervisores.");
    }
    const count = await AccessRole.countDocuments({ _id: { $in: roleIds }, companyId, system: false });
    if (count !== roleIds.length) throw new HttpError(422, "role_not_found", "Uno o más roles no existen o son roles predeterminados.");
  }
  if (warehouseIds?.length) {
    const count = await Warehouse.countDocuments({ _id: { $in: warehouseIds }, companyId });
    if (count !== warehouseIds.length) throw new HttpError(404, "warehouse_not_found", "El almacén no existe en tu empresa.");
  }
}

/** Administration module setting "minPasswordLength" (never below 8). */
function assertPasswordPolicy(req: { access?: { company: unknown } }, password?: string) {
  if (!password) return;
  const min = Math.max(8, Number(moduleSettings(req.access?.company as any, "admin").minPasswordLength) || 8);
  if (password.length < min) {
    throw new HttpError(422, "password_too_short", `La contraseña debe tener al menos ${min} caracteres.`);
  }
}

function safe(user: any) {
  const { passwordHash: _, ...rest } = user.toObject();
  return rest;
}

usersRouter.post("/", async (req, res, next) => {
  try {
    const body = z.object({
      ...fields, customerId: fields.customerId.optional(), roleIds: fields.roleIds.default([]), warehouseIds: fields.warehouseIds.default([]),
    }).parse(req.body);
    assertPasswordPolicy(req, body.password);
    const customerId = await resolveCustomer(req.auth!.companyId, body.role, body.customerId);
    await assertAssignments(req.auth!.companyId, body.role, body.roleIds, body.warehouseIds);
    const user = await User.create({
      companyId: req.auth!.companyId,
      name: body.name,
      email: body.email,
      role: body.role,
      customerId: customerId ?? undefined,
      roleIds: body.role === "admin" || body.role === "client" ? [] : body.roleIds,
      warehouseIds: body.role === "admin" ? [] : body.warehouseIds,
      passwordHash: await bcrypt.hash(body.password, 10),
    });
    await audit(req.auth!, { action: "create", entity: "user", entityId: user._id, label: user.email, changes: [{ field: "role", from: null, to: user.role }] });
    res.status(201).json({ user: safe(user) });
  } catch (err) {
    next(err);
  }
});

usersRouter.patch("/:id", async (req, res, next) => {
  try {
    const body = z.object({ ...fields, active: z.boolean() }).partial().parse(req.body);
    const user = await User.findOne({ _id: req.params.id, companyId: req.auth!.companyId });
    if (!user) throw new HttpError(404, "not_found", "Usuario no encontrado.");

    assertPasswordPolicy(req, body.password);
    const isSelf = user._id.toString() === req.auth!.sub;
    if (isSelf && ((body.role && body.role !== user.role) || body.active === false)) {
      throw new HttpError(422, "cannot_change_self", "No puedes cambiar tu propio rol ni desactivar tu cuenta.");
    }

    const role = body.role ?? user.role;
    const customerId = await resolveCustomer(
      req.auth!.companyId, role, body.customerId !== undefined ? body.customerId : user.customerId?.toString(),
    );
    await assertAssignments(req.auth!.companyId, role, body.roleIds, body.warehouseIds);
    const patch: Record<string, unknown> = { ...body, customerId };
    // Admins hold everything everywhere; clients have a fixed profile.
    if (role === "admin" || role === "client") patch.roleIds = [];
    if (role === "admin") patch.warehouseIds = [];
    const changes = applyPatch(user, patch, ["name", "email", "role", "customerId", "active", "roleIds", "warehouseIds"]);
    if ((role === "admin" || role === "client") && user.permissionOverrides?.length) {
      changes.push({ field: "permissionOverrides", from: user.permissionOverrides.map(o => `${o.effect}:${o.permission}`), to: [] });
      user.set("permissionOverrides", []);
    }
    if (body.password) {
      user.passwordHash = await bcrypt.hash(body.password, 10);
      changes.push({ field: "password", from: "•••", to: "•••" });
    }
    if (changes.length) {
      await user.save();
      await audit(req.auth!, { action: updateAction(changes), entity: "user", entityId: user._id, label: user.email, changes });
    }
    res.json({ user: safe(user) });
  } catch (err) {
    next(err);
  }
});

/** Effective permissions of a user, with where each one comes from. */
usersRouter.get("/:id/access", async (req, res, next) => {
  try {
    const user = await User.findOne({ _id: req.params.id, companyId: req.auth!.companyId }).lean();
    if (!user) throw new HttpError(404, "not_found", "Usuario no encontrado.");
    const access = await computeAccess(user as any);
    const groups = await Group.find({ companyId: req.auth!.companyId, memberIds: user._id }).select("name active").lean();
    res.json({
      permissions: [...access.permissions].sort(),
      blockedByModule: [...access.blockedByModule].sort(),
      sources: Object.fromEntries(access.sources),
      warehouseIds: access.warehouseIds,
      groups,
    });
  } catch (err) {
    next(err);
  }
});

// Individual exceptions (§4.5.10 "Permisos individuales"): allow or deny one
// permission for one user without touching their roles or groups. Each one
// needs a justification and is recorded in the audit log.
const overrideSchema = z.object({
  permission: z.string().refine(isPermission, "El permiso no existe."),
  effect: z.enum(["allow", "deny"]),
  reason: z.string().trim().min(5, "Escribe una justificación (mínimo 5 caracteres).").max(300),
});

usersRouter.post("/:id/overrides", async (req, res, next) => {
  try {
    const body = overrideSchema.parse(req.body);
    const user = await User.findOne({ _id: req.params.id, companyId: req.auth!.companyId });
    if (!user) throw new HttpError(404, "not_found", "Usuario no encontrado.");
    if (user.role === "admin" || user.role === "client") {
      throw new HttpError(422, "overrides_not_applicable", "Las excepciones individuales solo aplican a operadores y supervisores.");
    }
    if ((RESERVED_PERMISSIONS as string[]).includes(body.permission)) {
      throw new HttpError(422, "reserved_permission", "Esta facultad es exclusiva del administrador y no se puede conceder como excepción.");
    }
    const previous = user.permissionOverrides.find(o => o.permission === body.permission);
    const others = user.permissionOverrides.filter(o => o.permission !== body.permission);
    user.set("permissionOverrides", [...others.map(o => (o as any).toObject?.() ?? o), {
      permission: body.permission, effect: body.effect, reason: body.reason,
      grantedBy: req.auth!.sub, grantedByName: req.auth!.name, grantedAt: new Date(),
    }]);
    await user.save();
    await audit(req.auth!, {
      action: body.effect === "allow" ? "grant" : "revoke", entity: "permission", entityId: user._id,
      label: `${user.email} · ${permissionDef(body.permission)!.label}`, reason: body.reason,
      changes: [{ field: body.permission, from: previous ? previous.effect : null, to: body.effect }],
    });
    res.status(201).json({ user: safe(user) });
  } catch (err) {
    next(err);
  }
});

usersRouter.post("/:id/overrides/remove", async (req, res, next) => {
  try {
    const body = z.object({
      permission: z.string(),
      reason: z.string().trim().min(5, "Escribe una justificación (mínimo 5 caracteres).").max(300),
    }).parse(req.body);
    const user = await User.findOne({ _id: req.params.id, companyId: req.auth!.companyId });
    if (!user) throw new HttpError(404, "not_found", "Usuario no encontrado.");
    const previous = user.permissionOverrides.find(o => o.permission === body.permission);
    if (!previous) throw new HttpError(404, "not_found", "Ese usuario no tiene una excepción para ese permiso.");
    user.set("permissionOverrides", user.permissionOverrides.filter(o => o.permission !== body.permission).map(o => (o as any).toObject?.() ?? o));
    await user.save();
    await audit(req.auth!, {
      action: "update", entity: "permission", entityId: user._id,
      label: `${user.email} · ${permissionDef(body.permission)?.label ?? body.permission}`, reason: body.reason,
      changes: [{ field: body.permission, from: previous.effect, to: "sin excepción" }],
    });
    res.json({ user: safe(user) });
  } catch (err) {
    next(err);
  }
});
