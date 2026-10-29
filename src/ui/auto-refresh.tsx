'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Re-renders the server page while something is still moving, so statuses update without a reload.
export function AutoRefresh({ seconds = 15, active = true }: { seconds?: number; active?: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds, active]);
  return null;
}
