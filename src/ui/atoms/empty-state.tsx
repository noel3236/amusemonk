import * as React from 'react';
import { cn } from '@/lib/cn';

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'bg-sunken/60 flex flex-col items-center gap-2.5 rounded-lg border border-dashed px-6 py-8 text-center',
        className
      )}
    >
      <div className="bg-surface text-primary flex size-9 items-center justify-center rounded-full border [&_svg]:size-4">
        {icon}
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-bold">{title}</h2>
        {description && <p className="text-muted-foreground max-w-sm text-xs">{description}</p>}
      </div>
      {action}
    </div>
  );
}
