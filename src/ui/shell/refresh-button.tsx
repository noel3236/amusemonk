'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '../primitives/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../primitives/tooltip';

export function RefreshButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Refresh data" disabled={pending} onClick={() => start(() => router.refresh())}>
          <RefreshCw className={cn(pending && 'animate-spin')} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Refresh data</TooltipContent>
    </Tooltip>
  );
}
