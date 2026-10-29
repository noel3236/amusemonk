import { cn } from '@/lib/cn';

// Two offset arcs: a stylised seated figure, read as a monogram "a".
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn('size-8', className)}>
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <circle cx="16" cy="10.5" r="3.5" className="fill-brand" />
      <path
        d="M8 24c0-4.8 3.6-8.5 8-8.5s8 3.7 8 8.5"
        className="stroke-primary-foreground"
        strokeWidth="2.6"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <LogoMark className="size-7" />
      <span className="text-base font-extrabold tracking-tight">amusemonk</span>
    </span>
  );
}
