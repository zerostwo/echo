import type { NextConfig } from "next";
import echoConfig from "./echo.config.json";

const devPort = echoConfig.server.ports.dev;
const prodPort = echoConfig.server.ports.prod;

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '500mb',
      allowedOrigins: [
        "echo.catplot.org", 
        `localhost:${devPort}`, 
        `localhost:${prodPort}`,
        // Add local IP access for development
        `192.168.1.74:${devPort}`
      ],
    },
    proxyClientMaxBodySize: '500mb',
  },
};

export default nextConfig;
