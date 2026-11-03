import mongoose from "mongoose";
import { env } from "../config/env";

// mongo:7 in docker-compose runs with --replSet rs0 so we get multi-document
// transactions (used by movementService for atomic stock updates). A brand
// new container hasn't run `rs.initiate()` yet, so we do it here — safe to
// call every startup, it's a no-op once the replica set already exists.
async function ensureReplicaSetInitiated(): Promise<void> {
  const admin = mongoose.connection.db!.admin();
  try {
    await admin.command({ replSetGetStatus: 1 });
  } catch (err: any) {
    if (err?.codeName === "NotYetInitialized") {
      await admin.command({ replSetInitiate: {} });
      console.log("[db] replica set rs0 initiated");
      await new Promise(resolve => setTimeout(resolve, 1000)); // let it elect a primary
    } else {
      throw err;
    }
  }
}

// Databases created before login-by-company have companies without a slug.
// Derive one from the name ("Industrias Nova PyME" → "industrias-nova-pyme");
// an admin can change it later.
async function backfillCompanySlugs(): Promise<void> {
  const companies = mongoose.connection.db!.collection("companies");
  for (const c of await companies.find({ slug: { $exists: false } }).toArray()) {
    const base = String(c.name).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "empresa";
    let slug = base;
    for (let n = 2; await companies.findOne({ slug }); n++) slug = `${base}-${n}`;
    await companies.updateOne({ _id: c._id }, { $set: { slug } });
    console.log(`[db] company "${c.name}" got login slug "${slug}"`);
  }
}

export async function connectDB(): Promise<void> {
  mongoose.set("strictQuery", true);
  await mongoose.connect(env.mongodbUri);
  await ensureReplicaSetInitiated();
  await backfillCompanySlugs();
  // Mongoose's background autoIndex fires on connect — before a fresh replica
  // set has elected a primary — and fails silently. Sync indexes explicitly
  // now: the unique (companyId, clientId) one is what makes movement sync
  // idempotent under concurrent retries. syncIndexes (not createIndexes) also
  // drops indexes removed from a schema, e.g. the old global unique email.
  await Promise.all(Object.values(mongoose.models).map(m => m.syncIndexes()));
  console.log(`[db] connected to ${env.mongodbUri}`);
}
