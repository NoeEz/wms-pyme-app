// Integration tests for the movement business rules and idempotency.
// They run against a live API with the demo seed loaded:
//
//   docker compose up -d --build     # API on :4000, seeded on first boot
//   npm test                          # or API_URL=http://host:4000/api npm test
//
// Every test creates its own data (random serials/references), so they can be
// re-run against the same database; they do leave movements behind.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const API = process.env.API_URL ?? "http://localhost:4000/api";

let token = "";
let warehouseId = "";
let otherWarehouseLocationId = "";
let locA = "";
let locB = "";
let lotProductId = "";
let serialProductId = "";

async function call(method: string, path: string, body?: unknown, auth = true) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json().catch(() => ({}))) as any };
}

async function stockAt(productId: string, locationId: string): Promise<number> {
  const { data } = await call("GET", `/inventory?warehouseId=${warehouseId}&locationId=${locationId}`);
  return data.balances
    .filter((b: any) => (b.productId?._id ?? b.productId) === productId)
    .reduce((s: number, b: any) => s + b.available, 0);
}

function inbound(lines: object[], extra: object = {}) {
  return call("POST", "/movements", { warehouseId, type: "inbound", lines, ...extra });
}

before(async () => {
  const login = await call("POST", "/auth/login", { company: "nova", email: "admin@nova.mx", password: "demo1234" }, false);
  assert.equal(login.status, 200, `login failed — is the API running at ${API} with the demo seed? ${JSON.stringify(login.data)}`);
  token = login.data.token;

  // Make sure every movement type is enabled for the demo company.
  await call("PATCH", "/modules", { enabledModules: ["inbound", "outbound", "transfer", "camera_scan", "inventory", "history"] });

  const { data: wh } = await call("GET", "/warehouses");
  warehouseId = wh.warehouses[0]._id;
  const { data: locs } = await call("GET", `/inventory/locations?warehouseId=${warehouseId}`);
  [locA, locB] = locs.locations.map((l: any) => l._id);
  const { data: otherLocs } = await call("GET", `/inventory/locations?warehouseId=${wh.warehouses[1]._id}`);
  otherWarehouseLocationId = otherLocs.locations[0]._id;

  const { data: prods } = await call("GET", "/products");
  lotProductId = prods.products.find((p: any) => p.tracking === "lot")._id;
  serialProductId = prods.products.find((p: any) => p.tracking === "serial")._id;
  assert.ok(locA && locB && lotProductId && serialProductId, "demo seed is missing expected locations/products");
});

test("login rejects wrong credentials", async () => {
  const res = await call("POST", "/auth/login", { company: "nova", email: "admin@nova.mx", password: "nope" }, false);
  assert.equal(res.status, 401);
  assert.equal(res.data.error, "invalid_credentials");
});

test("movements require a token", async () => {
  const res = await call("GET", "/movements", undefined, false);
  assert.equal(res.status, 401);
});

test("malformed body is a 400 validation error, not a 500", async () => {
  const res = await call("POST", "/movements", { warehouseId, type: "inbound", lines: [{ productId: lotProductId, quantity: 0 }] });
  assert.equal(res.status, 400);
  assert.equal(res.data.error, "validation_error");
});

test("inbound adds stock and returns a folio", async () => {
  const before = await stockAt(lotProductId, locA);
  const res = await inbound([{ productId: lotProductId, quantity: 5, destinationLocationId: locA, lot: "T-LOT" }]);
  assert.equal(res.status, 201);
  assert.match(res.data.movement.folio, /^ENT-\d{8}-\d{4}$/);
  assert.equal(await stockAt(lotProductId, locA), before + 5);
});

