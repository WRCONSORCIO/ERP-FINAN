import type { NextConfig } from 'next';

const cabecalhosDeSeguranca = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'same-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ['@prisma/client', 'bcryptjs', 'exceljs', 'pdfjs-dist', 'pdf-lib'],
  experimental: {
    serverActions: { bodySizeLimit: '25mb' },
  },
  async headers() {
    return [{ source: '/:path*', headers: cabecalhosDeSeguranca }];
  },
};

export default config;
