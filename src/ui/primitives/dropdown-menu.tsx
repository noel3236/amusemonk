'use client';

import * as React from 'react';
import { DropdownMenu as Menu } from 'radix-ui';
import { cn } from '@/lib/cn';

const DropdownMenu = Menu.Root;
const DropdownMenuTrigger = Menu.Trigger;

function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
        sideOffset={sideOffset}
        className={cn(
          'bg-surface text-surface-foreground z-50 min-w-48 overflow-hidden rounded-lg border p-1 shadow-lg',
          'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          className
        )}
        {...props}
      />
    </Menu.Portal>
  );
}

function DropdownMenuItem({ className, ...props }: React.ComponentProps<typeof Menu.Item>) {
  return (
    <Menu.Item
      className={cn(
        'focus:bg-hover flex h-8 items-center gap-2 rounded-md px-2.5 text-sm outline-none select-none [&_svg]:size-4',
        className
      )}
      {...props}
    />
  );
}

function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof Menu.Label>) {
  return <Menu.Label className={cn('px-2.5 py-2 text-sm', className)} {...props} />;
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Menu.Separator>) {
  return <Menu.Separator className={cn('bg-line -mx-1 my-1 h-px', className)} {...props} />;
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
};
