'use client';

import { formatDateTime, formatRelative, toDateTime, type DateInput } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Tooltip, TooltipContent, TooltipLabel, TooltipTrigger } from '../primitives/tooltip';
import { useZone } from './zone';

// Every date on screen: shown in the viewer's zone; hover adds UTC and how long ago. `inline` drops the tab stop, for
// dates repeated down a table, where a focusable cell per row would make keyboard users tab through them all.
export function Time({ at, inline = false, className }: { at: DateInput; inline?: boolean; className?: string }) {
  const { zone } = useZone();
  const shown = formatDateTime(at, zone);
  if (!toDateTime(at)) return <span className={className}>{shown}</span>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={inline ? undefined : 0}
          className={cn('tabular hover:bg-hover -mx-0.5 cursor-default rounded px-0.5 outline-none focus-visible:ring-[3px]', className)}
        >
          {shown}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <dl className="grid grid-cols-[auto_auto] items-baseline gap-x-3 gap-y-0.5">
          <dt>
            <TooltipLabel>UTC</TooltipLabel>
          </dt>
          <dd className="tabular">{formatDateTime(at, 'UTC')}</dd>
          <dt>
            <TooltipLabel>Relative</TooltipLabel>
          </dt>
          <dd>{formatRelative(at)}</dd>
        </dl>
      </TooltipContent>
    </Tooltip>
  );
}
