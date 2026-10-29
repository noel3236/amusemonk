import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', 'out/**', 'next-env.d.ts']),
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['radix-ui', '@radix-ui/*', 'lucide-react', 'next-themes', 'sonner', 'input-otp'],
              message: 'Import UI from the @/ui barrel.',
            },
            {
              group: ['@/ui/*'],
              message: 'Import from the @/ui barrel, not internal paths.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**'],
    ignores: ['src/lib/egress.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'Outbound calls must use outboundFetch (src/lib/egress.ts) so they go through the VPN.' },
      ],
    },
  },
  { files: ['src/ui/**'], rules: { 'no-restricted-imports': 'off' } },
]);
