'use client';

import { ThemeProvider } from 'next-themes';
import { Tooltip } from 'radix-ui';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="data-theme"
      themes={['sandstone', 'night']}
      defaultTheme="sandstone"
      enableSystem={false}
      disableTransitionOnChange
    >
      <Tooltip.Provider delayDuration={250}>{children}</Tooltip.Provider>
    </ThemeProvider>
  );
}
