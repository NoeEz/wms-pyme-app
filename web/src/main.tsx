import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./lib/auth";
import { ApiError } from "./lib/api";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Business errors (403/404/422) won't fix themselves; only retry network/server failures.
      retry: (count, err) => count < 2 && (!(err instanceof ApiError) || err.status === 0 || err.status >= 500),
      refetchOnWindowFocus: true,
    },
  },
});

// Drop every cached query when the user logs out or switches account.
function ClearCacheOnLogout() {
  const { session } = useAuth();
  if (!session) queryClient.clear();
  return null;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ClearCacheOnLogout />
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
