import { useState, type FormEvent } from "react";
import { lastCompany, useAuth } from "../lib/auth";
import { errorMessage } from "../lib/api";
import { Button, Field, Input, PasswordInput } from "../components/ui";
import { Icon } from "../components/Icon";

export default function LoginPage() {
  const { login } = useAuth();
  const [company, setCompany] = useState(lastCompany);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!company.trim() || !email.trim() || !password) {
      setError("Completa todos los campos para continuar.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await login(company.trim().toLowerCase(), email.trim(), password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col bg-slate-950 lg:flex-row">
      <div className="relative flex flex-col justify-center overflow-hidden border-b border-white/10 bg-[radial-gradient(ellipse_at_top_left,rgba(29,78,216,0.28),transparent_65%)] px-6 py-8 sm:px-10 sm:py-12 lg:w-[46%] lg:border-b-0 lg:border-r lg:px-12 xl:px-20">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-white/20 bg-indigo-600 text-xl font-bold text-white shadow-lg shadow-black/10 sm:h-14 sm:w-14 lg:mb-8">W</div>
        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl lg:text-5xl">WMS <span className="font-normal text-indigo-200">PyME</span></h1>
        <p className="mt-4 max-w-md text-sm leading-7 text-slate-200 sm:text-base">Portal de monitoreo y administración del almacén: existencias, movimientos, conteos y reportes en tiempo real.</p>
        <ul className="mt-10 hidden max-w-md flex-col gap-4 border-t border-white/15 pt-8 text-sm leading-relaxed text-slate-200 lg:flex">
          {["Tablero con indicadores de inventario y operación", "Catálogo, ubicaciones y usuarios por empresa", "Acceso para clientes 3PL a su propio inventario"].map(t => (
            <li key={t} className="flex items-start gap-3"><Icon name="check" size={16} className="mt-0.5 shrink-0 text-indigo-200" /> {t}</li>
          ))}
        </ul>
      </div>

      <div className="flex flex-1 items-center justify-center bg-slate-50 px-4 py-8 sm:px-8 sm:py-12 lg:px-12">
        <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_8px_32px_-16px_rgba(23,43,77,0.22)] sm:p-8 lg:p-10" noValidate>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Iniciar sesión</h2>
          <p className="mb-8 mt-2 text-sm leading-relaxed text-slate-500">Usa el código de tu empresa y tu cuenta.</p>
          <div className="flex flex-col gap-5">
            <Field label="Empresa" hint="El código que te dio tu administrador, p. ej. nova">
              <Input value={company} onChange={e => { setCompany(e.target.value); setError(""); }} autoComplete="organization" autoCapitalize="none" autoFocus={!company} />
            </Field>
            <Field label="Correo electrónico">
              <Input type="email" value={email} onChange={e => { setEmail(e.target.value); setError(""); }} autoComplete="username" placeholder="usuario@empresa.mx" autoFocus={!!company} />
            </Field>
            <Field label="Contraseña">
              <PasswordInput value={password} onChange={e => { setPassword(e.target.value); setError(""); }} autoComplete="current-password" />
            </Field>
            {error && (
              <div role="alert" className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-800">
                <Icon name="warning" size={18} className="mt-0.5 shrink-0" /> {error}
              </div>
            )}
            <Button type="submit" loading={loading} className="mt-1 min-h-12 w-full">Ingresar</Button>
          </div>
          <p className="mt-8 border-t border-slate-200 pt-5 text-center text-xs leading-relaxed text-slate-500">v1.0.0 · WMS PyME · Portal web</p>
        </form>
      </div>
    </div>
  );
}
