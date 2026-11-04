import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useModules } from "../lib/data";
import type { ModuleInfo } from "../lib/types";
import { Badge, Button, Card, ErrorBox, Input, Loading, PageHeader, Toggle } from "../components/ui";
import { Icon } from "../components/Icon";

// Tesina §4.5 / EPIC-6: the administrator enables the company's modules and
// edits their configuration. Core modules (security and integrity) can't be
// turned off; dependencies are explained before saving. Turning a module off
// hides and blocks its operations; it never deletes data or movements.
export default function ModulesPage() {
  const modules = useModules();
  const queryClient = useQueryClient();
  const { refresh } = useAuth();
  const save = useMutation({
    mutationFn: (enabledModules: string[]) => api.patch<{ modules: ModuleInfo[] }>("/modules", { enabledModules }),
    onSuccess: data => {
      queryClient.setQueryData(["modules"], data.modules);
      queryClient.invalidateQueries({ queryKey: ["audit"] });
      refresh(); // the admin's own menu depends on enabled modules
    },
  });

  const list = modules.data ?? [];
  const label = (key: string) => list.find(m => m.key === key)?.label ?? key;
  const enabled = new Set(list.filter(m => m.enabled).map(m => m.key));

  /** Why a module can't be switched (on → off or off → on) right now; null if it can. */
  function blocker(m: ModuleInfo): string | null {
    if (m.core) return "Módulo central: siempre activo.";
    if (m.enabled) {
      const dependents = list.filter(d => d.enabled && d.key !== m.key && (
        d.dependsOn.includes(m.key) ||
        (d.dependsOnAny.includes(m.key) && !d.dependsOnAny.some(k => k !== m.key && enabled.has(k)))
      ));
      return dependents.length ? `Primero desactiva: ${dependents.map(d => d.label).join(", ")}.` : null;
    }
    const missing = m.dependsOn.filter(k => !enabled.has(k));
    if (missing.length) return `Requiere: ${missing.map(label).join(", ")}.`;
    if (m.dependsOnAny.length && !m.dependsOnAny.some(k => enabled.has(k))) return `Requiere al menos uno de: ${m.dependsOnAny.map(label).join(", ")}.`;
    return null;
  }

  function toggle(m: ModuleInfo, on: boolean) {
    const next = on ? [...enabled, m.key] : [...enabled].filter(k => k !== m.key);
    save.mutate(next);
  }

  return (
    <>
      <PageHeader
        title="Módulos"
        description="Solo el administrador habilita módulos y define su configuración. Desactivar un módulo oculta y bloquea sus operaciones en la app y el portal, sin borrar datos ni movimientos confirmados."
      />
      {save.isError && <div className="mb-4"><ErrorBox message={errorMessage(save.error)} /></div>}
      {modules.isPending ? <Loading /> : modules.isError ? <ErrorBox message={errorMessage(modules.error)} /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {list.map(m => <ModuleCard key={m.key} module={m} blocker={blocker(m)} busy={save.isPending} onToggle={on => toggle(m, on)} label={label} />)}
        </div>
      )}
    </>
  );
}

function ModuleCard({ module: m, blocker, busy, onToggle, label }: {
  module: ModuleInfo; blocker: string | null; busy: boolean; onToggle: (on: boolean) => void; label: (key: string) => string;
}) {
  const deps = [
    ...m.dependsOn.map(label),
    ...(m.dependsOnAny.length ? [`uno de: ${m.dependsOnAny.map(label).join(" / ")}`] : []),
  ];
  return (
    <Card
      className={m.enabled ? "" : "opacity-80"}
      title={
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-slate-400">§{m.section}</span>
          <h2 className="text-sm font-semibold text-slate-800">{m.label}</h2>
          {m.core ? <Badge variant="info">Central</Badge> : m.enabled ? <Badge variant="success">Activo</Badge> : <Badge>Inactivo</Badge>}
        </div>
      }
      actions={m.core
        ? <span className="flex items-center gap-1 text-xs text-slate-400"><Icon name="lock" size={14} /> Protegido</span>
        : <Toggle checked={m.enabled} disabled={busy || !!blocker} onChange={onToggle} label={m.label} />}
    >
      <p className="text-sm text-slate-600">{m.description}</p>
      {deps.length > 0 && <p className="mt-2 text-xs text-slate-500">Depende de: {deps.join(", ")}</p>}
      {blocker && !m.core && <p className="mt-2 text-xs text-amber-700">{blocker}</p>}
      {m.settingsSchema.length > 0 && <SettingsForm module={m} />}
    </Card>
  );
}

function SettingsForm({ module: m }: { module: ModuleInfo }) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, boolean | number | string>>(m.settings);
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: () => api.patch<{ modules: ModuleInfo[] }>(`/modules/${m.key}/settings`, {
      settings: Object.fromEntries(m.settingsSchema.map(s => [s.key, s.type === "number" ? Number(values[s.key]) : values[s.key]])),
    }),
    onSuccess: data => {
      queryClient.setQueryData(["modules"], data.modules);
      queryClient.invalidateQueries({ queryKey: ["audit"] });
      setSaved(true);
    },
  });
  const dirty = m.settingsSchema.some(s => String(values[s.key]) !== String(m.settings[s.key]));
  const set = (key: string, v: boolean | string) => { setValues(x => ({ ...x, [key]: v })); setSaved(false); };

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Configuración ({m.settingsSchema.length})</p>
      {m.settingsSchema.map(s => (
        <div key={s.key} className="flex items-start gap-3">
          {s.type === "boolean" ? (
            <Toggle checked={!!values[s.key]} onChange={v => set(s.key, v)} label={s.label} />
          ) : (
            <div className="flex shrink-0 items-center gap-1.5">
              <div className="w-24">
                <Input
                  type="number" min={s.min} max={s.max} value={String(values[s.key])} aria-label={s.label}
                  onChange={e => set(s.key, e.target.value)} className="text-right"
                />
              </div>
              {s.unit && <span className="w-16 text-xs text-slate-500">{s.unit}</span>}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm text-slate-700">{s.label}</p>
            {s.help && <p className="text-xs text-slate-500">{s.help}</p>}
          </div>
        </div>
      ))}
      {save.isError && <ErrorBox message={errorMessage(save.error)} />}
      <div className="flex items-center justify-end gap-3">
        {saved && !dirty && <span className="text-xs text-emerald-700">Configuración guardada.</span>}
        <Button size="sm" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>Guardar configuración</Button>
      </div>
    </div>
  );
}
