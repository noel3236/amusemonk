import * as React from 'react';
import { cn } from '@/lib/cn';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        'border-field bg-surface placeholder:text-muted-foreground h-8 w-full min-w-0 rounded-md border px-2.5 text-sm transition-[border-color,box-shadow] outline-none',
        'focus-visible:border-ring focus-visible:ring-ring/30 focus-visible:ring-[3px]',
        'read-only:bg-sunken read-only:text-muted-foreground aria-invalid:border-bad',
        className
      )}
      {...props}
    />
  );
}

export { Input };
