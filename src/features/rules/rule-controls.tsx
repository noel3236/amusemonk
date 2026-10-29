'use client';

import { useState, useTransition } from 'react';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
  ErrorBanner,
  Field,
  Input,
  NativeSelect,
  Pencil,
  Plus,
  Switch,
  Textarea,
  Trash2,
  cn,
  toast,
} from '@/ui';
import {
  CUSTOM_KIND_LABELS,
  CUSTOM_KINDS,
  RULE_FIELDS,
  type CustomKind,
  type FieldSpec,
  type RuleKind,
} from './catalog';
import { createRuleAction, deleteRuleAction, saveRuleAction, toggleRuleAction, type RuleActionResult } from './actions';

export type Values = Record<string, string>;

export const toValues = (params: Record<string, unknown>): Values =>
  Object.fromEntries(Object.entries(params).map(([k, v]) => [k, Array.isArray(v) ? v.join('\n') : String(v ?? '')]));

export function toParams(fields: FieldSpec[], values: Values): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = values[f.name] ?? '';
    if (f.type === 'list') out[f.name] = v.split('\n').map((s) => s.trim()).filter(Boolean);
    else if (v !== '' || f.type !== 'text') out[f.name] = v;
  }
  return out;
}

export function RuleFields({
  fields,
  values,
  errors,
  onChange,
}: {
  fields: FieldSpec[];
  values: Values;
  errors: Record<string, string>;
  onChange: (name: string, value: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {fields.map((f) => {
        const id = `rule-${f.name}`;
        const wide = f.type === 'list' || f.type === 'text';
        const hint = 'hint' in f ? f.hint : undefined;
        return (
          <Field key={f.name} label={f.label} htmlFor={id} hint={hint} error={errors[f.name]} className={cn(wide && 'col-span-2')}>
            {f.type === 'select' ? (
              <NativeSelect id={id} value={values[f.name] ?? f.options[0]?.value} onChange={(e) => onChange(f.name, e.target.value)}>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            ) : f.type === 'list' ? (
              <Textarea id={id} value={values[f.name] ?? ''} onChange={(e) => onChange(f.name, e.target.value)} aria-invalid={!!errors[f.name]} />
            ) : (
              <div className="relative">
                <Input
                  id={id}
                  inputMode={f.type === 'number' ? 'numeric' : undefined}
                  value={values[f.name] ?? ''}
                  onChange={(e) => onChange(f.name, e.target.value)}
                  aria-invalid={!!errors[f.name]}
                  className={cn('suffix' in f && f.suffix && 'pr-14')}
                />
                {'suffix' in f && f.suffix && (
                  <span className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold">
                    {f.suffix}
                  </span>
                )}
              </div>
            )}
          </Field>
        );
      })}
    </div>
  );
}

export function RuleSwitch({ id, enabled, name }: { id: string; enabled: boolean; name: string }) {
  const [pending, start] = useTransition();
  const [on, setOn] = useState(enabled);
  return (
    <Switch
      checked={on}
      disabled={pending}
      aria-label={`${on ? 'Switch off' : 'Switch on'} ${name}`}
      onCheckedChange={(next) =>
        start(async () => {
          setOn(next);
          const r = await toggleRuleAction(id, next);
          if (r.error) {
            setOn(!next);
            toast.error(r.error);
          } else toast.success(`${name} ${next ? 'on' : 'off'}`);
        })
      }
    />
  );
}

function useRuleForm(initial: Values) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const set = (name: string, value: string) => setValues((v) => ({ ...v, [name]: value }));
  const apply = (r: RuleActionResult) => {
    setError(r.error ?? null);
    setErrors(r.fieldErrors ?? {});
    return !r.error;
  };
  return { values, set, errors, error, apply, reset: () => (setValues(initial), setErrors({}), setError(null)) };
}

