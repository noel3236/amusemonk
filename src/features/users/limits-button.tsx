'use client';

import { useState, useTransition } from 'react';
import { describeParams, RULE_FIELDS, type RuleKind } from '@/features/rules/catalog';
import { RuleFields, toParams, toValues, type Values } from '@/features/rules/rule-controls';
import { saveUserLimitsAction } from './actions';
import {
  Badge,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
  ErrorBanner,
  SlidersHorizontal,
  Switch,
  cn,
  toast,
} from '@/ui';

export interface LimitRule {
  id: string;
  kind: RuleKind;
  name: string;
  enabled: boolean;
  global: Record<string, unknown>;
}

type Row = { custom: boolean; values: Values };

export function UserLimitsButton({
  userId,
  email,
  rules,
  overrides,
}: {
  userId: string;
  email: string | null;
  rules: LimitRule[];
  overrides: Record<string, Record<string, unknown>>;
}) {
  const initial = () =>
    Object.fromEntries(
      rules.map((r) => [r.id, { custom: !!overrides[r.id], values: toValues(overrides[r.id] ?? r.global) }])
    ) as Record<string, Row>;
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Record<string, Row>>(initial);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const customCount = Object.keys(overrides).length;

  const update = (id: string, patch: Partial<Row>) => setRows((r) => ({ ...r, [id]: { ...r[id]!, ...patch } }));

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setRows(initial());
          setError(null);
          setFieldErrors({});
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <SlidersHorizontal />
          Limits
          {customCount > 0 && <Badge tone="info">{customCount} custom</Badge>}
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85dvh] max-w-2xl flex-col gap-0 p-0">
        <div className="flex flex-col gap-1.5 border-b p-6">
          <DialogTitle>Limits for {email ?? 'this user'}</DialogTitle>
          <DialogDescription>
            Switch a limit to custom to override the global setting for this user only. Whether a rule is on stays
            global.
          </DialogDescription>
        </div>
        <div className="bg-sunken/40 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-6">
          {rules.map((r) => {
            const row = rows[r.id]!;
            const errs = Object.fromEntries(
              Object.entries(fieldErrors)
                .filter(([k]) => k.startsWith(r.id + ':'))
                .map(([k, v]) => [k.slice(r.id.length + 1), v])
            );
            return (
              <div key={r.id} className={cn('bg-surface flex flex-col gap-4 rounded-lg border p-4', !r.enabled && 'opacity-70')}>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-bold">{r.name}</span>
                    <span className="text-muted-foreground text-xs">
                      Global: {describeParams(r.kind, r.global)}
                      {!r.enabled && ' · rule is off for everyone'}
                    </span>
                  </div>
                  <label className="text-muted-foreground flex items-center gap-2 text-xs font-semibold">
                    Custom
                    <Switch
                      checked={row.custom}
                      onCheckedChange={(c) => update(r.id, { custom: c, values: c ? row.values : toValues(r.global) })}
                      aria-label={`Custom ${r.name} for this user`}
                    />
                  </label>
                </div>
                {row.custom && (
                  <RuleFields
                    fields={RULE_FIELDS[r.kind] ?? []}
                    values={row.values}
                    errors={errs}
                    onChange={(name, value) => update(r.id, { values: { ...row.values, [name]: value } })}
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="flex flex-col gap-3 border-t p-6">
          {error && <ErrorBanner>{error}</ErrorBanner>}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await saveUserLimitsAction(
                    userId,
                    rules.map((rule) => ({
                      ruleId: rule.id,
                      params: rows[rule.id]!.custom ? toParams(RULE_FIELDS[rule.kind] ?? [], rows[rule.id]!.values) : null,
                    }))
                  );
                  setError(r.error ?? null);
                  setFieldErrors(r.fieldErrors ?? {});
                  if (!r.error) {
                    toast.success(`Limits saved for ${email ?? 'user'}`);
                    setOpen(false);
                  }
                })
              }
            >
              {pending ? 'Saving…' : 'Save Limits'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
