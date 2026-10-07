import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';

const nextConfig: NextConfig = {
  output: 'standalone',
  agentRules: false,
  outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
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
