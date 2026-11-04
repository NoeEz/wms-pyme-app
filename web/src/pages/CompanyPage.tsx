import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "../lib/api";
import { useAuth, useSession } from "../lib/auth";
import type { ModuleInfo, SessionCompany } from "../lib/types";
import { Button, Card, ErrorBox, Field, Input, Loading, PageHeader, Toggle } from "../components/ui";

export default function CompanyPage() {
  return (
    <>
      <PageHeader title="Empresa" description="Datos de la empresa y módulos operativos de la app (EPIC-6)." />
      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-2">
        <CompanyForm />
        <ModulesCard />
      </div>
    </>
  );
}

function CompanyForm() {
  const session = useSession();
  const { updateCompany } = useAuth();
  const [name, setName] = useState(session.company.name);
  const [slug, setSlug] = useState(session.company.slug);
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: () => api.patch<{ company: { _id: string; name: string; slug: string } }>("/company", { name, slug }),
    onSuccess: ({ company }) => {
      const next: SessionCompany = { id: company._id, name: company.name, slug: company.slug };
      updateCompany(next);
      setSaved(true);
    },
  });
  const slugChanged = slug.trim().toLowerCase() !== session.company.slug;

  return (
    <Card title="Datos de la empresa">
      <div className="flex flex-col gap-4">
        <Field label="Nombre"><Input value={name} onChange={e => { setName(e.target.value); setSaved(false); }} /></Field>
        <Field label="Código de inicio de sesión" hint="Lo escriben todos los usuarios en el campo «Empresa» (app y portal).">
          <Input value={slug} onChange={e => { setSlug(e.target.value.toLowerCase()); setSaved(false); }} className="font-mono" />
        </Field>
        {slugChanged && (
          <p className="break-words rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
            Al cambiar el código, todos tus usuarios deberán escribir <span className="break-all font-mono font-semibold">{slug || "…"}</span> la próxima vez que inicien sesión. Las sesiones abiertas no se cierran.
          </p>
        )}
        {save.isError && <ErrorBox message={errorMessage(save.error)} />}
        {saved && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Cambios guardados.</p>}
        <div className="flex justify-end border-t border-slate-200 pt-4"><Button loading={save.isPending} disabled={!name.trim() || !slug.trim()} onClick={() => save.mutate()}>Guardar</Button></div>
      </div>
    </Card>
  );
}

function ModulesCard() {
  const queryClient = useQueryClient();
  const modules = useQuery({ queryKey: ["modules"], queryFn: () => api.get<{ modules: ModuleInfo[] }>("/modules").then(r => r.modules) });
  const save = useMutation({
    mutationFn: (enabledModules: string[]) => api.patch<{ modules: ModuleInfo[] }>("/modules", { enabledModules }),
    onSuccess: data => {
      queryClient.setQueryData(["modules"], data.modules);
      queryClient.invalidateQueries({ queryKey: ["audit"] });
    },
  });

  function toggle(key: string, on: boolean) {
    const current = (modules.data ?? []).filter(m => m.enabled).map(m => m.key);
    save.mutate(on ? [...current, key] : current.filter(k => k !== key));
  }

  return (
    <Card title="Módulos de la app móvil">
      {modules.isPending ? <Loading /> : modules.isError ? <ErrorBox message={errorMessage(modules.error)} /> : (
        <ul className="flex flex-col divide-y divide-slate-100">
          {modules.data.map(m => (
            <li key={m.key} className="flex items-center gap-4 py-3">
              <div className="min-w-0 flex-1 break-words">
                <p className="text-sm font-medium text-slate-800">{m.label}</p>
                <p className="text-xs leading-relaxed text-slate-500">{m.description}</p>
              </div>
              <Toggle checked={m.enabled} disabled={save.isPending} onChange={v => toggle(m.key, v)} label={m.label} />
            </li>
          ))}
        </ul>
      )}
      {save.isError && <div className="mt-3"><ErrorBox message={errorMessage(save.error)} /></div>}
    </Card>
  );
}
