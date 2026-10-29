import * as React from 'react';
import { cn } from '@/lib/cn';

export function Banner({ tone, icon, children }: { tone: 'warn' | 'bad' | 'neutral'; icon: React.ReactNode; children: React.ReactNode }) {
  const cls = { warn: 'bg-warn-soft', bad: 'bg-bad-soft', neutral: 'bg-sunken' }[tone];
  return (
    <div className={cn('flex items-start gap-2.5 rounded-lg px-4 py-2.5 text-sm', cls)}>
      <span className="mt-0.5 shrink-0 [&_svg]:size-4">{icon}</span>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}
