import Link from 'next/link';
import { Copyable } from '@/ui';

export function FileLink({ href, name }: { href: string; name: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      <Link href={href} title={name} className="text-primary truncate font-semibold hover:underline">
        {name}
      </Link>
      <Copyable value={name} display="" label="file name" />
    </div>
  );
}
