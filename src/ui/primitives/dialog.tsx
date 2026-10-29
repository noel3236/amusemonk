'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { Dialog as D } from 'radix-ui';
import { cn } from '@/lib/cn';
import { Button } from './button';

const Dialog = D.Root;
const DialogTrigger = D.Trigger;
const DialogClose = D.Close;

function DialogContent({ className, children, pinned, ...props }: React.ComponentProps<typeof D.Content> & { pinned?: boolean }) {
  return (
    <D.Portal>
      <D.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/40" />
      <D.Content
        className={cn(
          'bg-surface fixed top-1/2 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-5 rounded-xl border p-6 shadow-xl',
          'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          pinned && 'max-h-[85vh] gap-0 overflow-hidden p-0',
          className
        )}
        {...props}
      >
        {children}
      </D.Content>
    </D.Portal>
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof D.Title>) {
  return <D.Title className={cn('text-lg font-extrabold tracking-tight', className)} {...props} />;
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof D.Description>) {
  return <D.Description className={cn('text-muted-foreground text-sm', className)} {...props} />;
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex justify-end gap-2', className)} {...props} />;
}

// A `pinned` DialogContent holds a DialogHeader, a DialogBody and an optional DialogBar; only the body scrolls.
function DialogHeader({
  icon,
  title,
  description,
  aside,
  closeDisabled,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  aside?: React.ReactNode;
  closeDisabled?: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-b px-5 py-4">
      {icon && (
        <span className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-md [&_svg]:size-4">
          {icon}
        </span>
      )}
      <div className="flex min-w-0 flex-col">
        <DialogTitle className="text-base">{title}</DialogTitle>
        {description && <DialogDescription className="truncate text-xs">{description}</DialogDescription>}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {aside}
        <D.Close asChild>
          <Button variant="ghost" size="icon" aria-label="Close" disabled={closeDisabled}>
            <X />
          </Button>
        </D.Close>
      </div>
    </div>
  );
}

function DialogBody({ className, ...props }: React.ComponentProps<'div'>) {
  // Children keep their height so the body scrolls; an `overflow-hidden` child would otherwise shrink and clip.
  return <div className={cn('bg-sunken/40 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5 *:shrink-0', className)} {...props} />;
}

function DialogBar({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex shrink-0 flex-wrap items-center gap-2 border-t px-5 py-3', className)} {...props} />;
}

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogBody,
  DialogBar,
};
