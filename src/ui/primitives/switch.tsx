'use client';

import * as React from 'react';
import { Switch as S } from 'radix-ui';
import { cn } from '@/lib/cn';

function Switch({ className, ...props }: React.ComponentProps<typeof S.Root>) {
  return (
    <S.Root
      className={cn(
        'peer data-[state=checked]:bg-primary data-[state=unchecked]:bg-field inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60',
        className
      )}
      {...props}
    >
      <S.Thumb className="bg-surface pointer-events-none block size-4 rounded-full shadow-sm transition-transform data-[state=checked]:translate-x-4.5 data-[state=unchecked]:translate-x-0.5" />
    </S.Root>
  );
}

export { Switch };
