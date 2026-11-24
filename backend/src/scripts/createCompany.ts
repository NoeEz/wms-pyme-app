import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectDB } from "../db/connect";
import { Company } from "../models/Company";
import { User } from "../models/User";
import { ensureSystemRoles } from "../services/access";

// Onboarding of a real company and its first administrator (production has
// SEED_DEMO=false, so this is the only way in on an empty database):
//
//   docker compose -f docker-compose.prod.yml exec api \
//     node dist/scripts/createCompany.js <slug> "<empresa>" <correo> "<nombre admin>"
//
// Prints a random password once; the admin changes it from the portal.
async function main() {
  const [slug, name, email, adminName] = process.argv.slice(2);
  if (!slug || !name || !email || !adminName) {
    console.error('Uso: createCompany.js <slug> "<empresa>" <correo> "<nombre admin>"');
    process.exit(2);
  }

  await connectDB();
  if (await Company.findOne({ slug: slug.toLowerCase() })) throw new Error(`Ya existe una empresa con el código "${slug}"`);

  const password = randomBytes(9).toString("base64url");
  const company = await Company.create({ name, slug });
  await ensureSystemRoles(company._id);
  await User.create({
    companyId: company._id, name: adminName, email, role: "admin",
    passwordHash: await bcrypt.hash(password, 10),
  });

  console.log(`Empresa "${company.name}" creada. Login:`);
  console.log(`  Empresa:    ${company.slug}`);
  console.log(`  Correo:     ${email.toLowerCase()}`);
  console.log(`  Contraseña: ${password}   (cámbiala desde el portal)`);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error("[createCompany] failed:", err.message ?? err);
  process.exit(1);
});
