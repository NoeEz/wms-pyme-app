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

export async function connectDB(): Promise<void> {
  mongoose.set("strictQuery", true);
  await mongoose.connect(env.mongodbUri);
  await ensureReplicaSetInitiated();
  console.log(`[db] connected to ${env.mongodbUri}`);
}
