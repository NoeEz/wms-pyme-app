import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { Icon } from "./Icon";

// Shared UI kit for the portal — same visual language as the mobile app
// (neutral surfaces, blue primary, consistent control spacing).

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-500 disabled:shadow-none",
  secondary: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 disabled:text-slate-500",
  ghost: "text-slate-600 hover:bg-slate-100 disabled:text-slate-500",
  danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-slate-100 disabled:text-slate-500",
};

export function Button({
  variant = "primary", size = "md", icon, loading, children, className = "", ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; icon?: string; loading?: boolean }) {
  const sizing = size === "sm" ? "min-h-9 px-3 py-2 text-xs gap-1.5" : "min-h-11 px-4 py-2.5 text-sm gap-2";
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={`inline-flex items-center justify-center rounded-lg font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed ${sizing} ${VARIANTS[variant]} ${className}`}
    >
      {loading ? <Spinner size={size === "sm" ? 12 : 16} /> : icon && <Icon name={icon} size={size === "sm" ? 14 : 18} />}
      {children}
    </button>
  );
}

export function Spinner({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={`animate-spin ${className}`} aria-label="Cargando">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" fill="none" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function Field({ label, hint, error, children, className = "" }: { label: string; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {error ? <span className="text-xs text-red-600">{error}</span> : hint && <span className="text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

const CONTROL = "h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-base sm:text-sm text-slate-900 placeholder:text-slate-500 transition-colors hover:border-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500";

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={`${CONTROL} ${className}`} />;
}

export function Select({ className = "", children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...rest} className={`${CONTROL} pr-8 ${className}`}>{children}</select>;
}

export function SearchInput({ value, onChange, placeholder = "Buscar…", className = "" }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <Input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="pl-9" />
    </div>
  );
}

export function Card({ title, actions, children, className = "", padded = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={`min-w-0 rounded-xl border border-slate-200 bg-white shadow-[0_2px_8px_-4px_rgba(23,43,77,0.12)] [&_.panel-empty-state]:py-8 [&_.panel-loading]:py-6 ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-5">
          {typeof title === "string" ? <h2 className="text-sm font-semibold text-slate-800">{title}</h2> : title}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={padded ? "p-4 sm:p-5" : ""}>{children}</div>
    </section>
  );
}

const BADGES = {
  neutral: "bg-slate-100 text-slate-700",
  info: "bg-indigo-50 text-indigo-700",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-800",
  danger: "bg-red-50 text-red-700",
} as const;

export function Badge({ variant = "neutral", children }: { variant?: keyof typeof BADGES; children: ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold ring-1 ring-inset ring-current/10 ${BADGES[variant]}`}>{children}</span>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-[28px] sm:leading-tight">{title}</h1>
        {description && <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon = "inventory", title, description }: { icon?: string; title: string; description?: string }) {
  return (
    <div className="panel-empty-state flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"><Icon name={icon} size={24} /></div>
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {description && <p className="max-w-sm text-sm text-slate-500">{description}</p>}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3.5 text-sm leading-relaxed text-red-800">
      <Icon name="warning" size={18} className="mt-0.5" />
      <span className="min-w-0 flex-1 break-words">{message}</span>
      {onRetry && <button onClick={onRetry} className="font-medium underline">Reintentar</button>}
    </div>
  );
}

export function Loading({ label = "Cargando…" }: { label?: string }) {
  return <div className="panel-loading flex items-center justify-center gap-3 py-14 text-sm text-slate-500"><Spinner /> {label}</div>;
}

export function Modal({ open, title, onClose, children, footer, wide }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/55 p-3 sm:p-6" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`w-full ${wide ? "max-w-3xl" : "max-w-lg"} min-w-0 shrink-0 rounded-xl border border-slate-200 bg-white shadow-2xl sm:my-auto`}>
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-6 sm:py-5">
          <h2 className="min-w-0 flex-1 text-base font-semibold text-slate-900 [overflow-wrap:anywhere]">{title}</h2>
          <button onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-600" aria-label="Cerrar"><Icon name="x" size={18} /></button>
        </header>
        <div className="px-4 py-5 sm:px-6">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 rounded-b-xl border-t border-slate-200 bg-slate-50 px-4 py-4 sm:px-6">{footer}</footer>}
      </div>
    </div>
  );
}

/** Scrollable table wrapper; children are <thead>/<tbody>. */
export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-full overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-left text-sm [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-indigo-50/60 [&_tbody_tr:last-child_td]:border-b-0">{children}</table>
    </div>
  );
}

export const th = "border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600";
export const td = "border-b border-slate-100 px-4 py-3 align-middle text-slate-700";

export function Stat({ label, value, hint, tone = "default", icon }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "good" | "warn" | "bad"; icon?: string }) {
  const tones = { default: "text-slate-900", good: "text-emerald-700", warn: "text-amber-700", bad: "text-red-700" };
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-[0_2px_8px_-4px_rgba(23,43,77,0.12)] sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold leading-relaxed text-slate-500">{label}</p>
        {icon && <Icon name={icon} size={18} className="shrink-0 text-indigo-600" />}
      </div>
      <p className={`tabular mt-3 break-words text-2xl font-semibold tracking-tight sm:text-3xl ${tones[tone]}`}>{value}</p>
      {hint && <p className="mt-2 text-xs leading-relaxed text-slate-500">{hint}</p>}
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${checked ? "bg-indigo-600" : "bg-slate-300"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-5.5" : "left-0.5"}`} />
    </button>
  );
}
