import type { NextConfig } from "next";

const CORE_API_URL = process.env.CORE_API_URL ?? 'http://localhost:4917';

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      {
        source: '/api/core/:path*',
        destination: `${CORE_API_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
