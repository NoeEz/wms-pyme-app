import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { verifyJWT, adminOnly } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { ROLES, User } from "../models/User";
import { applyPatch, audit, updateAction } from "../services/audit";
import { assertCustomer } from "../services/scope";

// The company's users, managed by its admins.
export const usersRouter = Router();

usersRouter.use(verifyJWT, adminOnly);

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

const fields = {
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(ROLES),
  customerId: z.string().nullable(),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres.").max(128),
};

/** A "client" user must belong to a customer; staff never do. */
async function resolveCustomer(companyId: string, role: string, customerId: string | null | undefined) {
  if (role !== "client") return null;
  if (!customerId) throw new HttpError(422, "customer_required", "Un usuario cliente debe pertenecer a un cliente 3PL.");
  return (await assertCustomer(companyId, customerId))._id.toString();
}

usersRouter.post("/", async (req, res, next) => {
  try {
    const body = z.object({ ...fields, customerId: fields.customerId.optional() }).parse(req.body);
    const customerId = await resolveCustomer(req.auth!.companyId, body.role, body.customerId);
    const user = await User.create({
      companyId: req.auth!.companyId,
      name: body.name,
      email: body.email,
      role: body.role,
      customerId: customerId ?? undefined,
      passwordHash: await bcrypt.hash(body.password, 10),
    });
    await audit(req.auth!, { action: "create", entity: "user", entityId: user._id, label: user.email, changes: [{ field: "role", from: null, to: user.role }] });
    const { passwordHash: _, ...safe } = user.toObject();
    res.status(201).json({ user: safe });
  } catch (err) {
    next(err);
  }
});

usersRouter.patch("/:id", async (req, res, next) => {
  try {
    const body = z.object({ ...fields, active: z.boolean() }).partial().parse(req.body);
    const user = await User.findOne({ _id: req.params.id, companyId: req.auth!.companyId });
    if (!user) throw new HttpError(404, "not_found", "Usuario no encontrado.");

    const isSelf = user._id.toString() === req.auth!.sub;
    if (isSelf && ((body.role && body.role !== user.role) || body.active === false)) {
      throw new HttpError(422, "cannot_change_self", "No puedes cambiar tu propio rol ni desactivar tu cuenta.");
    }

    const role = body.role ?? user.role;
    const customerId = await resolveCustomer(
      req.auth!.companyId, role, body.customerId !== undefined ? body.customerId : user.customerId?.toString(),
    );
    const changes = applyPatch(user, { ...body, customerId }, ["name", "email", "role", "customerId", "active"]);
    if (body.password) {
      user.passwordHash = await bcrypt.hash(body.password, 10);
      changes.push({ field: "password", from: "•••", to: "•••" });
    }
    if (changes.length) {
      await user.save();
      await audit(req.auth!, { action: updateAction(changes), entity: "user", entityId: user._id, label: user.email, changes });
    }
    const { passwordHash: _, ...safe } = user.toObject();
    res.json({ user: safe });
  } catch (err) {
    next(err);
  }
});
