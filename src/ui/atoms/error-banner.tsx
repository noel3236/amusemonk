import * as React from 'react';
import { CircleAlert } from 'lucide-react';
import { cn } from '@/lib/cn';

export function ErrorBanner({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className={cn(
        'bg-bad-soft text-bad flex items-start gap-2 rounded-md px-3 py-2 text-sm font-medium',
        className
      )}
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
