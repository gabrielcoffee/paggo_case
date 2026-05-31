import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // Integration tests talk to the remote Supabase pooler — allow headroom.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
