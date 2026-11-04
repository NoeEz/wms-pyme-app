import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import type { Role } from "../models/User";
import type { Permission } from "../config/permissions";
import { moduleDef, moduleSettings } from "../config/modules";
import { permissionDef } from "../config/permissions";
import { loadAccess, type Access } from "../services/access";
import { AuditLog } from "../models/AuditLog";
import { HttpError } from "./errorHandler";

export interface AuthPayload {
  sub: string;
  companyId: string;
  role: Role;
  name: string;
  customerId?: string; // set for role "client"
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthPayload;
      access?: Access;
    }
  }
}

export function verifyJWT(req: Request, res: Response, next: NextFunction) {
  const header = req.header("Authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  if (!token) {
    return res.status(401).json({ error: "missing_token", message: "Falta el token de autenticación." });
  }
  try {
    const payload = jwt.verify(token, env.jwtSecret) as AuthPayload;
    req.auth = payload;
    next();
  } catch {
    return res.status(401).json({ error: "invalid_token", message: "Sesión expirada o token inválido." });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({ error: "missing_token", message: "Falta el token de autenticación." });
    }
    if (!roles.includes(req.auth.role)) {
      return res.status(403).json({ error: "forbidden", message: "No tienes permisos para esta acción." });
    }
    next();
  };
}

/**
 * verifyJWT + access evaluation: re-reads the user on every request, so a
 * deactivated account or a changed role/permission takes effect at once
 * instead of when the token expires.
 */
export function authenticate(req: Request, res: Response, next: NextFunction) {
  verifyJWT(req, res, async () => {
    try {
      const access = await loadAccess(req.auth!.sub, req.auth!.companyId);
      req.auth!.role = access.role as Role;
      req.access = access;
      next();
    } catch (err) {
      next(err);
    }
  });
}

/** Records a refused operation in the audit log (§4.5.8 "eventos de autorización"). */
function logDenied(req: Request, permission: string) {
  if (!req.auth) return;
  if (req.access && moduleSettings(req.access.company as any, "history").logDenied === false) return;
  AuditLog.create({
    companyId: req.auth.companyId, userId: req.auth.sub, userName: req.auth.name,
    action: "denied", entity: "access", label: permission,
    changes: [{ field: "ruta", from: null, to: `${req.method} ${req.baseUrl}${req.path}` }],
  }).catch(() => {});
}

/**
 * Allows the request if the user holds ANY of the given permissions (after
 * module availability). Use after `authenticate`. A permission that exists
 * but whose module is off answers 403 module_disabled, so the apps can say
 * "pide a un administrador que lo active" instead of a generic refusal.
 */
export function requirePermission(...anyOf: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      assertPermission(req, ...anyOf);
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Same check as requirePermission, for use inside a handler (e.g. depends on the body). */
export function assertPermission(req: Request, ...anyOf: Permission[]): void {
  const access = req.access;
  if (!access) throw new HttpError(401, "missing_token", "Falta el token de autenticación.");
  if (anyOf.some(p => access.permissions.has(p))) return;
  const blocked = anyOf.find(p => access.blockedByModule.has(p));
  if (blocked) {
    const mod = moduleDef(permissionDef(blocked)!.module ?? "");
    throw new HttpError(403, "module_disabled", `El módulo «${mod?.label ?? blocked}» no está habilitado para tu empresa. Pide a un administrador que lo active.`);
  }
  logDenied(req, anyOf.join(" | "));
  throw new HttpError(403, "forbidden", "No tienes permisos para esta acción.");
}

export function hasPermission(req: Request, permission: Permission): boolean {
  return !!req.access?.permissions.has(permission);
}

/** Warehouse staff — everyone but external 3PL "client" users. */
export const staffOnly = requireRole("operator", "supervisor", "admin");
/** Catalog management (products, locations) and physical counts. */
export const managersOnly = requireRole("supervisor", "admin");
export const adminOnly = requireRole("admin");
