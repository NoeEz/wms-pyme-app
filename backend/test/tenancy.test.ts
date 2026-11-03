// Integration tests for login-by-company, tenant isolation and the 3PL
// "client" role. Same setup as movements.test.ts: a live API with the demo
// seed (companies "nova" and "alfa"; Alfa's admin reuses admin@nova.mx).

import { test, before } from "node:test";
import assert from "node:assert/strict";

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

async function login(company: string, email: string) {
  const res = await call("POST", "/auth/login", undefined, { company, email, password: PASSWORD });
  assert.equal(res.status, 200, `login ${company}/${email} failed — is the demo seed loaded? ${JSON.stringify(res.data)}`);
  return res.data;
}

let nova = "";
let alfa = "";
let client = "";
let novaWarehouseId = "";
let novaLocationId = "";
let alfaWarehouseId = "";
let alfaLocationId = "";
let alfaProductId = "";
let ownProductId = "";      // Nova's own product
let customerProductId = ""; // Refaccionaria del Valle's product, stored by Nova

before(async () => {
  nova = (await login("nova", "admin@nova.mx")).token;
  alfa = (await login("alfa", "admin@nova.mx")).token;
  client = (await login("nova", "compras@refvalle.mx")).token;

  novaWarehouseId = (await call("GET", "/warehouses", nova)).data.warehouses.find((w: any) => w.name === "Centro de distribución")._id;
  novaLocationId = (await call("GET", `/inventory/locations?warehouseId=${novaWarehouseId}`, nova)).data.locations[0]._id;
  alfaWarehouseId = (await call("GET", "/warehouses", alfa)).data.warehouses.find((w: any) => w.name === "Bodega Alfa")._id;
  alfaLocationId = (await call("GET", `/inventory/locations?warehouseId=${alfaWarehouseId}`, alfa)).data.locations[0]._id;
  alfaProductId = (await call("GET", "/products", alfa)).data.products[0]._id;

  const novaProducts = (await call("GET", "/products", nova)).data.products;
  ownProductId = novaProducts.find((p: any) => !p.customerId && p.tracking !== "serial")._id;
  customerProductId = novaProducts.find((p: any) => p.customerId)._id;
});

test("login needs the right company", async () => {
  const res = await call("POST", "/auth/login", undefined, { company: "alfa", email: "maria.lopez@nova.mx", password: PASSWORD });
  assert.equal(res.status, 401);
  assert.equal(res.data.error, "invalid_credentials");

  const missing = await call("POST", "/auth/login", undefined, { email: "admin@nova.mx", password: PASSWORD });
  assert.equal(missing.status, 400);
});

test("the same email logs into each company separately", async () => {
  const [a, b] = [await call("GET", "/auth/me", nova), await call("GET", "/auth/me", alfa)];
  assert.equal(a.data.company.slug, "nova");
  assert.equal(b.data.company.slug, "alfa");
  assert.notEqual(a.data.user.companyId, b.data.user.companyId);
});

test("another company's warehouse is not reachable", async () => {
  const locations = await call("GET", `/inventory/locations?warehouseId=${alfaWarehouseId}`, nova);
  assert.equal(locations.status, 404);

  const inventory = await call("GET", `/inventory?warehouseId=${alfaWarehouseId}`, nova);
  assert.equal(inventory.status, 404);

  const movement = await call("POST", "/movements", nova, {
    warehouseId: alfaWarehouseId, type: "inbound",
    lines: [{ productId: ownProductId, quantity: 1, destinationLocationId: alfaLocationId }],
  });
  assert.equal(movement.status, 404);
  assert.equal(movement.data.error, "warehouse_not_found");
});

test("another company's product cannot be moved", async () => {
  const res = await call("POST", "/movements", nova, {
    warehouseId: novaWarehouseId, type: "inbound",
    lines: [{ productId: alfaProductId, quantity: 1, destinationLocationId: novaLocationId }],
  });
  assert.equal(res.status, 422);
  assert.equal(res.data.error, "product_not_found");
});

test("listings never mix companies", async () => {
  const novaSkus = (await call("GET", "/products", nova)).data.products.map((p: any) => p.sku);
  const alfaSkus = (await call("GET", "/products", alfa)).data.products.map((p: any) => p.sku);
  assert.ok(!alfaSkus.some((s: string) => novaSkus.includes(s)));

  const alfaBalances = (await call("GET", "/inventory", alfa)).data.balances;
  assert.ok(alfaBalances.every((b: any) => b.productId.companyId === alfaBalances[0].productId.companyId));
  assert.equal((await call("GET", `/products/${ownProductId}`, alfa)).status, 404);
});

test("a malformed id is a 400, not a 500", async () => {
  const res = await call("GET", "/products/not-an-id", nova);
  assert.equal(res.status, 400);
  assert.equal(res.data.error, "invalid_id");
});

test("a 3PL client sees only its customer's products and stock", async () => {
  const products = (await call("GET", "/products", client)).data.products;
  assert.deepEqual(products.map((p: any) => p._id), [customerProductId]);

  const balances = (await call("GET", "/inventory", client)).data.balances;
  assert.ok(balances.length > 0);
  assert.ok(balances.every((b: any) => b.productId._id === customerProductId));

  assert.equal((await call("GET", `/products/${ownProductId}`, client)).status, 404);
});

test("a 3PL client cannot create movements", async () => {
  const res = await call("POST", "/movements", client, {
    warehouseId: novaWarehouseId, type: "inbound",
    lines: [{ productId: customerProductId, quantity: 1, destinationLocationId: novaLocationId }],
  });
  assert.equal(res.status, 403);
  assert.equal(res.data.error, "forbidden");
});

test("a 3PL client sees only its own lines of a mixed movement", async () => {
  const created = await call("POST", "/movements", nova, {
    warehouseId: novaWarehouseId, type: "inbound", reference: "mixed-3pl",
    lines: [
      { productId: ownProductId, quantity: 1, destinationLocationId: novaLocationId },
      { productId: customerProductId, quantity: 1, destinationLocationId: novaLocationId },
    ],
  });
  assert.equal(created.status, 201);
  const id = created.data.movement._id;

  const detail = await call("GET", `/movements/${id}`, client);
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.data.movement.lines.map((l: any) => l.productId._id), [customerProductId]);

  const listed = (await call("GET", "/movements", client)).data.movements;
  assert.ok(listed.every((m: any) => m.lines.every((l: any) => l.productId === customerProductId)));
});
