import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

// Pin the workspace root to this project — a stray lockfile in the home dir
// otherwise confuses Turbopack's root inference.
const root = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: { root },
  // Prisma's query-engine binary lives in the custom client output dir; force
  // Next's output tracing to bundle it into the serverless functions (otherwise
  // prod 500s with "Query engine not found" on the first DB query).
  outputFileTracingIncludes: {
    "/**": ["./src/generated/prisma/**"],
  },
};

export default nextConfig;
