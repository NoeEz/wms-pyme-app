// Integration tests for modules and access control (Tesina §4.5): module
// catalog with core modules, dependencies and settings; RBAC with roles,
// groups, individual exceptions and warehouse scope; administrator-only
// powers; critical adjustments authorized by a different user;
// inter-warehouse transfers. Same setup as the other files (live API + demo
// seed); every test creates its own users/records and restores settings.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const API = process.env.API_URL ?? "http://localhost:4000/api";
const PASSWORD = "demo1234";

async function call(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json().catch(() => ({}))) as any };
}

async function login(email: string, password = PASSWORD, company = "nova") {
  const res = await call("POST", "/auth/login", undefined, { company, email, password });
  assert.equal(res.status, 200, `login ${email}: ${JSON.stringify(res.data)}`);
  return res.data as { token: string; access: { permissions: string[]; warehouseIds: string[] | null } };
}

const uid = () => randomUUID().slice(0, 8).toLowerCase();

let admin = "";
let supervisor = "";
let operator = "";
let centro = "";
let norte = "";

/** A fresh staff user (operator by default) and its token. */
async function newUser(extra: Record<string, unknown> = {}) {
  const email = `t-${uid()}@nova.mx`;
  const created = await call("POST", "/users", admin, { name: `Prueba ${email}`, email, role: "operator", password: "segura123", ...extra });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const session = await login(email, "segura123");
  return { id: created.data.user._id as string, email, token: session.token, access: session.access };
}

async function location(warehouseId: string) {
  const res = await call("POST", "/locations", supervisor, {
    warehouseId, zone: "Zona T", aisle: "P-T", rack: "R-T", position: uid(), code: `T-${uid()}`,
  });
  assert.equal(res.status, 201, JSON.stringify(res.data));
  return res.data.location._id as string;
}

async function product() {
  const sku = `T-${uid()}`;
  const res = await call("POST", "/products", supervisor, { sku, name: `Prueba ${sku}`, barcodeValues: [sku] });
  assert.equal(res.status, 201, JSON.stringify(res.data));
  return res.data.product._id as string;
}

async function stockAt(productId: string, locationId: string) {
  const balances = (await call("GET", `/products/${productId}`, admin)).data.balances as any[];
  return balances.find(b => b.locationId._id === locationId)?.available ?? 0;
}

async function setSettings(moduleKey: string, settings: Record<string, unknown>) {
  const res = await call("PATCH", `/modules/${moduleKey}/settings`, admin, { settings });
  assert.equal(res.status, 200, JSON.stringify(res.data));
}

before(async () => {
  admin = (await login("admin@nova.mx")).token;
  supervisor = (await login("carlos.ruiz@nova.mx")).token;
  operator = (await login("maria.lopez@nova.mx")).token;
  const warehouses = (await call("GET", "/warehouses", admin)).data.warehouses as any[];
  centro = warehouses.find(w => w.name === "Centro de distribución")._id;
  norte = warehouses.find(w => w.name === "Planta Norte")._id;
});

after(async () => {
  const all = (await call("GET", "/modules", admin)).data.modules.map((m: any) => m.key);
  await call("PATCH", "/modules", admin, { enabledModules: all });
});

// ── Modules ──

test("login returns the effective permissions; reserved ones only for the admin", async () => {
  const op = await login("maria.lopez@nova.mx");
  assert.ok(op.access.permissions.includes("inbound.create"));
  assert.ok(!op.access.permissions.some(p => p.startsWith("admin.")));
  const adm = await login("admin@nova.mx");
  assert.ok(adm.access.permissions.includes("admin.modules"));
  assert.equal(adm.access.warehouseIds, null);
});

test("only the administrator configures modules; core modules stay on", async () => {
  assert.equal((await call("PATCH", "/modules", supervisor, { enabledModules: [] })).status, 403);
  assert.equal((await call("PATCH", "/modules/inbound/settings", supervisor, { settings: { requireReference: true } })).status, 403);

  const res = await call("PATCH", "/modules", admin, { enabledModules: ["inbound"] });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const enabled = res.data.modules.filter((m: any) => m.enabled).map((m: any) => m.key);
  for (const core of ["products", "warehouses", "history", "admin"]) assert.ok(enabled.includes(core), core);
  assert.ok(!enabled.includes("reports"));
  // Reports off: the dashboard answers module_disabled even for the admin.
  const dash = await call("GET", "/dashboard/overview", admin);
  assert.equal(dash.status, 403);
  assert.equal(dash.data.error, "module_disabled");

  const all = res.data.modules.map((m: any) => m.key);
  assert.equal((await call("PATCH", "/modules", admin, { enabledModules: all })).status, 200);
});

