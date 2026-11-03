// Integration tests for the web-portal API: catalog/user management, audit
// log, physical counts, dashboard KPIs and reports. Same setup as the other
// test files (live API + demo seed). Every test creates its own records with
// random codes, so the suite can be re-run on the same database.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const API = process.env.API_URL ?? "http://localhost:4000/api";
const PASSWORD = "demo1234";

async function call(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json().catch(() => ({}))) as any };
}

async function login(company: string, email: string, password = PASSWORD) {
  return call("POST", "/auth/login", undefined, { company, email, password });
}

async function token(company: string, email: string) {
  const res = await login(company, email);
  assert.equal(res.status, 200, `login ${company}/${email} failed — is the demo seed loaded? ${JSON.stringify(res.data)}`);
  return res.data.token as string;
}

const uid = () => randomUUID().slice(0, 8).toUpperCase();

let admin = "";
let supervisor = "";
let operator = "";
let client = "";
let alfa = "";
let warehouseId = "";
let alfaWarehouseId = "";

/** A fresh product with `qty` units in a fresh location of the demo warehouse. */
async function stockedProduct(qty: number, extra: object = {}) {
  const sku = `T-${uid()}`;
  const product = await call("POST", "/products", supervisor, { sku, name: `Prueba ${sku}`, lowStockThreshold: 5, cost: 10, ...extra });
  assert.equal(product.status, 201, JSON.stringify(product.data));
  const location = await call("POST", "/locations", supervisor, {
    warehouseId, zone: "Zona T", aisle: "P-T", rack: "R-T", position: uid(), code: `T-${uid()}`,
  });
  assert.equal(location.status, 201, JSON.stringify(location.data));
  if (qty > 0) {
    const inbound = await call("POST", "/movements", operator, {
      warehouseId, type: "inbound",
      lines: [{ productId: product.data.product._id, quantity: qty, destinationLocationId: location.data.location._id }],
    });
    assert.equal(inbound.status, 201, JSON.stringify(inbound.data));
  }
  return { product: product.data.product, location: location.data.location };
}

before(async () => {
  admin = await token("nova", "admin@nova.mx");
  supervisor = await token("nova", "carlos.ruiz@nova.mx");
  operator = await token("nova", "maria.lopez@nova.mx");
  client = await token("nova", "compras@refvalle.mx");
  alfa = await token("alfa", "admin@nova.mx");
  warehouseId = (await call("GET", "/warehouses", admin)).data.warehouses.find((w: any) => w.name === "Centro de distribución")._id;
  alfaWarehouseId = (await call("GET", "/warehouses", alfa)).data.warehouses.find((w: any) => w.name === "Bodega Alfa")._id;
});

// ── Catalog ──

test("managers create products; operators and clients cannot", async () => {
  const sku = `T-${uid()}`;
  assert.equal((await call("POST", "/products", operator, { sku, name: "x" })).status, 403);
  assert.equal((await call("POST", "/products", client, { sku, name: "x" })).status, 403);

  const created = await call("POST", "/products", supervisor, { sku, name: "Producto de prueba", cost: 12.5 });
  assert.equal(created.status, 201);
  assert.equal(created.data.product.tracking, "none");

  const dup = await call("POST", "/products", supervisor, { sku, name: "Otro" });
  assert.equal(dup.status, 409);
  assert.equal(dup.data.error, "duplicate");
});

test("product edits are audited with before/after values", async () => {
  const sku = `T-${uid()}`;
  const { data } = await call("POST", "/products", supervisor, { sku, name: "Auditado", cost: 10 });
  const id = data.product._id;

  const patched = await call("PATCH", `/products/${id}`, supervisor, { cost: 15, name: "Auditado" });
  assert.equal(patched.status, 200);
  assert.equal(patched.data.product.cost, 15);

  const { data: log } = await call("GET", `/audit?entity=product&entityId=${id}`, admin);
  assert.deepEqual(log.entries.map((e: any) => e.action), ["update", "create"]);
  assert.deepEqual(log.entries[0].changes, [{ field: "cost", from: 10, to: 15 }]);
  assert.equal(log.entries[0].userName, "Carlos Ruiz");

  assert.equal((await call("GET", "/audit", operator)).status, 403);
});

test("a product or location with stock cannot be deactivated", async () => {
  const { product, location } = await stockedProduct(3);
  const p = await call("PATCH", `/products/${product._id}`, supervisor, { active: false });
  assert.equal(p.status, 422);
  assert.equal(p.data.error, "product_has_stock");

  const t = await call("PATCH", `/products/${product._id}`, supervisor, { tracking: "lot" });
  assert.equal(t.status, 422);
  assert.equal(t.data.error, "tracking_locked");

  const l = await call("PATCH", `/locations/${location._id}`, supervisor, { active: false });
  assert.equal(l.status, 422);
  assert.equal(l.data.error, "location_has_stock");
});

