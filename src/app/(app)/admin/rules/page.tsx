import type { Metadata } from 'next';
import type { UploadRule } from '@/db';
import { CUSTOM_KIND_LABELS, describeParams, isCustomKind, isRuleKind, RULE_FIELDS } from '@/features/rules/catalog';
import {
  AddCustomRuleButton,
  DeleteRuleButton,
  EditRuleButton,
  RuleSwitch,
} from '@/features/rules/rule-controls';
import { listRules } from '@/features/rules/server';
import { Badge, Card, EmptyState, Lock, SlidersHorizontal } from '@/ui';

export const metadata: Metadata = { title: 'Upload rules' };

function RuleRow({ rule }: { rule: UploadRule }) {
  const kind = isRuleKind(rule.kind) ? rule.kind : null;
  const summary = describeParams(rule.kind, rule.params_json);
  const message = typeof rule.params_json.message === 'string' ? rule.params_json.message : '';
  const subtitle = isCustomKind(rule.kind)
    ? `${CUSTOM_KIND_LABELS[rule.kind].name}${message ? ` · shows “${message}”` : ''}`
    : rule.description;
  return (
    <li className="flex flex-col gap-2 px-4 py-2.5 md:grid md:grid-cols-[minmax(0,1fr)_14rem_12rem] md:items-center md:gap-6">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-bold">{rule.name}</span>
        <span className="text-muted-foreground text-xs">{subtitle}</span>
      </div>
      <span className="tabular text-sm font-semibold">{rule.locked ? null : summary}</span>
      <div className="flex items-center gap-2 md:justify-end">
        {rule.locked ? (
          <Badge tone="info">
            <Lock className="size-3" />
            Always on
          </Badge>
        ) : (
          <>
            {kind && RULE_FIELDS[kind] && (
              <EditRuleButton id={rule.id} kind={kind} name={rule.name} params={rule.params_json} />
            )}
            {isCustomKind(rule.kind) && <DeleteRuleButton id={rule.id} name={rule.name} />}
            <RuleSwitch id={rule.id} enabled={rule.enabled} name={rule.name} />
          </>
        )}
      </div>
    </li>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex min-h-8 items-center justify-between gap-4">
        <h2 className="text-muted-foreground text-[11px] font-bold tracking-[0.12em] uppercase">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export default async function RulesPage() {
  const rules = await listRules();
  const locked = rules.filter((r) => r.locked);
  const builtin = rules.filter((r) => !r.locked && !isCustomKind(r.kind));
  const custom = rules.filter((r) => isCustomKind(r.kind));

  return (
    <div className="flex flex-col gap-5">
      <h1 className="sr-only">Upload rules</h1>

      <Section title="Always on · can’t be switched off">
        <Card>
          <ul className="divide-y">{locked.map((r) => <RuleRow key={r.id} rule={r} />)}</ul>
        </Card>
      </Section>

      <Section title="Configurable">
        <Card>
          <ul className="divide-y">{builtin.map((r) => <RuleRow key={r.id} rule={r} />)}</ul>
        </Card>
      </Section>

      <Section
        title="Custom rules"
        action={custom.length > 0 && <AddCustomRuleButton />}
      >
        {custom.length === 0 ? (
          <EmptyState
            icon={<SlidersHorizontal />}
            title="No custom rules"
            description="Add one to pause payouts to a bank, block an account, or require a reference format."
            action={<AddCustomRuleButton />}
          />
        ) : (
          <Card>
            <ul className="divide-y">{custom.map((r) => <RuleRow key={r.id} rule={r} />)}</ul>
          </Card>
        )}
      </Section>
    </div>
  );
}