test("module dependencies are enforced", async () => {
  const res = await call("PATCH", "/modules", admin, { enabledModules: ["camera_scan", "inventory", "reports"] });
  assert.equal(res.status, 422);
  assert.equal(res.data.error, "module_dependency");
});

test("module settings are validated, audited and applied (referencia obligatoria)", async () => {
  assert.equal((await call("PATCH", "/modules/inbound/settings", admin, { settings: { nope: true } })).status, 422);
  assert.equal((await call("PATCH", "/modules/inbound/settings", admin, { settings: { requireReference: "sí" } })).status, 422);

  const productId = await product();
  const loc = await location(centro);
  await setSettings("inbound", { requireReference: true });
  try {
    const line = { productId, quantity: 1, destinationLocationId: loc };
    const missing = await call("POST", "/movements", operator, { warehouseId: centro, type: "inbound", lines: [line] });
    assert.equal(missing.status, 422);
    assert.equal(missing.data.error, "reference_required");
    const ok = await call("POST", "/movements", operator, { warehouseId: centro, type: "inbound", reference: "FAC-123", lines: [line] });
    assert.equal(ok.status, 201, JSON.stringify(ok.data));
  } finally {
    await setSettings("inbound", { requireReference: false });
  }
  const entries = (await call("GET", "/audit?entity=modules", admin)).data.entries;
  assert.ok(entries.some((e: any) => e.changes.some((c: any) => c.field === "inbound.requireReference")));
});

// ── Roles, groups and exceptions ──

test("only the administrator creates roles; its powers can't be delegated", async () => {
  assert.equal((await call("POST", "/roles", supervisor, { name: `Rol ${uid()}`, permissions: [] })).status, 403);
  const reserved = await call("POST", "/roles", admin, { name: `Rol ${uid()}`, permissions: ["inventory.view", "admin.users"] });
  assert.equal(reserved.status, 422);
  assert.equal(reserved.data.error, "reserved_permission");
  const unknown = await call("POST", "/roles", admin, { name: `Rol ${uid()}`, permissions: ["fly.plane"] });
  assert.equal(unknown.status, 400);

  const roles = (await call("GET", "/roles", admin)).data.roles as any[];
  const adminRole = roles.find(r => r.key === "admin");
  assert.equal((await call("PATCH", `/roles/${adminRole._id}`, admin, { permissions: [] })).status, 422);
  const operatorRole = roles.find(r => r.key === "operator");
  assert.equal((await call("PATCH", `/roles/${operatorRole._id}`, admin, { active: false })).status, 422);
});

test("a custom role grants its permissions to the users it's assigned to", async () => {
  const user = await newUser();
  const productId = await product();
  const loc = await location(centro);
  const count = { warehouseId: centro, locationId: loc, lines: [{ productId, counted: 0 }] };
  assert.equal((await call("POST", "/counts", user.token, count)).status, 403);

  const role = await call("POST", "/roles", admin, { name: `Contador ${uid()}`, permissions: ["inventory.count"] });
  assert.equal(role.status, 201, JSON.stringify(role.data));
  assert.equal((await call("PATCH", `/users/${user.id}`, admin, { roleIds: [role.data.role._id] })).status, 200);
  // Takes effect on the next request — no new login needed.
  assert.equal((await call("POST", "/counts", user.token, count)).status, 201);

  const access = (await call("GET", `/users/${user.id}/access`, admin)).data;
  assert.ok(access.sources["inventory.count"].some((s: any) => s.kind === "custom_role"));
});

