import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import type { Role } from "../models/User";

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
