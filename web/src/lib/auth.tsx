import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setAuthToken, setUnauthorizedHandler } from "./api";
import type { Role, SessionCompany, SessionCustomer, SessionUser } from "./types";

// Portal session: token + user + company (+ 3PL customer for role "client").
// Kept in localStorage so a reload doesn't log the user out; validated
// against /auth/me on load and dropped on any 401.
const SESSION_KEY = "wms_portal_session_v1";
const LAST_COMPANY_KEY = "wms_portal_last_company";

export interface Session {
  token: string;
  user: SessionUser;
  company: SessionCompany;
  customer: SessionCustomer | null;
}

interface AuthContextValue {
  session: Session | null;
  login: (company: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  updateCompany: (company: SessionCompany) => void;
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
    const stored = readStored<Session>(SESSION_KEY);
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

  // Refresh names (company renamed, user edited) and catch revoked access.
  useEffect(() => {
    if (!session) return;
    api.get<{ company: SessionCompany & { _id?: string }; customer: SessionCustomer | null }>("/auth/me")
      .then(me => {
        if (!me.company) return;
        const next = { ...session, company: { id: me.company.id, name: me.company.name, slug: me.company.slug }, customer: me.customer };
        store(SESSION_KEY, next);
        setSession(next);
      })
      .catch(() => {}); // a 401 already logs out; offline keeps the stored session
    // Only on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (company: string, email: string, password: string) => {
    const result = await api.post<Omit<Session, "token"> & { token: string }>("/auth/login", { company, email, password });
    const next: Session = { token: result.token, user: result.user, company: result.company, customer: result.customer ?? null };
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

  return <AuthContext.Provider value={{ session, login, logout, updateCompany }}>{children}</AuthContext.Provider>;
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

// What each role may do in the portal (the API enforces the same rules).
export const can = {
  manageCatalog: (r: Role) => r === "supervisor" || r === "admin",
  count: (r: Role) => r === "supervisor" || r === "admin",
  audit: (r: Role) => r === "supervisor" || r === "admin",
  admin: (r: Role) => r === "admin",
  seeStaff: (r: Role) => r !== "client",
};
