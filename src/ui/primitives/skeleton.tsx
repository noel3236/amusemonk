import * as React from 'react';
import { cn } from '@/lib/cn';

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('bg-sunken animate-pulse rounded-md', className)} {...props} />;
}

export { Skeleton };
