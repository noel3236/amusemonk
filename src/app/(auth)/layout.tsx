import { LogoMark, ShieldCheck, FileSpreadsheet, ListChecks } from '@/ui';

const POINTS = [
  { icon: FileSpreadsheet, title: 'Whole-file checks', body: 'A file is accepted in full or not at all.' },
  { icon: ShieldCheck, title: 'Paid exactly once', body: 'Every row is keyed by its client reference.' },
  { icon: ListChecks, title: 'Live status', body: 'Each payout is tracked until it settles.' },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="bg-panel text-panel-foreground relative hidden flex-col justify-between overflow-hidden p-12 lg:flex">
        <div className="flex items-center gap-3">
          <LogoMark className="size-10" />
          <span className="text-xl font-extrabold tracking-tight">amusemonk</span>
        </div>

        <div className="flex max-w-md flex-col gap-8">
          <h2 className="text-4xl leading-tight font-extrabold tracking-tight">
            Upload a payout file. <span className="text-brand">We pay every row once.</span>
          </h2>
          <ul className="flex flex-col gap-5">
            {POINTS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-current/10">
                  <Icon className="size-5" />
                </span>
                <span>
                  <span className="block font-bold">{title}</span>
                  <span className="text-sm opacity-80">{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-sm opacity-70">Sandbox environment</p>
      </aside>

      <section className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">{children}</div>
      </section>
    </div>
  );
}
