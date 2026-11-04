import { Types } from "mongoose";
import { HttpError } from "../middleware/errorHandler";
import { AccessRole } from "../models/AccessRole";
import { Company } from "../models/Company";
import { Group } from "../models/Group";
import { User } from "../models/User";
import { enabledModuleSet, type ModuleKey } from "../config/modules";
import {
  ALL_PERMISSIONS, CLIENT_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, RESERVED_PERMISSIONS, SYSTEM_ROLES,
  isPermission, permissionDef, type Permission,
} from "../config/permissions";

// Access evaluation (Tesina §4.5.10 "Evaluación del acceso"). Before an
// operation the API checks, in order: authentication (JWT), the user's state
// (active, same company), the company, the module's availability, the
// effective permissions and the scope over the resource (warehouses).
// Least privilege and deny by default: a permission is effective only if
// some role/group grants it, no individual "deny" removes it and its module
// is enabled.

export interface PermissionSource { kind: "role" | "custom_role" | "group" | "allow" | "deny" | "admin" | "client"; name: string }

export interface Access {
  userId: string;
  companyId: string;
  role: string;
  permissions: Set<Permission>;
  /** Warehouses the user may operate/see; null = every warehouse of the company. */
  warehouseIds: string[] | null;
  modules: Set<ModuleKey>;
  /** Why each permission is (or would be) granted — for the admin's user screen. */
  sources: Map<Permission, PermissionSource[]>;
  /** Permissions granted but switched off because their module is disabled. */
  blockedByModule: Set<Permission>;
  /** The company (lean), for module settings. */
  company: Record<string, unknown>;
}

/** Creates the predefined roles of a company the first time they're needed. */
export async function ensureSystemRoles(companyId: string | Types.ObjectId) {
  const existing = await AccessRole.find({ companyId, system: true });
  const missing = SYSTEM_ROLES.filter(r => !existing.some(e => e.key === r.key));
  if (missing.length) {
    try {
      await AccessRole.insertMany(missing.map(r => ({
        companyId, key: r.key, name: r.name, description: r.description, system: true,
        permissions: r.key === "admin" ? ALL_PERMISSIONS : DEFAULT_ROLE_PERMISSIONS[r.key],
      })), { ordered: false });
    } catch (err) {
      // Two first requests racing: the unique index keeps one copy.
      if ((err as { code?: number }).code !== 11000) throw err;
    }
    return AccessRole.find({ companyId, system: true });
  }
  return existing;
}

type UserLike = {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  role: string;
  active?: boolean | null;
  roleIds?: Types.ObjectId[] | null;
  warehouseIds?: Types.ObjectId[] | null;
  permissionOverrides?: { permission: string; effect: string }[] | null;
};

export async function computeAccess(user: UserLike): Promise<Access> {
  const companyId = String(user.companyId);
  const company = await Company.findById(companyId).lean();
  if (!company) throw new HttpError(401, "invalid_token", "Sesión expirada o token inválido.");
  const modules = enabledModuleSet(company as any);

  const granted = new Map<Permission, PermissionSource[]>();
  const grant = (p: string, source: PermissionSource) => {
    if (!isPermission(p)) return;
    granted.set(p, [...(granted.get(p) ?? []), source]);
  };

  let warehouseIds: string[] | null = null;

  if (user.role === "admin") {
    for (const p of ALL_PERMISSIONS) grant(p, { kind: "admin", name: "Administrador" });
  } else if (user.role === "client") {
    for (const p of CLIENT_PERMISSIONS) grant(p, { kind: "client", name: "Cliente 3PL" });
  } else {
    const systemRoles = await ensureSystemRoles(companyId);
    const base = systemRoles.find(r => r.key === user.role);
    for (const p of base?.permissions ?? []) grant(p, { kind: "role", name: base!.name });

    const groups = await Group.find({ companyId, memberIds: user._id, active: { $ne: false } }).lean();
    const roleIds = [...(user.roleIds ?? []), ...groups.flatMap(g => g.roleIds)];
    const roles = roleIds.length
      ? await AccessRole.find({ _id: { $in: roleIds }, companyId, active: { $ne: false }, key: { $ne: "admin" } }).lean()
      : [];
    const byId = new Map(roles.map(r => [String(r._id), r]));
    for (const id of user.roleIds ?? []) {
      const r = byId.get(String(id));
      if (r) for (const p of r.permissions) grant(p, { kind: "custom_role", name: r.name });
    }
    for (const g of groups) {
      for (const id of g.roleIds) {
        const r = byId.get(String(id));
        if (r) for (const p of r.permissions) grant(p, { kind: "group", name: `${g.name} · ${r.name}` });
      }
    }

    for (const o of user.permissionOverrides ?? []) {
      if (o.effect === "allow") grant(o.permission, { kind: "allow", name: "Excepción individual" });
    }
    // Reserved powers belong to the admin role only, whatever was stored.
    for (const p of RESERVED_PERMISSIONS) granted.delete(p);
    for (const o of user.permissionOverrides ?? []) {
      if (o.effect === "deny" && isPermission(o.permission)) {
        granted.set(o.permission, [...(granted.get(o.permission) ?? []), { kind: "deny", name: "Excepción individual (denegado)" }]);
      }
    }

    // Warehouse scope: the user's own list plus every restricting group's.
    const scoped = [
      ...(user.warehouseIds ?? []).map(String),
      ...groups.flatMap(g => g.warehouseIds.map(String)),
    ];
    if (scoped.length) warehouseIds = [...new Set(scoped)];
  }

  const permissions = new Set<Permission>();
  const blockedByModule = new Set<Permission>();
  for (const [p, sources] of granted) {
    if (sources.some(s => s.kind === "deny")) continue;
    const mod = permissionDef(p)!.module;
    if (mod && !modules.has(mod)) blockedByModule.add(p);
    else permissions.add(p);
  }

  return { userId: String(user._id), companyId, role: user.role, permissions, warehouseIds, modules, sources: granted, blockedByModule, company: company as Record<string, unknown> };
}

/** Loads the user behind a token and evaluates its access; 401 if the account is gone or deactivated. */
export async function loadAccess(userId: string, companyId: string): Promise<Access> {
  const user = await User.findOne({ _id: userId, companyId }).lean();
  if (!user || user.active === false) {
    throw new HttpError(401, "invalid_token", "Tu cuenta fue desactivada o ya no existe. Inicia sesión de nuevo.");
  }
  return computeAccess(user as unknown as UserLike);
}

/** What the apps receive at login and in /auth/me. */
export function accessSummary(access: Access) {
  return {
    permissions: [...access.permissions].sort(),
    warehouseIds: access.warehouseIds,
    modules: [...access.modules],
  };
}

export function canAccessWarehouse(access: Access, warehouseId: string | Types.ObjectId): boolean {
  return access.warehouseIds === null || access.warehouseIds.includes(String(warehouseId));
}

export function assertWarehouseAccess(access: Access, warehouseId: string | Types.ObjectId) {
  if (!canAccessWarehouse(access, warehouseId)) {
    throw new HttpError(403, "warehouse_forbidden", "No tienes acceso a este almacén. Pide a un administrador que te lo asigne.");
  }
}

/** Mongo filter value for warehouse fields, or undefined when unrestricted. */
export function warehouseFilter(access: Access): { $in: Types.ObjectId[] } | undefined {
  return access.warehouseIds === null ? undefined : { $in: access.warehouseIds.map(id => new Types.ObjectId(id)) };
}
