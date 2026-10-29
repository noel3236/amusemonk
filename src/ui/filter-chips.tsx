import Link from 'next/link';
import { cn } from '@/lib/cn';

export function FilterChips({
  label,
  items,
}: {
  label: string;
  items: { label: string; href: string; active: boolean; count?: number }[];
}) {
  return (
    <nav aria-label={label} className="bg-sunken flex w-fit flex-wrap gap-1 rounded-lg p-1">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          scroll={false}
          aria-current={it.active ? 'page' : undefined}
          className={cn(
            'flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-semibold transition-colors outline-none focus-visible:ring-[3px]',
            it.active ? 'bg-surface text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {it.label}
          {it.count !== undefined && <span className="tabular text-muted-foreground text-xs font-medium">{it.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
