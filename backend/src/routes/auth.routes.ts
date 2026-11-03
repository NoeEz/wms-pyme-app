import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../config/env";
import { Company } from "../models/Company";
import { Customer } from "../models/Customer";
import { User } from "../models/User";
import { verifyJWT, type AuthPayload } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";

export const authRouter = Router();

const loginSchema = z.object({
  company: z.string().trim().min(1),
  email: z.string().email(),
  password: z.string().min(1),
});

function invalidCredentials(): never {
  // Same message whether the company, the email or the password is wrong, so
  // the endpoint doesn't reveal which companies or accounts exist.
  throw new HttpError(401, "invalid_credentials", "Empresa, correo o contraseña incorrectos.");
}

async function sessionInfo(user: { companyId: unknown; customerId?: unknown }) {
  const [company, customer] = await Promise.all([
    Company.findById(user.companyId).select("name slug"),
    user.customerId ? Customer.findById(user.customerId).select("code name") : null,
  ]);
  return {
    company: company && { id: company._id, name: company.name, slug: company.slug },
    customer: customer && { id: customer._id, code: customer.code, name: customer.name },
  };
}

authRouter.post("/login", async (req, res, next) => {
  try {
    const { company: slug, email, password } = loginSchema.parse(req.body);
    const company = await Company.findOne({ slug: slug.toLowerCase() });
    if (!company) invalidCredentials();

    const user = await User.findOne({ companyId: company._id, email: email.toLowerCase() });
    if (!user || user.active === false) invalidCredentials();

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) invalidCredentials();
    if (user.role === "client" && !(await Customer.exists({ _id: user.customerId, active: { $ne: false } }))) {
      throw new HttpError(403, "customer_inactive", "El acceso de tu empresa cliente está suspendido. Contacta al almacén.");
    }

    const payload: AuthPayload = {
      sub: user._id.toString(),
      companyId: user.companyId.toString(),
      role: user.role,
      name: user.name,
      ...(user.customerId ? { customerId: user.customerId.toString() } : {}),
    };
    const token = jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn as any });

    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
      ...(await sessionInfo(user)),
    });
  } catch (err) {
    next(err);
  }
});

authRouter.get("/me", verifyJWT, async (req, res, next) => {
  try {
    const user = await User.findOne({ _id: req.auth!.sub, companyId: req.auth!.companyId }).select("-passwordHash");
    if (!user || user.active === false) throw new HttpError(401, "invalid_token", "Sesión expirada o token inválido.");
    res.json({ user, ...(await sessionInfo(user)) });
  } catch (err) {
    next(err);
  }
});
