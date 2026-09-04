import type { NextConfig } from "next";

const nextConfig = {
  reactCompiler: true,
  cacheComponents: true,
  serverExternalPackages: ["@libsql/client"],
  outputFileTracingIncludes: {
    "/*": ["./drizzle/**/*"],
  },
} as NextConfig;

export default nextConfig;
