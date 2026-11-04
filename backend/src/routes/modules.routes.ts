import { Router } from "express";
import { z } from "zod";
import { authenticate, requirePermission } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { Company } from "../models/Company";
import {
  ALL_MODULE_KEYS, MODULE_CATALOG, enabledModuleSet, isValidModuleKey, moduleDef, moduleSettings, parseSettingsPatch,
  validateModuleSet, type ModuleKey,
} from "../config/modules";
import { PERMISSIONS } from "../config/permissions";
import { audit } from "../services/audit";

// Company modules (Tesina §4.5, EPIC-6). Everybody reads them (the apps hide
// what's off and apply settings such as "referencia obligatoria"); only the
// administrator enables modules and edits their configuration.
export const modulesRouter = Router();

modulesRouter.use(authenticate);

function describe(company: any) {
  const enabled = enabledModuleSet(company);
  return MODULE_CATALOG.map(m => ({
    key: m.key,
    label: m.label,
    description: m.description,
    section: m.section,
    core: m.core,
    dependsOn: m.dependsOn,
    dependsOnAny: m.dependsOnAny,
    enabled: enabled.has(m.key),
    settingsSchema: m.settings,
    settings: moduleSettings(company, m.key),
    permissions: PERMISSIONS.filter(p => p.module === m.key).map(p => p.key),
  }));
}

async function ownCompany(companyId: string) {
  const company = await Company.findById(companyId);
  if (!company) throw new HttpError(404, "not_found", "Empresa no encontrada.");
  return company;
}

modulesRouter.get("/", async (req, res, next) => {
  try {
    res.json({ modules: describe(await ownCompany(req.auth!.companyId)) });
  } catch (err) {
    next(err);
  }
});

const updateSchema = z.object({
  enabledModules: z.array(z.string()).refine(keys => keys.every(isValidModuleKey), {
    message: "Uno o más módulos no son válidos.",
  }),
});

modulesRouter.patch("/", requirePermission("admin.modules"), async (req, res, next) => {
  try {
    const body = updateSchema.parse(req.body);
    const { keys, problem } = validateModuleSet(body.enabledModules);
    if (problem) throw new HttpError(422, "module_dependency", problem);

    const company = await ownCompany(req.auth!.companyId);
    const was = [...enabledModuleSet(company)].sort();
    company.enabledModules = keys;
    company.knownModules = [...ALL_MODULE_KEYS];
    await company.save();
    const now = [...enabledModuleSet(company)].sort();
    if (JSON.stringify(was) !== JSON.stringify(now)) {
      await audit(req.auth!, { action: "update", entity: "modules", entityId: company._id, changes: [{ field: "enabledModules", from: was, to: now }] });
    }
    res.json({ modules: describe(company) });
  } catch (err) {
    next(err);
  }
});

modulesRouter.patch("/:key/settings", requirePermission("admin.modules"), async (req, res, next) => {
  try {
    const key = req.params.key;
    if (!isValidModuleKey(key)) throw new HttpError(404, "not_found", "Módulo no encontrado.");
    const patch = z.record(z.unknown()).parse(req.body?.settings ?? req.body);
    const { values, problem } = parseSettingsPatch(key as ModuleKey, patch);
    if (problem) throw new HttpError(422, "invalid_setting", problem);

    const company = await ownCompany(req.auth!.companyId);
    const before = moduleSettings(company, key as ModuleKey);
    const all = { ...((company.moduleSettings ?? {}) as Record<string, unknown>) };
    all[key] = { ...before, ...values };
    company.moduleSettings = all;
    company.markModified("moduleSettings");
    await company.save();

    const changes = Object.entries(values)
      .filter(([k, v]) => before[k] !== v)
      .map(([k, v]) => ({ field: `${key}.${k}`, from: before[k], to: v }));
    if (changes.length) {
      await audit(req.auth!, { action: "update", entity: "modules", entityId: company._id, label: moduleDef(key)!.label, changes });
    }
    res.json({ modules: describe(company) });
  } catch (err) {
    next(err);
  }
});
