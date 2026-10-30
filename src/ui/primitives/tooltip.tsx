'use client';

import * as React from 'react';
import { Tooltip as Tip } from 'radix-ui';
import { cn } from '@/lib/cn';

const Tooltip = Tip.Root;
const TooltipTrigger = Tip.Trigger;

function TooltipContent({ className, sideOffset = 6, ...props }: React.ComponentProps<typeof Tip.Content>) {
  return (
    <Tip.Portal>
      <Tip.Content
        sideOffset={sideOffset}
        className={cn('bg-foreground text-background z-50 rounded-md px-2.5 py-1.5 text-xs shadow-md', className)}
        {...props}
      />
    </Tip.Portal>
  );
}

function TooltipLabel({ className, ...props }: React.ComponentProps<'span'>) {
  return <span className={cn('text-background/70 text-[10px] font-semibold tracking-wide uppercase', className)} {...props} />;
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipLabel };
