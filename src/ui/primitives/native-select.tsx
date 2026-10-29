import * as React from 'react';
import { cn } from '@/lib/cn';

function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'border-field bg-surface h-8 w-full rounded-md border px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/30 focus-visible:ring-[3px]',
        className
      )}
      {...props}
    />
  );
}

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'border-field bg-surface placeholder:text-muted-foreground min-h-24 w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/30 focus-visible:ring-[3px]',
        className
      )}
      {...props}
    />
  );
}

export { NativeSelect, Textarea };
