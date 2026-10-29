'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Gauge, Files, ScrollText, ShieldCheck, LogOut, UserRound } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Wordmark } from '../logo';
import { ThemeToggle } from '../theme-toggle';
import { Button } from '../primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../primitives/dropdown-menu';

const NAV = [
  { href: '/dashboard', label: 'Overview', icon: Gauge },
  { href: '/files', label: 'Files', icon: Files },
  { href: '/payouts', label: 'Payouts', icon: ScrollText },
];

const ADMIN_NAV = { href: '/admin', label: 'Admin', icon: ShieldCheck };

export function AppShell({
  user,
  isAdmin = false,
  signOutAction,
  children,
}: {
  user: { email: string | null } | null;
  isAdmin?: boolean;
  signOutAction?: () => Promise<void>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const nav = isAdmin ? [...NAV, ADMIN_NAV] : NAV;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-surface/85 sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex h-12 max-w-[96rem] items-center gap-5 px-4 sm:px-6">
          <Link href="/dashboard" className="rounded-md outline-none focus-visible:ring-[3px]">
            <Wordmark />
          </Link>

          <nav aria-label="Main" className="bg-sunken hidden items-center gap-1 rounded-lg p-1 md:flex">
            {nav.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(href + '/');
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-semibold transition-colors outline-none focus-visible:ring-[3px]',
                    active
                      ? 'bg-surface text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className="size-3.5" />
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Account">
                    <UserRound />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>
                    <span className="text-muted-foreground block text-xs">Signed in as</span>
                    <span className="font-semibold">{user.email ?? 'Unknown'}</span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void signOutAction?.()}>
                    <LogOut />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-4 pb-2 md:hidden">
          {nav.map(({ href, label }) => {
            const active = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'h-8 shrink-0 rounded-md px-3 text-sm leading-8 font-semibold',
                  active ? 'bg-sunken text-foreground' : 'text-muted-foreground'
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-[96rem] flex-1 px-4 py-5 sm:px-6">{children}</main>
    </div>
  );
}
