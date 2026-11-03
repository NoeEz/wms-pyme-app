import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

/**
 * Create-or-update mutation for the catalog pages: POST when there's no id,
 * PATCH otherwise; refreshes the given query keys (and the dashboard, which
 * depends on the whole catalog) on success.
 */
export function useSave<T>(resource: string, invalidate: string[], onDone?: (saved: T) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: unknown }) =>
      id ? api.patch<T>(`/${resource}/${id}`, body) : api.post<T>(`/${resource}`, body),
    onSuccess: saved => {
      [...invalidate, "dashboard", "audit"].forEach(key => queryClient.invalidateQueries({ queryKey: [key] }));
      onDone?.(saved);
    },
  });
}

/** "" → null for optional numeric inputs. */
export function numberOrNull(text: string): number | null {
  const t = text.trim();
  return t === "" ? null : Number(t);
}
