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
    <div className="flex min-h-full flex-col bg-slate-900 lg:flex-row">
      <div className="flex flex-col justify-center px-8 py-12 lg:w-1/2 lg:px-16">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-xl font-extrabold text-white shadow-lg shadow-black/30">W</div>
        <h1 className="text-3xl font-bold tracking-tight text-white">WMS <span className="font-light text-slate-400">PyME</span></h1>
        <p className="mt-2 max-w-md text-slate-400">Portal de monitoreo y administración del almacén: existencias, movimientos, conteos y reportes en tiempo real.</p>
        <ul className="mt-8 hidden flex-col gap-3 text-sm text-slate-300 lg:flex">
          {["Tablero con indicadores de inventario y operación", "Catálogo, ubicaciones y usuarios por empresa", "Acceso para clientes 3PL a su propio inventario"].map(t => (
            <li key={t} className="flex items-center gap-2"><Icon name="check" size={16} className="text-indigo-400" /> {t}</li>
          ))}
        </ul>
      </div>

      <div className="flex flex-1 items-center justify-center rounded-t-[28px] bg-slate-50 px-6 py-10 lg:rounded-none">
        <form onSubmit={submit} className="w-full max-w-sm" noValidate>
          <h2 className="text-lg font-semibold text-slate-900">Iniciar sesión</h2>
          <p className="mb-6 mt-1 text-sm text-slate-500">Usa el código de tu empresa y tu cuenta.</p>
          <div className="flex flex-col gap-4">
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
              <div role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
                <Icon name="warning" size={18} className="mt-0.5" /> {error}
              </div>
            )}
            <Button type="submit" loading={loading} className="mt-2 h-11">Ingresar</Button>
          </div>
          <p className="mt-8 text-center text-xs text-slate-400">v1.0.0 · WMS PyME · Portal web</p>
        </form>
      </div>
    </div>
  );
}
