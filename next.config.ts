import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  webpack: (config) => { config.experiments = { ...config.experiments, asyncWebAssembly: true }; return config; },
  images: { domains: ["firebasestorage.googleapis.com","api.qrserver.com"] },
};
export default nextConfig;