test("an individual exception needs a justification and is audited", async () => {
  const user = await newUser();
  const noReason = await call("POST", `/users/${user.id}/overrides`, admin, { permission: "inbound.create", effect: "deny", reason: "" });
  assert.equal(noReason.status, 400);
  const reserved = await call("POST", `/users/${user.id}/overrides`, admin, { permission: "admin.modules", effect: "allow", reason: "Prueba de reserva" });
  assert.equal(reserved.status, 422);

  const deny = await call("POST", `/users/${user.id}/overrides`, admin, { permission: "inbound.create", effect: "deny", reason: "Capacitación pendiente" });
  assert.equal(deny.status, 201, JSON.stringify(deny.data));
  const productId = await product();
  const loc = await location(centro);
  const inbound = await call("POST", "/movements", user.token, {
    warehouseId: centro, type: "inbound", lines: [{ productId, quantity: 1, destinationLocationId: loc }],
  });
  assert.equal(inbound.status, 403);
  assert.equal(inbound.data.error, "forbidden");

  const allow = await call("POST", `/users/${user.id}/overrides`, admin, { permission: "history.view", effect: "allow", reason: "Apoyo a supervisión" });
  assert.equal(allow.status, 201);
  assert.ok((await login(user.email, "segura123")).access.permissions.includes("history.view"));

  const log = (await call("GET", "/audit?entity=permission", admin)).data.entries as any[];
  assert.ok(log.some(e => e.action === "revoke" && e.reason === "Capacitación pendiente"));
  assert.ok(log.some(e => e.action === "grant" && e.reason === "Apoyo a supervisión"));
  // The refused movement was recorded as an authorization event.
  const denied = (await call("GET", "/audit?action=denied", admin)).data.entries as any[];
  assert.ok(denied.some(e => e.userName === `Prueba ${user.email}` && e.label === "inbound.create"));
});

test("a group restricts its members to some warehouses, also in reports", async () => {
  const user = await newUser();
  const group = await call("POST", "/groups", admin, { name: `Norte ${uid()}`, memberIds: [user.id], warehouseIds: [norte] });
  assert.equal(group.status, 201, JSON.stringify(group.data));

  const warehouses = (await call("GET", "/warehouses", user.token)).data.warehouses as any[];
  assert.deepEqual(warehouses.map(w => w._id), [norte]);

  const productId = await product();
  const loc = await location(centro);
  const inbound = await call("POST", "/movements", user.token, {
    warehouseId: centro, type: "inbound", lines: [{ productId, quantity: 1, destinationLocationId: loc }],
  });
  assert.equal(inbound.status, 403);
  assert.equal(inbound.data.error, "warehouse_forbidden");
  assert.equal((await call("GET", `/dashboard/overview?warehouseId=${centro}`, user.token)).status, 403);
  assert.equal((await call("GET", `/inventory/locations?warehouseId=${centro}`, user.token)).status, 403);
  const stock = (await call("GET", "/reports/stock-by-location", user.token)).data;
  assert.ok((stock.rows ?? []).every((r: any) => r.warehouse === "Planta Norte"));

  // Members of a group can't be 3PL clients; groups can't carry the admin role.
  const adminRole = (await call("GET", "/roles", admin)).data.roles.find((r: any) => r.key === "admin");
  assert.equal((await call("PATCH", `/groups/${group.data.group._id}`, admin, { roleIds: [adminRole._id] })).status, 422);
});

test("without history.view an operator sees only its own movements", async () => {
  const user = await newUser();
  const movements = (await call("GET", "/movements?limit=200", user.token)).data.movements as any[];
  assert.equal(movements.length, 0);
  const all = (await call("GET", "/movements?limit=5", supervisor)).data.movements as any[];
  assert.ok(all.length > 0);
});

test("a deactivated user is locked out at once, even with a valid token", async () => {
  const user = await newUser();
  assert.equal((await call("GET", "/warehouses", user.token)).status, 200);
  assert.equal((await call("PATCH", `/users/${user.id}`, admin, { active: false })).status, 200);
  assert.equal((await call("GET", "/warehouses", user.token)).status, 401);
});

// ── Critical adjustments and inter-warehouse transfers ──

