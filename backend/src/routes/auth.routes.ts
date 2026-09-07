import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../config/env";
import { User } from "../models/User";
import { verifyJWT } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) throw new HttpError(401, "invalid_credentials", "Correo o contraseña incorrectos.");

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new HttpError(401, "invalid_credentials", "Correo o contraseña incorrectos.");

    const payload = {
      sub: user._id.toString(),
      companyId: user.companyId.toString(),
      role: user.role,
      name: user.name,
    };
    const token = jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn as any });

    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    next(err);
  }
});

authRouter.get("/me", verifyJWT, async (req, res, next) => {
  try {
    const user = await User.findById(req.auth!.sub).select("-passwordHash");
    if (!user) throw new HttpError(404, "not_found", "Usuario no encontrado.");
    res.json({ user });
  } catch (err) {
    next(err);
  }
});
