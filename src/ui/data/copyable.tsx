'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';

// Spark's Copyable (registry/copyable), ported to this design system's tokens: the "pop" confirmation
// (copy glyph crossfades to a check with a back-ease overshoot), inline so it sits in a table cell.
const EASE = 'ease-[cubic-bezier(0.34,1.56,0.64,1)]';

export function Copyable({
  value,
  display,
  label,
  mono = true,
  className,
}: {
  value: string;
  // Rendered instead of `value` (e.g. a shortened form); the whole value is still what's copied.
  display?: string;
  label?: string;
  mono?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<number | undefined>(undefined);
  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <button
      type="button"
      title={value}
      aria-label={`Copy ${label ?? value}`}
      data-copied={copied || undefined}
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(value).catch(() => {});
        setCopied(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), 900);
      }}
      className={cn(
        'group/copy -mx-1 inline-flex max-w-full items-center gap-1.5 rounded px-1 text-left outline-none transition-colors',
        'hover:bg-hover focus-visible:ring-ring/40 focus-visible:ring-[3px] data-[copied]:bg-ok-soft',
        className
      )}
    >
      <span className={cn('truncate', mono ? 'font-mono text-xs' : 'text-sm')}>{display ?? value}</span>
      <span aria-hidden className="relative inline-flex size-3.5 shrink-0">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn(
            'text-muted-foreground absolute inset-0 size-3.5 opacity-0 transition-[opacity,transform] duration-300 group-hover/copy:opacity-100 group-focus-visible/copy:opacity-100',
            EASE,
            'group-data-[copied]/copy:scale-0 group-data-[copied]/copy:-rotate-90 group-data-[copied]/copy:opacity-0'
          )}
        >
          <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
        </svg>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn(
            'text-ok absolute inset-0 size-3.5 scale-0 rotate-90 opacity-0 transition-[opacity,transform] duration-300',
            EASE,
            'group-data-[copied]/copy:scale-100 group-data-[copied]/copy:rotate-0 group-data-[copied]/copy:opacity-100'
          )}
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
    </button>
  );
}
