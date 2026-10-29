import type { Metadata } from 'next';
import { isOverridableKind } from '@/features/rules/catalog';
import { listRules } from '@/features/rules/server';
import { USERS_SPEC } from '@/features/files/specs';
import { allActiveOverrides, listUsersForAdmin } from '@/features/users/admin';
import type { LimitRule } from '@/features/users/limits-button';
import { UsersTable } from '@/features/users/users-table';
import { parseListQuery } from '@/lib/list-params';
import { EmptyState, ListFilters, UserRound } from '@/ui';

export const metadata: Metadata = { title: 'Users' };

type SP = Record<string, string | string[] | undefined>;

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const q = parseListQuery(await searchParams, USERS_SPEC);
  const [users, rules, overrides] = await Promise.all([listUsersForAdmin(q), listRules(), allActiveOverrides()]);
  const limitRules: LimitRule[] = rules
    .filter((r) => isOverridableKind(r.kind))
    .map((r) => ({ id: r.id, kind: r.kind as LimitRule['kind'], name: r.name, enabled: r.enabled, global: r.params_json }));
  const byUser: Record<string, Record<string, Record<string, unknown>>> = {};
  for (const o of overrides) (byUser[o.user_id] ??= {})[o.rule_id] = o.params_json;

  return (
    <div className="flex flex-col gap-3">
      <h1 className="sr-only">Users</h1>
      <ListFilters spec={USERS_SPEC} counts={users.counts} />
      <UsersTable
        rows={users.rows}
        limitRules={limitRules}
        overrides={byUser}
        empty={<EmptyState icon={<UserRound />} title={users.counts[''] ? 'No users match' : 'No users yet'} description="Users appear here after their first sign-in." />}
      />
    </div>
  );
}
