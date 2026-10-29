'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { isSuperAdmin } from '@/auth/roles';
import { isOverridableKind, RULE_PARAMS } from '@/features/rules/catalog';
import { listRules, RuleConfigError, setUserOverride } from '@/features/rules/server';

export type LimitsResult = { error?: string; fieldErrors?: Record<string, string> };

export async function saveUserLimitsAction(
  userId: string,
  entries: { ruleId: string; params: Record<string, unknown> | null }[]
): Promise<LimitsResult> {
  const session = await auth();
  if (!session?.user || !isSuperAdmin(session.user.role)) return { error: 'Only a super admin can set user limits.' };

  // Validate everything first, so a bad field never leaves half the limits saved.
  const rules = new Map((await listRules()).map((r) => [r.id, r]));
  const fieldErrors: Record<string, string> = {};
  for (const e of entries) {
    const rule = rules.get(e.ruleId);
    if (!rule || !isOverridableKind(rule.kind)) return { error: 'One of these rules can’t be set per user.' };
    if (e.params === null) continue;
    const parsed = RULE_PARAMS[rule.kind].safeParse(e.params);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) fieldErrors[`${e.ruleId}:${String(issue.path[0] ?? '_')}`] ??= issue.message;
    }
  }
  if (Object.keys(fieldErrors).length) return { error: 'Check the highlighted limits.', fieldErrors };

  try {
    for (const e of entries) await setUserOverride(userId, e.ruleId, e.params, session.user.id);
  } catch (err) {
    if (err instanceof RuleConfigError) return { error: err.message };
    throw err;
  }
  revalidatePath('/admin/users');
  return {};
}
