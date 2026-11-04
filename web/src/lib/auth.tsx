import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setAuthToken, setUnauthorizedHandler } from "./api";
import type { SessionAccess, SessionCompany, SessionCustomer, SessionUser } from "./types";

// Portal session: token + user + company (+ 3PL customer for role "client").
// Kept in localStorage so a reload doesn't log the user out; validated
// against /auth/me on load and dropped on any 401.
// v2: sessions carry the user's effective access (permissions + warehouses).
const SESSION_KEY = "wms_portal_session_v2";
const LAST_COMPANY_KEY = "wms_portal_last_company";

export interface Session {
  token: string;
  user: SessionUser;
  company: SessionCompany;
  customer: SessionCustomer | null;
  access: SessionAccess;
}

interface AuthContextValue {
  session: Session | null;
  login: (company: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  updateCompany: (company: SessionCompany) => void;
  /** Re-reads names and permissions from /auth/me (after admin changes, on focus). */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStored<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function store(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode / blocked storage: the session just won't survive a reload.
  }
}

export function lastCompany(): string {
  return readStored<string>(LAST_COMPANY_KEY) ?? "";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => {
    const raw = readStored<Session>(SESSION_KEY);
    const stored = raw?.access ? raw : null;
    setAuthToken(stored?.token ?? null);
    return stored;
  });

  const logout = useCallback(() => {
    setAuthToken(null);
    store(SESSION_KEY, null);
    setSession(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  // Refresh names (company renamed, user edited), permissions (an admin
  // changed roles, groups or modules) and catch revoked access.
  const refresh = useCallback(async () => {
    try {
      const me = await api.get<{
        user: { role: SessionUser["role"]; name: string };
        company: SessionCompany | null;
        customer: SessionCustomer | null;
        access: SessionAccess;
      }>("/auth/me");
      setSession(current => {
        if (!current || !me.company) return current;
        const next: Session = {
          ...current,
          user: { ...current.user, name: me.user.name, role: me.user.role },
          company: { id: me.company.id, name: me.company.name, slug: me.company.slug },
          customer: me.customer,
          access: me.access,
        };
        store(SESSION_KEY, next);
        return next;
      });
    } catch {
      // a 401 already logs out; offline keeps the stored session
    }
  }, []);

  const hasSession = !!session;
  useEffect(() => {
    if (!hasSession) return;
    refresh();
    let last = Date.now();
    const onFocus = () => {
      if (Date.now() - last < 30_000) return;
      last = Date.now();
      refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [hasSession, refresh]);

  const login = useCallback(async (company: string, email: string, password: string) => {
    const result = await api.post<Omit<Session, "token"> & { token: string }>("/auth/login", { company, email, password });
    const next: Session = { token: result.token, user: result.user, company: result.company, customer: result.customer ?? null, access: result.access };
    setAuthToken(next.token);
    store(SESSION_KEY, next);
    store(LAST_COMPANY_KEY, next.company.slug);
    setSession(next);
  }, []);

  const updateCompany = useCallback((company: SessionCompany) => {
    setSession(current => {
      if (!current) return current;
      const next = { ...current, company };
      store(SESSION_KEY, next);
      store(LAST_COMPANY_KEY, company.slug);
      return next;
    });
  }, []);

  return <AuthContext.Provider value={{ session, login, logout, updateCompany, refresh }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}

/** The logged-in session; only call inside the authenticated layout. */
export function useSession(): Session {
  const { session } = useAuth();
  if (!session) throw new Error("useSession without a session");
  return session;
}

/**
 * Whether the session holds a permission (any of several). The menu and the
 * routes use it to hide what the user can't do; the API enforces the same
 * rules on every request — this is only about not showing dead ends.
 */
export function hasPermission(session: Session | null, ...anyOf: string[]): boolean {
  return !!session && anyOf.some(p => session.access.permissions.includes(p));
}

export function useCan(...anyOf: string[]): boolean {
  return hasPermission(useAuth().session, ...anyOf);
}
