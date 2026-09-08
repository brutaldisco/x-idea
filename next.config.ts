import type { NextConfig } from "next";

const nextConfig = {
  reactCompiler: true,
  cacheComponents: true,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  serverExternalPackages: ["@libsql/client"],
  outputFileTracingIncludes: {
    "/*": ["./drizzle/**/*"],
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
} as NextConfig;

export default nextConfig;