test("a critical adjustment waits for a different user's authorization", async () => {
  const productId = await product();
  const loc = await location(centro);
  assert.equal((await call("POST", "/movements", operator, {
    warehouseId: centro, type: "inbound", lines: [{ productId, quantity: 10, destinationLocationId: loc }],
  })).status, 201);

  await setSettings("inventory", { requireApproval: true, approvalThreshold: 3 });
  try {
    // Below the threshold: applied at once.
    const small = await call("POST", "/counts", supervisor, { warehouseId: centro, locationId: loc, lines: [{ productId, counted: 9 }] });
    assert.equal(small.status, 201);
    assert.equal(small.data.count.status, "applied");
    assert.equal(await stockAt(productId, loc), 9);

    const big = await call("POST", "/counts", supervisor, { warehouseId: centro, locationId: loc, lines: [{ productId, counted: 4 }] });
    assert.equal(big.status, 201);
    assert.equal(big.data.count.status, "pending");
    assert.equal(big.data.adjustment, null);
    assert.equal(await stockAt(productId, loc), 9, "stock untouched while pending");

    const id = big.data.count._id;
    const self = await call("POST", `/counts/${id}/approve`, supervisor, {});
    assert.equal(self.status, 422);
    assert.equal(self.data.error, "same_user");
    assert.equal((await call("POST", `/counts/${id}/approve`, operator, {})).status, 403);

    const approved = await call("POST", `/counts/${id}/approve`, admin, { note: "Verificado en sitio" });
    assert.equal(approved.status, 200, JSON.stringify(approved.data));
    assert.equal(approved.data.count.status, "applied");
    assert.match(approved.data.adjustment.folio, /^AJU-/);
    assert.equal(approved.data.count.lines[0].before, 9);
    assert.equal(await stockAt(productId, loc), 4);
    assert.equal((await call("POST", `/counts/${id}/approve`, admin, {})).status, 422);
  } finally {
    await setSettings("inventory", { requireApproval: false, approvalThreshold: 0 });
  }
});

test("transfers between warehouses move stock atomically and can be disabled", async () => {
  const productId = await product();
  const from = await location(centro);
  const to = await location(norte);
  assert.equal((await call("POST", "/movements", operator, {
    warehouseId: centro, type: "inbound", lines: [{ productId, quantity: 5, destinationLocationId: from }],
  })).status, 201);

  const transfer = (destinationLocationId: string, destinationWarehouseId?: string) => call("POST", "/movements", operator, {
    warehouseId: centro, destinationWarehouseId, type: "transfer",
    lines: [{ productId, quantity: 2, sourceLocationId: from, destinationLocationId }],
  });
  // Destination location in another warehouse without saying so: rejected.
  assert.equal((await transfer(to)).status, 422);

  const ok = await transfer(to, norte);
  assert.equal(ok.status, 201, JSON.stringify(ok.data));
  assert.equal(ok.data.movement.destinationWarehouseId, norte);
  assert.equal(await stockAt(productId, from), 3);
  assert.equal(await stockAt(productId, to), 2);
  // It shows up in the destination warehouse's movements too.
  const norteMoves = (await call("GET", `/movements?warehouseId=${norte}&type=transfer`, supervisor)).data.movements as any[];
  assert.ok(norteMoves.some(m => m._id === ok.data.movement._id));

  await setSettings("transfer", { allowInterWarehouse: false });
  try {
    const off = await transfer(to, norte);
    assert.equal(off.status, 422);
    assert.equal(off.data.error, "inter_warehouse_disabled");
  } finally {
    await setSettings("transfer", { allowInterWarehouse: true });
  }
});

// ── More module settings ──

test("product settings: required cost and default minimum stock", async () => {
  await setSettings("products", { requireCost: true, defaultLowStockThreshold: 7 });
  try {
    const sku = `T-${uid()}`;
    const noCost = await call("POST", "/products", supervisor, { sku, name: "x", barcodeValues: [sku] });
    assert.equal(noCost.status, 422);
    assert.equal(noCost.data.error, "cost_required");
    const ok = await call("POST", "/products", supervisor, { sku, name: "x", barcodeValues: [sku], cost: 12 });
    assert.equal(ok.status, 201, JSON.stringify(ok.data));
    assert.equal(ok.data.product.lowStockThreshold, 7);
  } finally {
    await setSettings("products", { requireCost: false, defaultLowStockThreshold: 0 });
  }
});

