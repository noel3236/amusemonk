'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

const TABS = [
  { href: '/admin/files', label: 'All files' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/rules', label: 'Upload rules' },
] as const;

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="flex gap-5 border-b">
      {TABS.map(({ href, label }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 pb-2 text-[13px] font-semibold transition-colors outline-none focus-visible:ring-[3px]',
              active
                ? 'border-primary text-foreground'
                : 'text-muted-foreground hover:text-foreground border-transparent'
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
