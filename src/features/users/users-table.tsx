'use client';

import { RevokeKeyButton } from '@/features/api-keys/revoke-button';
import { Badge, Copyable, DataTable, type Column, Time } from '@/ui';
import { UserLimitsButton, type LimitRule } from './limits-button';

type UserRow = {
  id: string;
  email: string | null;
  gatekeeper_uid: string;
  last_login_at: Date | null;
  key_id: string | null;
  kid: string | null;
  key_created_at: Date | null;
  files: number;
};

export function UsersTable({
  rows,
  limitRules,
  overrides,
  empty,
}: {
  rows: UserRow[];
  limitRules: LimitRule[];
  overrides: Record<string, Record<string, Record<string, unknown>>>;
  empty: React.ReactNode;
}) {
  const columns: Column<UserRow>[] = [
    {
      key: 'user',
      header: 'User',
      render: (u) => (
        <>
          <div className="font-semibold">{u.email ? <Copyable value={u.email} label="email" mono={false} /> : '—'}</div>
          <Copyable value={u.gatekeeper_uid} label="gatekeeper UID" className="text-muted-foreground" />
        </>
      ),
    },
    {
      key: 'key',
      header: 'API key',
      render: (u) =>
        u.kid ? (
          <>
            <Copyable value={u.kid} label="API key ID" />
            <div className="text-muted-foreground text-xs">Connected <Time at={u.key_created_at} inline /></div>
          </>
        ) : (
          <Badge>Not connected</Badge>
        ),
    },
    { key: 'files', header: 'Files', align: 'right', className: 'tabular', render: (u) => u.files },
    { key: 'login', header: 'Last sign-in', className: 'tabular', render: (u) => <Time at={u.last_login_at} inline /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (u) => (
        <div className="flex items-center justify-end gap-2">
          <UserLimitsButton userId={u.id} email={u.email} rules={limitRules} overrides={overrides[u.id] ?? {}} />
          {u.key_id && u.kid && <RevokeKeyButton id={u.key_id} kid={u.kid} email={u.email} />}
        </div>
      ),
    },
  ];
  return <DataTable tableId="admin-users" columns={columns} rows={rows} rowKey={(u) => u.id} defaultPinned={['user']} empty={empty} />;
}
