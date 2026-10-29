'use client';

import { Toaster as Sonner } from 'sonner';
import { useTheme } from 'next-themes';

export function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={resolvedTheme === 'night' ? 'dark' : 'light'}
      position="bottom-right"
      toastOptions={{ classNames: { toast: 'bg-surface! border-line! text-foreground!' } }}
    />
  );
}
