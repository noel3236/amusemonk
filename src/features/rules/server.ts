import { randomUUID } from 'node:crypto';
import { db, type UploadRule } from '@/db';
import type { RuleChangeAction } from '@/db/schema';
import type { CustomRule, Ruleset } from '@/features/ingest/validate';
import { isCustomKind, isOverridableKind, isRuleKind, LOCKED_KINDS, RULE_PARAMS, type RuleKind } from './catalog';

export class RuleConfigError extends Error {}

export async function listRules(): Promise<UploadRule[]> {
  return db()
    .selectFrom('upload_rules')
    .selectAll()
    .where('deleted_at', 'is', null)
    .orderBy('sort_order')
    .orderBy('created_at')
    .execute();
}

function parseParams(rule: Pick<UploadRule, 'rule_key' | 'kind' | 'params_json'>) {
  if (!isRuleKind(rule.kind)) throw new RuleConfigError(`Rule "${rule.rule_key}" has unknown kind "${rule.kind}"`);
  const parsed = RULE_PARAMS[rule.kind].safeParse(rule.params_json);
  if (!parsed.success) throw new RuleConfigError(`Rule "${rule.rule_key}" has invalid settings`);
  return parsed.data;
}

export async function activeOverrides(userId: string) {
  return db()
    .selectFrom('user_rule_overrides')
    .select(['rule_id', 'params_json', 'updated_at'])
    .where('user_id', '=', userId)
    .where('cleared_at', 'is', null)
    .execute();
}

// Fails closed: a rule whose stored settings don't parse stops every upload until an admin fixes it.
// With a user, that user's limit overrides replace the global settings of the rules they cover.
export async function loadRuleset(userId?: string): Promise<{ ruleset: Ruleset; snapshot: unknown[] }> {
  const overrides = new Map(userId ? (await activeOverrides(userId)).map((o) => [o.rule_id, o.params_json]) : []);
  const rows = (await listRules())
    .filter((r) => r.enabled)
    .map((r) => {
      const o = overrides.get(r.id);
      return o && isOverridableKind(r.kind) ? { ...r, params_json: o, overridden: true } : { ...r, overridden: false };
    });
  const on = new Map(rows.filter((r) => !isCustomKind(r.kind)).map((r) => [r.kind, r]));
  const params = <K extends RuleKind>(k: K) => {
    const r = on.get(k);
    return r ? (parseParams(r) as never) : undefined;
  };
  const custom: CustomRule[] = rows
    .filter((r) => isCustomKind(r.kind))
    .map((r) => ({ key: r.rule_key, name: r.name, kind: r.kind as CustomRule['kind'], params: parseParams(r) as CustomRule['params'] }));

  const ruleset: Ruleset = {
    maxFileSize: params('max_file_size'),
    maxRows: params('max_rows'),
    amountRange: params('amount_range'),
    fileTotalMax: params('file_total_max'),
    dateWindow: params('date_window'),
    maxRowsPerAccount: params('max_rows_per_account'),
    duplicateFilename: on.has('duplicate_filename'),
    duplicateFile: on.has('duplicate_file'),
    duplicateContent: on.has('duplicate_content'),
    balanceCheck: on.has('balance_check'),
    custom,
  };
  const snapshot = rows.map((r) => ({ rule_key: r.rule_key, kind: r.kind, params: r.params_json, user_override: r.overridden }));
  return { ruleset, snapshot };
}

async function audit(
  ruleId: string,
  changedBy: string,
  action: RuleChangeAction,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  targetUserId: string | null = null
) {
  await db()
    .insertInto('upload_rule_changes')
    .values({
      id: randomUUID(),
      rule_id: ruleId,
      changed_by: changedBy,
      target_user_id: targetUserId,
      action,
      before_json: JSON.stringify(before),
      after_json: JSON.stringify(after),
    })
    .execute();
}

const snapshotOf = (r: UploadRule) => ({ enabled: r.enabled, params: r.params_json, name: r.name });

async function getRule(id: string) {
  const rule = await db().selectFrom('upload_rules').selectAll().where('id', '=', id).where('deleted_at', 'is', null).executeTakeFirst();
  if (!rule) throw new RuleConfigError('That rule no longer exists.');
  return rule;
}

