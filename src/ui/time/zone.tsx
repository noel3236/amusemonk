'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DEFAULT_ZONE, ZONE_COOKIE, type ZoneId } from '@/lib/timezones';

const ZoneContext = createContext<{ zone: ZoneId; setZone: (zone: ZoneId) => void }>({
  zone: DEFAULT_ZONE,
  setZone: () => {},
});

// `initial` is the cookie the server rendered with, so the first client render matches it. A change is written back
// and the page refreshed, so server-built text and date filters follow too.
export function ZoneProvider({ initial, children }: { initial: ZoneId; children: React.ReactNode }) {
  const router = useRouter();
  const [zone, set] = useState<ZoneId>(initial);
  const setZone = useCallback(
    (next: ZoneId) => {
      document.cookie = `${ZONE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      set(next);
      router.refresh();
    },
    [router]
  );
  const value = useMemo(() => ({ zone, setZone }), [zone, setZone]);
  return <ZoneContext.Provider value={value}>{children}</ZoneContext.Provider>;
}

export const useZone = () => useContext(ZoneContext);
