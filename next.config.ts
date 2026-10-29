import type { NextConfig } from 'next';
import { UPLOAD_HARD_LIMIT_MB } from './src/lib/limits';

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  serverExternalPackages: ['undici'],
  experimental: {
    // Room for multipart overhead on top of the largest accepted upload.
    serverActions: { bodySizeLimit: `${UPLOAD_HARD_LIMIT_MB + 1}mb` },
  },
};

export default nextConfig;