test("deactivated products disappear from the app and can't be moved", async () => {
  const { product, location } = await stockedProduct(0);
  assert.equal((await call("PATCH", `/products/${product._id}`, supervisor, { active: false })).status, 200);

  const list = (await call("GET", "/products", operator)).data.products.map((p: any) => p._id);
  assert.ok(!list.includes(product._id));
  const all = (await call("GET", "/products?includeInactive=true", supervisor)).data.products.map((p: any) => p._id);
  assert.ok(all.includes(product._id));

  const res = await call("POST", "/movements", operator, {
    warehouseId, type: "inbound", lines: [{ productId: product._id, quantity: 1, destinationLocationId: location._id }],
  });
  assert.equal(res.status, 422);
  assert.equal(res.data.error, "product_not_found");
});

test("locations can't be created in another company's warehouse", async () => {
  const res = await call("POST", "/locations", admin, {
    warehouseId: alfaWarehouseId, zone: "Z", aisle: "A", rack: "R", position: "P", code: `T-${uid()}`,
  });
  assert.equal(res.status, 404);
});

test("only admins manage warehouses", async () => {
  assert.equal((await call("POST", "/warehouses", supervisor, { name: "X", city: "Y" })).status, 403);
  const created = await call("POST", "/warehouses", admin, { name: `Almacén ${uid()}`, city: "Puebla, PUE" });
  assert.equal(created.status, 201);
  const off = await call("PATCH", `/warehouses/${created.data.warehouse._id}`, admin, { state: "inactive" });
  assert.equal(off.data.warehouse.state, "inactive");
});

// ── Users and 3PL customers ──

test("admin onboards a 3PL customer and its client user", async () => {
  const code = `C${uid()}`;
  const customer = await call("POST", "/customers", admin, { code, name: "Cliente de prueba" });
  assert.equal(customer.status, 201);
  const customerId = customer.data.customer._id;

  const email = `cliente.${uid().toLowerCase()}@prueba.mx`;
  const noCustomer = await call("POST", "/users", admin, { name: "Sin cliente", email, role: "client", password: "secreta123" });
  assert.equal(noCustomer.status, 422);
  assert.equal(noCustomer.data.error, "customer_required");

  const user = await call("POST", "/users", admin, { name: "Usuario cliente", email, role: "client", customerId, password: "secreta123" });
  assert.equal(user.status, 201);
  assert.equal(user.data.user.passwordHash, undefined);

  const session = await login("nova", email, "secreta123");
  assert.equal(session.status, 200);
  assert.equal(session.data.customer.code, code);
  assert.deepEqual((await call("GET", "/products", session.data.token)).data.products, []);

  await call("PATCH", `/customers/${customerId}`, admin, { active: false });
  const blocked = await login("nova", email, "secreta123");
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.error, "customer_inactive");
});

test("user management: admin only, unique email per company, no self-lockout", async () => {
  assert.equal((await call("GET", "/users", supervisor)).status, 403);

  const dup = await call("POST", "/users", admin, { name: "Dup", email: "maria.lopez@nova.mx", role: "operator", password: "secreta123" });
  assert.equal(dup.status, 409);

  const short = await call("POST", "/users", admin, { name: "Corta", email: `x.${uid().toLowerCase()}@nova.mx`, role: "operator", password: "123" });
  assert.equal(short.status, 400);

  const me = (await call("GET", "/auth/me", admin)).data.user;
  const self = await call("PATCH", `/users/${me._id}`, admin, { role: "operator" });
  assert.equal(self.status, 422);
  assert.equal(self.data.error, "cannot_change_self");

  const email = `op.${uid().toLowerCase()}@nova.mx`;
  const created = await call("POST", "/users", admin, { name: "Temporal", email, role: "operator", password: "secreta123" });
  await call("PATCH", `/users/${created.data.user._id}`, admin, { active: false });
  assert.equal((await login("nova", email, "secreta123")).status, 401);
});

test("company login code can be changed by its admin", async () => {
  assert.equal((await call("PATCH", "/company", supervisor, { name: "x" })).status, 403);
  const bad = await call("PATCH", "/company", admin, { slug: "Con Espacios" });
  assert.equal(bad.status, 400);
  const taken = await call("PATCH", "/company", admin, { slug: "alfa" });
  assert.equal(taken.status, 409);
});

// ── Physical counts ──

test("a count with differences adjusts stock through an AJU movement", async () => {
  const { product, location } = await stockedProduct(10);
  const res = await call("POST", "/counts", supervisor, {
    warehouseId, locationId: location._id, lines: [{ productId: product._id, counted: 7 }], notes: "prueba",
  });
  assert.equal(res.status, 201, JSON.stringify(res.data));
  assert.equal(res.data.count.accurate, false);
  assert.deepEqual(res.data.count.lines.map((l: any) => [l.expected, l.counted]), [[10, 7]]);
  assert.match(res.data.adjustment.folio, /^AJU-\d{8}-\d{4}$/);
  assert.equal(res.data.adjustment.lines[0].quantity, 3);
  assert.equal(res.data.adjustment.lines[0].sourceLocationId, location._id);

  const { data } = await call("GET", `/inventory?warehouseId=${warehouseId}&locationId=${location._id}`, admin);
  assert.equal(data.balances[0].available, 7);

  const again = await call("POST", "/counts", supervisor, { warehouseId, locationId: location._id, lines: [{ productId: product._id, counted: 7 }] });
  assert.equal(again.data.count.accurate, true);
  assert.equal(again.data.adjustment, null);

  assert.equal((await call("POST", "/counts", operator, { warehouseId, locationId: location._id, lines: [{ productId: product._id, counted: 1 }] })).status, 403);
});

