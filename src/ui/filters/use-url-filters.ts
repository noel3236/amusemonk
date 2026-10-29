'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

// Every filter write goes through here, so the page number always resets when a filter changes.
export function useUrlFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const get = useCallback((key: string) => params.get(key) ?? '', [params]);
  const write = useCallback(
    (sp: URLSearchParams) => {
      sp.delete('page');
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router]
  );
  const setParams = useCallback(
    (patch: Record<string, string | null | undefined>) => {
      const sp = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === '') sp.delete(k);
        else sp.set(k, v);
      }
      write(sp);
    },
    [params, write]
  );
  const clear = useCallback(
    (keys: readonly string[]) => {
      const sp = new URLSearchParams(params.toString());
      keys.forEach((k) => sp.delete(k));
      write(sp);
    },
    [params, write]
  );
  return { get, setParams, clear };
}
