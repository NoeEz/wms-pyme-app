import { Request, Response, NextFunction } from "express";

export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.code, message: err.message });
  }
  console.error(err);
  return res.status(500).json({ error: "internal_error", message: "Error interno del servidor." });
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: "not_found", message: "Ruta no encontrada." });
}