test("movement settings: max quantity per line, lot required, protected minimum", async () => {
  const loc = await location(centro);
  const lotSku = `T-${uid()}`;
  const lotProduct = (await call("POST", "/products", supervisor, { sku: lotSku, name: "Lote", barcodeValues: [lotSku], tracking: "lot" })).data.product._id;
  const minSku = `T-${uid()}`;
  const minProduct = (await call("POST", "/products", supervisor, { sku: minSku, name: "Min", barcodeValues: [minSku], lowStockThreshold: 5 })).data.product._id;
  assert.equal((await call("POST", "/movements", operator, {
    warehouseId: centro, type: "inbound", lines: [{ productId: minProduct, quantity: 10, destinationLocationId: loc }],
  })).status, 201);

  await setSettings("inbound", { requireLot: true, maxQuantityPerLine: 100 });
  await setSettings("outbound", { protectMinimumStock: true });
  try {
    const tooMany = await call("POST", "/movements", operator, {
      warehouseId: centro, type: "inbound", lines: [{ productId: minProduct, quantity: 101, destinationLocationId: loc }],
    });
    assert.equal(tooMany.data.error, "quantity_limit");
    const noLot = await call("POST", "/movements", operator, {
      warehouseId: centro, type: "inbound", lines: [{ productId: lotProduct, quantity: 1, destinationLocationId: loc }],
    });
    assert.equal(noLot.data.error, "lot_required");
    const withLot = await call("POST", "/movements", operator, {
      warehouseId: centro, type: "inbound", lines: [{ productId: lotProduct, quantity: 1, destinationLocationId: loc, lot: "L-1" }],
    });
    assert.equal(withLot.status, 201, JSON.stringify(withLot.data));

    const below = await call("POST", "/movements", operator, {
      warehouseId: centro, type: "outbound", lines: [{ productId: minProduct, quantity: 6, sourceLocationId: loc }],
    });
    assert.equal(below.data.error, "below_minimum");
    const fine = await call("POST", "/movements", operator, {
      warehouseId: centro, type: "outbound", lines: [{ productId: minProduct, quantity: 5, sourceLocationId: loc }],
    });
    assert.equal(fine.status, 201, JSON.stringify(fine.data));
  } finally {
    await setSettings("inbound", { requireLot: false, maxQuantityPerLine: 0 });
    await setSettings("outbound", { protectMinimumStock: false });
  }
});

test("inactive warehouses don't accept movements or counts", async () => {
  const wh = await call("POST", "/warehouses", admin, { name: `Temporal ${uid()}`, city: "Puebla" });
  assert.equal(wh.status, 201);
  const id = wh.data.warehouse._id;
  const loc = await location(id);
  const productId = await product();
  assert.equal((await call("PATCH", `/warehouses/${id}`, admin, { state: "inactive" })).status, 200);
  const res = await call("POST", "/movements", operator, {
    warehouseId: id, type: "inbound", lines: [{ productId, quantity: 1, destinationLocationId: loc }],
  });
  assert.equal(res.data.error, "warehouse_inactive");
  const count = await call("POST", "/counts", supervisor, { warehouseId: id, locationId: loc, lines: [{ productId, counted: 1 }] });
  assert.equal(count.data.error, "warehouse_inactive");
});

test("count notes required when the count differs", async () => {
  const productId = await product();
  const loc = await location(centro);
  await setSettings("inventory", { requireCountNotes: true });
  try {
    const body = { warehouseId: centro, locationId: loc, lines: [{ productId, counted: 3 }] };
    const missing = await call("POST", "/counts", supervisor, body);
    assert.equal(missing.data.error, "notes_required");
    assert.equal((await call("POST", "/counts", supervisor, { ...body, notes: "Mercancía sin registrar" })).status, 201);
  } finally {
    await setSettings("inventory", { requireCountNotes: false });
  }
});

test("administration settings: minimum password length", async () => {
  await setSettings("admin", { minPasswordLength: 12 });
  try {
    const email = `t-${uid()}@nova.mx`;
    const short = await call("POST", "/users", admin, { name: "x", email, role: "operator", password: "corta1234" });
    assert.equal(short.data.error, "password_too_short");
    assert.equal((await call("POST", "/users", admin, { name: "x", email, role: "operator", password: "suficientemente-larga" })).status, 201);
  } finally {
    await setSettings("admin", { minPasswordLength: 8 });
  }
  assert.equal((await call("PATCH", "/modules/admin/settings", admin, { settings: { minPasswordLength: 4 } })).status, 422);
});