test("the app never posts adjustments directly", async () => {
  const { product, location } = await stockedProduct(0);
  const res = await call("POST", "/movements", admin, {
    warehouseId, type: "adjustment", lines: [{ productId: product._id, quantity: 1, destinationLocationId: location._id }],
  });
  assert.equal(res.status, 400);
});

// ── Dashboard ──

test("dashboard overview reports stock, movements, accuracy and sync lag", async () => {
  const before = (await call("GET", `/dashboard/overview?warehouseId=${warehouseId}`, admin)).data;
  const { product, location } = await stockedProduct(12);
  await call("POST", "/movements", operator, {
    warehouseId, type: "outbound", capturedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
    lines: [{ productId: product._id, quantity: 2, sourceLocationId: location._id }],
  });
  const after = (await call("GET", `/dashboard/overview?warehouseId=${warehouseId}&tzOffset=360`, admin)).data;

  assert.equal(after.stock.units, before.stock.units + 10);
  assert.equal(after.movements.totals.inbound.movements, before.movements.totals.inbound.movements + 1);
  assert.equal(after.movements.totals.outbound.units, before.movements.totals.outbound.units + 2);
  assert.equal(after.movements.series.length, 31);
  assert.ok(after.sync.late >= before.sync.late + 1, "the 20-minute-late outbound counts as late");
  assert.ok(after.accuracy.counts >= 1 || after.accuracy.counts === 0);
  assert.ok(after.operators.some((o: any) => o.name === "María López"));
  assert.ok(typeof after.flow.daysOfSupply === "number");
});

test("a 3PL client's dashboard covers only its products and hides operators", async () => {
  const overview = (await call("GET", "/dashboard/overview", client)).data;
  assert.equal(overview.operators, null);
  assert.equal(overview.accuracy, null);
  const stock = (await call("GET", "/dashboard/stock", client)).data.products;
  assert.deepEqual(stock.map((p: any) => p.sku), ["FIL-AC-90"]);
  assert.equal(stock[0].customer.code, "RDV");
});

test("stock table flags low stock and stockouts", async () => {
  const low = await stockedProduct(3); // threshold 5
  const out = await stockedProduct(0);
  const rows = (await call("GET", `/dashboard/stock?warehouseId=${warehouseId}`, admin)).data.products;
  assert.equal(rows.find((r: any) => r.productId === low.product._id).status, "low");
  assert.equal(rows.find((r: any) => r.productId === out.product._id).status, "stockout");
});

test("invalid periods are rejected", async () => {
  const res = await call("GET", "/dashboard/overview?from=2026-02-01&to=2026-01-01", admin);
  assert.equal(res.status, 400);
  assert.equal(res.data.error, "invalid_period");
});

// ── Reports ──

test("kardex reconciles opening, movements and closing", async () => {
  const { product, location } = await stockedProduct(8);
  await call("POST", "/movements", operator, {
    warehouseId, type: "outbound", lines: [{ productId: product._id, quantity: 3, sourceLocationId: location._id }],
  });
  await call("POST", "/counts", supervisor, { warehouseId, locationId: location._id, lines: [{ productId: product._id, counted: 6 }] });

  const { data } = await call("GET", `/reports/kardex?productId=${product._id}`, admin);
  assert.equal(data.opening, 0);
  assert.deepEqual(data.rows.map((r: any) => [r.type, r.in, r.out, r.balance]), [
    ["inbound", 8, 0, 8],
    ["outbound", 0, 3, 5],
    ["adjustment", 1, 0, 6],
  ]);
  assert.equal(data.closing, 6);
});

test("movements and stock-by-location reports are scoped and flattened", async () => {
  const { product } = await stockedProduct(4);
  const rows = (await call("GET", `/reports/movements?warehouseId=${warehouseId}&type=inbound`, admin)).data.rows;
  const row = rows.find((r: any) => r.sku === product.sku);
  assert.equal(row.quantity, 4);
  assert.equal(row.user, "María López");

  const clientRows = (await call("GET", "/reports/movements", client)).data.rows;
  assert.ok(clientRows.every((r: any) => r.sku === "FIL-AC-90" && r.user === "—"));

  const stock = (await call("GET", "/reports/stock-by-location", client)).data.rows;
  assert.ok(stock.length > 0 && stock.every((r: any) => r.sku === "FIL-AC-90"));
  assert.equal(stock[0].value, stock[0].available * 62);
});