export async function setRuleEnabled(id: string, enabled: boolean, userId: string) {
  const rule = await getRule(id);
  if (rule.locked && !enabled) throw new RuleConfigError('This rule protects against paying twice and is always on.');
  if (rule.enabled === enabled) return;
  await db().updateTable('upload_rules').set({ enabled, updated_by: userId }).where('id', '=', id).execute();
  await audit(id, userId, enabled ? 'enabled' : 'disabled', snapshotOf(rule), { ...snapshotOf(rule), enabled });
}

export async function updateRuleParams(id: string, raw: unknown, userId: string, name?: string) {
  const rule = await getRule(id);
  if (!isRuleKind(rule.kind)) throw new RuleConfigError('Unknown rule kind.');
  if ((LOCKED_KINDS as readonly string[]).includes(rule.kind)) throw new RuleConfigError('This rule has no settings.');
  const params = RULE_PARAMS[rule.kind].parse(raw) as Record<string, unknown>;
  const nextName = isCustomKind(rule.kind) && name ? name : rule.name;
  await db()
    .updateTable('upload_rules')
    .set({ params_json: JSON.stringify(params), name: nextName, updated_by: userId })
    .where('id', '=', id)
    .execute();
  await audit(id, userId, 'updated', snapshotOf(rule), { ...snapshotOf(rule), params, name: nextName });
}

export async function createCustomRule(input: { kind: string; name: string; params: unknown }, userId: string) {
  if (!isCustomKind(input.kind)) throw new RuleConfigError('Custom rules must use a template.');
  const params = RULE_PARAMS[input.kind].parse(input.params) as Record<string, unknown>;
  const id = randomUUID();
  await db()
    .insertInto('upload_rules')
    .values({
      id,
      rule_key: `custom_${id.slice(0, 8)}`,
      kind: input.kind,
      name: input.name,
      enabled: true,
      locked: false,
      params_json: JSON.stringify(params),
      sort_order: 1000,
      created_by: userId,
      updated_by: userId,
    })
    .execute();
  await audit(id, userId, 'created', null, { enabled: true, params, name: input.name });
  return id;
}

export async function deleteCustomRule(id: string, userId: string) {
  const rule = await getRule(id);
  if (!isCustomKind(rule.kind)) throw new RuleConfigError('Built-in rules can be switched off, not deleted.');
  await db().updateTable('upload_rules').set({ deleted_at: new Date(), updated_by: userId }).where('id', '=', id).execute();
  await audit(id, userId, 'deleted', snapshotOf(rule), null);
}

// `params: null` clears the user's override so the global setting applies again.
export async function setUserOverride(userId: string, ruleId: string, raw: unknown | null, adminId: string) {
  const rule = await getRule(ruleId);
  if (!isOverridableKind(rule.kind)) throw new RuleConfigError(`${rule.name} can't be set per user.`);
  const current = await db()
    .selectFrom('user_rule_overrides')
    .select(['params_json', 'cleared_at'])
    .where('user_id', '=', userId)
    .where('rule_id', '=', ruleId)
    .executeTakeFirst();
  const before = current && !current.cleared_at ? current.params_json : null;

  if (raw === null) {
    if (!before) return;
    await db()
      .updateTable('user_rule_overrides')
      .set({ cleared_at: new Date(), updated_by: adminId })
      .where('user_id', '=', userId)
      .where('rule_id', '=', ruleId)
      .execute();
    await audit(ruleId, adminId, 'override_cleared', { params: before }, null, userId);
    return;
  }

  const params = RULE_PARAMS[rule.kind].parse(raw) as Record<string, unknown>;
  if (before && JSON.stringify(before) === JSON.stringify(params)) return;
  await db()
    .insertInto('user_rule_overrides')
    .values({
      id: randomUUID(),
      user_id: userId,
      rule_id: ruleId,
      params_json: JSON.stringify(params),
      created_by: adminId,
      updated_by: adminId,
    })
    .onDuplicateKeyUpdate({ params_json: JSON.stringify(params), cleared_at: null, updated_by: adminId })
    .execute();
  await audit(ruleId, adminId, 'override_set', before ? { params: before } : null, { params }, userId);
}
