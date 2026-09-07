import bcrypt from "bcryptjs";
import { Company } from "../models/Company";
import { Warehouse } from "../models/Warehouse";
import { Location } from "../models/Location";
import { Product } from "../models/Product";
import { StockBalance } from "../models/StockBalance";
import { User } from "../models/User";
import { Movement } from "../models/Movement";

const DEMO_PASSWORD = "demo1234";

export async function runSeed(): Promise<void> {
  console.log("[seed] wiping demo collections...");
  await Promise.all([
    Movement.deleteMany({}),
    StockBalance.deleteMany({}),
    Location.deleteMany({}),
    Product.deleteMany({}),
    User.deleteMany({}),
    Warehouse.deleteMany({}),
    Company.deleteMany({}),
  ]);

  const company = await Company.create({ name: "Industrias Nova PyME" });

  const [plantaNorte, centroDistribucion] = await Warehouse.insertMany([
    { companyId: company._id, name: "Planta Norte", city: "Monterrey, NL", state: "active" },
    { companyId: company._id, name: "Centro de distribución", city: "CDMX", state: "active" },
  ]);

  const locations = await Location.insertMany([
    { warehouseId: plantaNorte._id, zone: "Zona A", aisle: "Pasillo 03", rack: "Rack 02", position: "Posición 04", code: "A-03-R02-P04" },
    { warehouseId: plantaNorte._id, zone: "Zona B", aisle: "Pasillo 01", rack: "Rack 01", position: "Posición 02", code: "B-01-R01-P02" },
    { warehouseId: centroDistribucion._id, zone: "Zona A", aisle: "Pasillo 01", rack: "Rack 01", position: "Posición 01", code: "A-01-R01-P01" },
    { warehouseId: centroDistribucion._id, zone: "Zona A", aisle: "Pasillo 02", rack: "Rack 01", position: "Posición 03", code: "A-02-R01-P03" },
  ]);
  const [locA, locB, locC] = locations;

  const [balero, banda] = await Product.insertMany([
    {
      companyId: company._id, sku: "BAL-6204", name: "Balero industrial 6204",
      barcodeValues: ["BAL-6204"], unit: "pza", tracking: "serial", lowStockThreshold: 10,
    },
    {
      companyId: company._id, sku: "BAN-2M", name: "Banda transportadora 2 m",
      barcodeValues: ["BAN-2M"], unit: "pza", tracking: "lot", lowStockThreshold: 10,
    },
  ]);

  await StockBalance.insertMany([
    { productId: balero._id, locationId: locA._id, available: 128, reserved: 0 },
    { productId: banda._id, locationId: locB._id, available: 7, reserved: 0 },
    { productId: balero._id, locationId: locC._id, available: 16, reserved: 0 },
  ]);

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  await User.insertMany([
    { companyId: company._id, name: "María López", email: "maria.lopez@nova.mx", passwordHash, role: "operator" },
    { companyId: company._id, name: "Carlos Ruiz", email: "carlos.ruiz@nova.mx", passwordHash, role: "supervisor" },
    { companyId: company._id, name: "Admin Nova", email: "admin@nova.mx", passwordHash, role: "admin" },
  ]);

  console.log("[seed] done. Demo login password for all users:", DEMO_PASSWORD);
  console.log("[seed] warehouses:", plantaNorte.name, "/", centroDistribucion.name);
}

// Only run standalone (`npm run seed`) when this file is executed directly —
// index.ts imports runSeed() without triggering this block.
if (require.main === module) {
  import("../db/connect").then(async ({ connectDB }) => {
    const mongoose = (await import("mongoose")).default;
    await connectDB();
    await runSeed();
    await mongoose.disconnect();
  }).catch(err => {
    console.error("[seed] failed", err);
    process.exit(1);
  });
}
