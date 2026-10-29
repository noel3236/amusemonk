import Link from 'next/link';
import { Button } from '@/ui';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-primary text-sm font-bold tracking-[0.14em] uppercase">404</p>
      <h1 className="text-2xl font-extrabold tracking-tight">This page doesn’t exist</h1>
      <Button asChild variant="outline">
        <Link href="/dashboard">Back to Overview</Link>
      </Button>
    </div>
  );
}
