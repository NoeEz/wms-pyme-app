import { createApp } from "./app";
import { connectDB } from "./db/connect";
import { env } from "./config/env";
import { User } from "./models/User";
import { runSeed } from "./scripts/seed";

async function main() {
  await connectDB();

  // First boot against an empty database (fresh `docker compose up -d`, no
  // manual `npm run seed` required) — seed the same demo data every time the
  // collections are empty, so a wiped volume recovers on its own.
  if ((await User.countDocuments()) === 0) {
    console.log("[seed] no users found — seeding demo data automatically");
    await runSeed();
  }

  const app = createApp();
  app.listen(env.port, () => {
    console.log(`[http] listening on :${env.port}`);
  });
}

main().catch(err => {
  console.error("[fatal] failed to start server", err);
  process.exit(1);
});
