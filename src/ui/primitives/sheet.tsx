'use client';

import * as React from 'react';
import { Dialog as D } from 'radix-ui';
import { cn } from '@/lib/cn';

const Sheet = D.Root;
const SheetTrigger = D.Trigger;
const SheetClose = D.Close;

function SheetContent({ className, children, ...props }: React.ComponentProps<typeof D.Content>) {
  return (
    <D.Portal>
      <D.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/30" />
      <D.Content
        className={cn(
          'bg-surface fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l shadow-xl',
          'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
          className
        )}
        {...props}
      >
        {children}
      </D.Content>
    </D.Portal>
  );
}

const SheetTitle = D.Title;
const SheetDescription = D.Description;

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetTitle, SheetDescription };
