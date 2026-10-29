'use server';

import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { auth } from '@/auth';
import { isSuperAdmin } from '@/auth/roles';
import {
  createCustomRule,
  deleteCustomRule,
  RuleConfigError,
  setRuleEnabled,
  updateRuleParams,
} from './server';

export type RuleActionResult = { error?: string; fieldErrors?: Record<string, string> };

async function asAdmin(fn: (userId: string) => Promise<unknown>): Promise<RuleActionResult> {
  const session = await auth();
  if (!session?.user || !isSuperAdmin(session.user.role)) return { error: 'Only a super admin can change upload rules.' };
  try {
    await fn(session.user.id);
  } catch (e) {
    if (e instanceof RuleConfigError) return { error: e.message };
    if (e instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of e.issues) fieldErrors[String(issue.path[0] ?? '_')] ??= issue.message;
      return { error: 'Check the highlighted settings.', fieldErrors };
    }
    throw e;
  }
  revalidatePath('/admin/rules');
  return {};
}

export async function toggleRuleAction(id: string, enabled: boolean) {
  return asAdmin((userId) => setRuleEnabled(id, enabled, userId));
}

export async function saveRuleAction(id: string, params: Record<string, unknown>, name?: string) {
  return asAdmin((userId) => updateRuleParams(id, params, userId, name));
}

export async function createRuleAction(kind: string, name: string, params: Record<string, unknown>) {
  if (!name.trim()) return { error: 'Give the rule a name.', fieldErrors: { name: 'Required' } };
  return asAdmin((userId) => createCustomRule({ kind, name: name.trim().slice(0, 120), params }, userId));
}

export async function deleteRuleAction(id: string) {
  return asAdmin((userId) => deleteCustomRule(id, userId));
}
