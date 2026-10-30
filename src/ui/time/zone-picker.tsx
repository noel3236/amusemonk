'use client';

import { DateTime } from 'luxon';
import { Check, Globe } from 'lucide-react';
import { cn } from '@/lib/cn';
import { abbrOf, ZONES } from '@/lib/timezones';
import { Button } from '../primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '../primitives/dropdown-menu';
import { useZone } from './zone';

// The trigger names the live zone at rest, since switching it silently re-reads every date on screen.
export function ZonePicker() {
  const { zone, setZone } = useZone();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 px-2" aria-label={`Time zone: ${abbrOf(zone)}. Change`}>
          <Globe className="text-muted-foreground" />
          <span className="text-xs font-semibold">{abbrOf(zone)}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-muted-foreground text-[10px] tracking-wide uppercase">Show times in</DropdownMenuLabel>
        {ZONES.map((z) => (
          <DropdownMenuItem key={z.zone} onSelect={() => setZone(z.zone)} className="gap-2">
            <span className="flex-1">{z.label}</span>
            {/* Mounted only once the menu opens, so reading the clock here can't break hydration. */}
            <span className="text-muted-foreground tabular text-xs">{DateTime.now().setZone(z.zone).toFormat('HH:mm')}</span>
            <Check className={cn('size-3.5', zone === z.zone ? 'opacity-100' : 'opacity-0')} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
