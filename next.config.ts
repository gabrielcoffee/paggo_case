import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

// Pin the workspace root to this project — a stray lockfile in the home dir
// otherwise confuses Turbopack's root inference.
const root = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: { root },
  // Keep Prisma's wasm query compiler + the pg driver external so they load
  // from node_modules at runtime (don't get mangled by the bundler).
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
};

export default nextConfig;