export function EditRuleButton({
  id,
  kind,
  name,
  params,
}: {
  id: string;
  kind: RuleKind;
  name: string;
  params: Record<string, unknown>;
}) {
  const fields = RULE_FIELDS[kind] ?? [];
  const custom = (CUSTOM_KINDS as readonly string[]).includes(kind);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [ruleName, setRuleName] = useState(name);
  const form = useRuleForm(toValues(params));

  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), o && form.reset())}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Edit ${name}`}>
          <Pencil />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <div className="flex flex-col gap-1.5">
          <DialogTitle>Edit {name}</DialogTitle>
          <DialogDescription>Applies to uploads from now on. Files already accepted keep the rules they passed.</DialogDescription>
        </div>
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await saveRuleAction(id, toParams(fields, form.values), custom ? ruleName : undefined);
              if (form.apply(r)) {
                toast.success(`${custom ? ruleName : name} saved`);
                setOpen(false);
              }
            });
          }}
        >
          {custom && (
            <Field label="Rule name" htmlFor="rule-name">
              <Input id="rule-name" value={ruleName} onChange={(e) => setRuleName(e.target.value)} />
            </Field>
          )}
          <RuleFields fields={fields} values={form.values} errors={form.errors} onChange={form.set} />
          {form.error && <ErrorBanner>{form.error}</ErrorBanner>}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Save Rule'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const DEFAULTS: Record<CustomKind, Values> = {
  column_pattern: { column: 'ifsc_code', mode: 'must_not_match', pattern: '', message: '' },
  value_list: { column: 'bank_account', mode: 'block', values: '', message: '' },
};

export function AddCustomRuleButton() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<CustomKind>('column_pattern');
  const [name, setName] = useState('');
  const [pending, start] = useTransition();
  const form = useRuleForm(DEFAULTS[kind]);
  const fields = RULE_FIELDS[kind] ?? [];

  const choose = (k: CustomKind) => {
    setKind(k);
    for (const [f, v] of Object.entries(DEFAULTS[k])) form.set(f, v);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), o && (setName(''), choose('column_pattern'), form.reset()))}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Add Custom Rule
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <div className="flex flex-col gap-1.5">
          <DialogTitle>Add a custom upload rule</DialogTitle>
          <DialogDescription>Every row of every new upload is checked against it. A failing row rejects the whole file.</DialogDescription>
        </div>
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await createRuleAction(kind, name, toParams(fields, form.values));
              if (form.apply(r)) {
                toast.success(`${name} added`);
                setOpen(false);
              }
            });
          }}
        >
          <div role="radiogroup" aria-label="Template" className="grid grid-cols-2 gap-3">
            {CUSTOM_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => choose(k)}
                className={cn(
                  'flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors outline-none focus-visible:ring-[3px]',
                  kind === k ? 'border-primary bg-primary/5' : 'hover:bg-hover/50'
                )}
              >
                <span className="text-sm font-bold">{CUSTOM_KIND_LABELS[k].name}</span>
                <span className="text-muted-foreground text-xs">{CUSTOM_KIND_LABELS[k].description}</span>
              </button>
            ))}
          </div>
          <Field label="Rule name" htmlFor="new-rule-name" error={form.errors.name}>
            <Input id="new-rule-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pause SBI payouts" />
          </Field>
          <RuleFields fields={fields} values={form.values} errors={form.errors} onChange={form.set} />
          {form.error && <ErrorBanner>{form.error}</ErrorBanner>}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? 'Adding…' : 'Add Rule'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteRuleButton({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Delete ${name}`}>
          <Trash2 />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <div className="flex flex-col gap-1.5">
          <DialogTitle>Delete {name}?</DialogTitle>
          <DialogDescription>New uploads stop being checked against it. Its history stays in the audit log.</DialogDescription>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button
            variant="danger"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await deleteRuleAction(id);
                if (r.error) toast.error(r.error);
                else {
                  toast.success(`${name} deleted`);
                  setOpen(false);
                }
              })
            }
          >
            {pending ? 'Deleting…' : 'Delete Rule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