test("replaying the same clientId is idempotent", async () => {
  const clientId = randomUUID();
  const before = await stockAt(lotProductId, locA);
  const lines = [{ productId: lotProductId, quantity: 3, destinationLocationId: locA }];

  const first = await inbound(lines, { clientId, capturedAt: new Date(Date.now() - 3_600_000).toISOString() });
  const second = await inbound(lines, { clientId });

  assert.equal(first.status, 201);
  assert.equal(second.status, 200);
  assert.equal(second.data.replayed, true);
  assert.equal(second.data.movement.folio, first.data.movement.folio);
  assert.ok(first.data.movement.capturedAt, "capturedAt is stored");
  assert.equal(await stockAt(lotProductId, locA), before + 3, "stock applied once");
});

test("concurrent retries with the same clientId apply once", async () => {
  const clientId = randomUUID();
  const before = await stockAt(lotProductId, locA);
  const lines = [{ productId: lotProductId, quantity: 2, destinationLocationId: locA }];

  const results = await Promise.all([inbound(lines, { clientId }), inbound(lines, { clientId }), inbound(lines, { clientId })]);

  assert.deepEqual(results.map(r => r.status).sort(), [200, 200, 201]);
  assert.equal(new Set(results.map(r => r.data.movement.folio)).size, 1);
  assert.equal(await stockAt(lotProductId, locA), before + 2);
});

test("outbound beyond available stock is rejected and changes nothing", async () => {
  const before = await stockAt(lotProductId, locA);
  const res = await call("POST", "/movements", {
    warehouseId, type: "outbound",
    lines: [{ productId: lotProductId, quantity: before + 1000, sourceLocationId: locA }],
  });
  assert.equal(res.status, 422);
  assert.equal(res.data.error, "insufficient_stock");
  assert.equal(await stockAt(lotProductId, locA), before);
});

test("transfer moves stock between locations", async () => {
  await inbound([{ productId: lotProductId, quantity: 4, destinationLocationId: locA }]);
  const [a, b] = [await stockAt(lotProductId, locA), await stockAt(lotProductId, locB)];
  const res = await call("POST", "/movements", {
    warehouseId, type: "transfer",
    lines: [{ productId: lotProductId, quantity: 4, sourceLocationId: locA, destinationLocationId: locB }],
  });
  assert.equal(res.status, 201);
  assert.equal(await stockAt(lotProductId, locA), a - 4);
  assert.equal(await stockAt(lotProductId, locB), b + 4);
});

test("transfer to the same location is rejected", async () => {
  const res = await call("POST", "/movements", {
    warehouseId, type: "transfer",
    lines: [{ productId: lotProductId, quantity: 1, sourceLocationId: locA, destinationLocationId: locA }],
  });
  assert.equal(res.status, 422);
  assert.equal(res.data.error, "same_location");
});

test("a location from another warehouse is rejected", async () => {
  const res = await inbound([{ productId: lotProductId, quantity: 1, destinationLocationId: otherWarehouseLocationId }]);
  assert.equal(res.status, 422);
  assert.equal(res.data.error, "location_outside_warehouse");
});

test("serial numbers cannot repeat within or across movements", async () => {
  const serial = `T-SN-${randomUUID().slice(0, 8)}`;
  const line = { productId: serialProductId, quantity: 1, destinationLocationId: locA, serial };

  const sameMovement = await inbound([line, line]);
  assert.equal(sameMovement.status, 422);
  assert.equal(sameMovement.data.error, "duplicate_serial");

  assert.equal((await inbound([line])).status, 201);
  const again = await inbound([line]);
  assert.equal(again.status, 422);
  assert.equal(again.data.error, "duplicate_serial");
});

test("a disabled module blocks its movement type", async () => {
  await call("PATCH", "/modules", { enabledModules: ["inbound", "transfer", "camera_scan", "inventory", "history"] });
  try {
    const res = await call("POST", "/movements", {
      warehouseId, type: "outbound",
      lines: [{ productId: lotProductId, quantity: 1, sourceLocationId: locA }],
    });
    assert.equal(res.status, 403);
    assert.equal(res.data.error, "module_disabled");
  } finally {
    await call("PATCH", "/modules", { enabledModules: ["inbound", "outbound", "transfer", "camera_scan", "inventory", "history"] });
  }
});
