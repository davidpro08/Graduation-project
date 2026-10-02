import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

// 호스트 개발과 백엔드가 루트 .env의 공개 Supabase 설정을 함께 사용한다.
const rootEnv = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;

const nextConfig: NextConfig = {
  output: 'standalone',
  agentRules: false,
  outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey?.startsWith('sb_publishable_') ? publishableKey : '',
  },
  async rewrites() {
    const target = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3000';
    return [{ source: '/api/:path*', destination: `${target}/api/:path*` }];
  },
  webpack(config, { dev }) {
    if (dev && process.env.WATCH_POLLING === 'true') config.watchOptions = { ...config.watchOptions, poll: 1000, aggregateTimeout: 300 };
    return config;
  },
};
export default nextConfig;
