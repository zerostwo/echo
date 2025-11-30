import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '500mb',
      allowedOrigins: ["echo.catplot.org"],
    },
    middlewareClientMaxBodySize: '500mb',
  },
};

export default nextConfig;
