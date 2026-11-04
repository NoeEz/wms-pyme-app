import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, errorMessage } from "../lib/api";
import { useAuth, useSession } from "../lib/auth";
import type { SessionCompany } from "../lib/types";
import { Button, Card, ErrorBox, Field, Input, PageHeader } from "../components/ui";

export default function CompanyPage() {
  return (
    <>
      <PageHeader title="Empresa" description="Nombre y código de inicio de sesión. Los módulos y permisos se administran en su propia sección." />
      <div className="min-w-0 max-w-2xl"><CompanyForm /></div>
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
