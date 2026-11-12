import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  outputFileTracingRoot: process.cwd(),
  serverExternalPackages: ['pdfjs-dist', 'sharp'],
  outputFileTracingIncludes: {
    '/api/private-clinical-{operations,drafts}{,/**}': [
      './scripts/lib/clinical-file-validation-worker.mjs',
      './node_modules/pdfjs-dist/legacy/build/*.mjs',
      './node_modules/pdfjs-dist/package.json',
      './node_modules/sharp/**/*',
      './node_modules/@img/sharp-*/**/*',
      './node_modules/@napi-rs/canvas*/**/*',
    ],
  },
};

export default nextConfig;
