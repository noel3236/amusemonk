import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

const step = 'flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-semibold bg-surface';

export function Pager({
  page,
  pages,
  total,
  noun,
  hrefFor,
}: {
  page: number;
  pages: number;
  total: number;
  noun: string;
  hrefFor: (page: number) => string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground tabular text-xs">
        {total.toLocaleString('en-IN')} {noun}
      </span>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Link href={hrefFor(page - 1)} scroll={false} className={cn(step, 'hover:bg-hover')}>
              <ChevronLeft className="size-3.5" />
              Previous
            </Link>
          ) : (
            <span className={cn(step, 'text-muted-foreground opacity-50')}>
              <ChevronLeft className="size-3.5" />
              Previous
            </span>
          )}
          <span className="text-muted-foreground tabular text-xs">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link href={hrefFor(page + 1)} scroll={false} className={cn(step, 'hover:bg-hover')}>
              Next
              <ChevronRight className="size-3.5" />
            </Link>
          ) : (
            <span className={cn(step, 'text-muted-foreground opacity-50')}>
              Next
              <ChevronRight className="size-3.5" />
            </span>
          )}
        </div>
      )}
    </div>
  );
}
