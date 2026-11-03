import { isValidObjectId, Types } from "mongoose";
import type { AuthPayload } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { Customer } from "../models/Customer";
import { Product } from "../models/Product";
import { Warehouse } from "../models/Warehouse";

// Tenant isolation helpers. Every route that reads or writes company data
// goes through these, so a token from one company (or a 3PL client user) can
// never reach another company's (or another customer's) records by ID.

/** Product filter for what this user may see: own company, and only its customer's products for role "client". */
export function productScope(auth: AuthPayload): Record<string, unknown> {
  const filter: Record<string, unknown> = { companyId: new Types.ObjectId(auth.companyId) };
  if (auth.role === "client") filter.customerId = auth.customerId ? new Types.ObjectId(auth.customerId) : null;
  return filter;
}

export async function scopedProductIds(auth: AuthPayload): Promise<Types.ObjectId[]> {
  const products = await Product.find(productScope(auth)).select("_id");
  return products.map(p => p._id);
}

/** 404 unless the warehouse exists and belongs to the company. */
export async function assertWarehouse(companyId: string, warehouseId: string) {
  const warehouse = isValidObjectId(warehouseId)
    ? await Warehouse.findOne({ _id: warehouseId, companyId })
    : null;
  if (!warehouse) throw new HttpError(404, "warehouse_not_found", "El almacén no existe en tu empresa.");
  return warehouse;
}

/** 422 unless the 3PL customer exists in the company. */
export async function assertCustomer(companyId: string, customerId: string) {
  const customer = isValidObjectId(customerId) ? await Customer.findOne({ _id: customerId, companyId }) : null;
  if (!customer) throw new HttpError(422, "customer_not_found", "El cliente no existe en tu empresa.");
  return customer;
}
