import type { Metadata } from 'next';
import { LogoMark } from '@/ui';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <div className="flex flex-col gap-8">
      <LogoMark className="size-10 lg:hidden" />
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-extrabold tracking-tight">Sign in</h1>
        <p className="text-muted-foreground text-sm">Use your gateway account to continue.</p>
      </div>
      <LoginForm next={next ?? ''} />
    </div>
  );
}
