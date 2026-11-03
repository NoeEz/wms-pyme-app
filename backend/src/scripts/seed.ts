import bcrypt from "bcryptjs";
import { Company } from "../models/Company";
import { Customer } from "../models/Customer";
import { Warehouse } from "../models/Warehouse";
import { Location } from "../models/Location";
import { Product } from "../models/Product";
import { StockBalance } from "../models/StockBalance";
import { User } from "../models/User";
import { Movement } from "../models/Movement";
import { AuditLog } from "../models/AuditLog";
import { InventoryCount } from "../models/InventoryCount";
import { seedHistory } from "./seedHistory";

const DEMO_PASSWORD = "demo1234";

export async function runSeed(): Promise<void> {
  console.log("[seed] wiping demo collections...");
  await Promise.all([
    Movement.deleteMany({}),
    InventoryCount.deleteMany({}),
    AuditLog.deleteMany({}),
    StockBalance.deleteMany({}),
    Location.deleteMany({}),
    Product.deleteMany({}),
    User.deleteMany({}),
    Warehouse.deleteMany({}),
    Customer.deleteMany({}),
    Company.deleteMany({}),
  ]);

  const company = await Company.create({ name: "Industrias Nova PyME", slug: "nova" });

  // 3PL customer whose merchandise Nova stores (portal role "client").
  const refValle = await Customer.create({
    companyId: company._id, code: "RDV", name: "Refaccionaria del Valle", contactEmail: "compras@refvalle.mx",
  });

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
  const [locA, locB, locC, locD] = locations;

  // The rest of Planta Norte, so the warehouse map looks like a warehouse:
  // zone A with 3 aisles, B with 2, C with 1; 2 racks of 4 positions each.
  const plan: [string, number][] = [["A", 3], ["B", 2], ["C", 1]];
  const pad = (n: number) => String(n).padStart(2, "0");
  const existing = new Set(locations.filter(l => l.warehouseId.equals(plantaNorte._id)).map(l => l.code));
  const extraLocations = plan.flatMap(([zone, aisles]) =>
    Array.from({ length: aisles }, (_, a) => Array.from({ length: 2 }, (_, r) => Array.from({ length: 4 }, (_, p) => ({
      warehouseId: plantaNorte._id,
      zone: `Zona ${zone}`, aisle: `Pasillo ${pad(a + 1)}`, rack: `Rack ${pad(r + 1)}`, position: `Posición ${pad(p + 1)}`,
      code: `${zone}-${pad(a + 1)}-R${pad(r + 1)}-P${pad(p + 1)}`,
    })))).flat(2),
  ).filter(l => !existing.has(l.code));
  const extra = await Location.insertMany(extraLocations);
  const extraByCode = new Map(extra.map(l => [l.code, l._id]));

  const [balero, banda, filtro] = await Product.insertMany([
    {
      companyId: company._id, sku: "BAL-6204", name: "Balero industrial 6204",
      barcodeValues: ["BAL-6204"], unit: "pza", tracking: "serial", lowStockThreshold: 10, cost: 85,
    },
    {
      companyId: company._id, sku: "BAN-2M", name: "Banda transportadora 2 m",
      barcodeValues: ["BAN-2M"], unit: "pza", tracking: "lot", lowStockThreshold: 25, cost: 1450,
    },
    {
      companyId: company._id, customerId: refValle._id, sku: "FIL-AC-90", name: "Filtro de aceite 90 mm",
      barcodeValues: ["FIL-AC-90"], unit: "pza", tracking: "none", lowStockThreshold: 20, cost: 62,
    },
  ]);

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const [maria, carlos] = await User.insertMany([
    { companyId: company._id, name: "María López", email: "maria.lopez@nova.mx", passwordHash, role: "operator" },
    { companyId: company._id, name: "Carlos Ruiz", email: "carlos.ruiz@nova.mx", passwordHash, role: "supervisor" },
    { companyId: company._id, name: "Admin Nova", email: "admin@nova.mx", passwordHash, role: "admin" },
    { companyId: company._id, customerId: refValle._id, name: "Compras Ref. del Valle", email: "compras@refvalle.mx", passwordHash, role: "client" },
  ]);

  // Last 30 days of activity for belts and filters; bearings (serialized)
  // only have their opening stock, so they show up as slow-moving.
  const history = await seedHistory({
    companyId: company._id,
    users: { operator: maria._id, supervisor: carlos._id },
    warehouses: { north: plantaNorte._id, center: centroDistribucion._id },
    locations: { northA: locA._id, northB: locB._id, centerA: locC._id, centerB: locD._id },
    products: { banda: banda._id, filtro: filtro._id },
  });
  await StockBalance.insertMany([
    { productId: balero._id, locationId: locA._id, available: 128, reserved: 0 },
    { productId: balero._id, locationId: locC._id, available: 16, reserved: 0 },
    // A few bearings spread over the plant (opening stock, like the rest of their balance).
    ...([["A-01-R01-P01", 12], ["A-01-R01-P03", 20], ["A-02-R02-P02", 8], ["B-02-R01-P04", 15], ["C-01-R01-P01", 24]] as const)
      .map(([code, available]) => ({ productId: balero._id, locationId: extraByCode.get(code)!, available, reserved: 0 })),
    ...[...history].map(([k, available]) => {
      const [productId, locationId] = k.split(":");
      return { productId, locationId, available, reserved: 0 };
    }),
  ]);

  // Second, unrelated company — demos (and tests) tenant isolation. Its admin
  // reuses Nova's admin email on purpose: emails are unique per company.
  const alfa = await Company.create({ name: "Ferretería Alfa", slug: "alfa" });
  const [alfaWarehouse] = await Warehouse.insertMany([
    { companyId: alfa._id, name: "Bodega Alfa", city: "Guadalajara, JAL", state: "active" },
  ]);
  const [alfaLoc] = await Location.insertMany([
    { warehouseId: alfaWarehouse._id, zone: "Zona A", aisle: "Pasillo 01", rack: "Rack 01", position: "Posición 01", code: "A-01-R01-P01" },
  ]);
  const [alfaProduct] = await Product.insertMany([
    { companyId: alfa._id, sku: "TOR-1/4", name: "Tornillo 1/4 in", barcodeValues: ["TOR-1/4"], unit: "pza", lowStockThreshold: 100, cost: 1.2 },
  ]);
  await StockBalance.insertMany([{ productId: alfaProduct._id, locationId: alfaLoc._id, available: 500, reserved: 0 }]);
  await User.insertMany([
    { companyId: alfa._id, name: "Admin Alfa", email: "admin@nova.mx", passwordHash, role: "admin" },
  ]);

  console.log("[seed] done. Demo login password for all users:", DEMO_PASSWORD);
  console.log("[seed] companies (login \"Empresa\"): nova, alfa");
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
