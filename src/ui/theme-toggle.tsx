'use client';

import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { Button } from './primitives/button';
import { useHydrated } from './use-hydrated';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const hydrated = useHydrated();
  const night = hydrated && resolvedTheme === 'night';
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={night ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={() => setTheme(night ? 'sandstone' : 'night')}
    >
      {night ? <Sun /> : <Moon />}
    </Button>
  );
}
