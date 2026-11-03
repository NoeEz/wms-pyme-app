import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import mongoose from "mongoose";

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
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "validation_error", message: "Datos inválidos en la solicitud.", issues: err.issues });
  }
  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({ error: "invalid_id", message: "Identificador inválido en la solicitud." });
  }
  console.error(err);
  return res.status(500).json({ error: "internal_error", message: "Error interno del servidor." });
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: "not_found", message: "Ruta no encontrada." });
}
