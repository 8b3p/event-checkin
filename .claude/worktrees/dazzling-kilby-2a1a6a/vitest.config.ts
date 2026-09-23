import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**", "**/.claude/worktrees/**"],
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": dirname,
    },
  },
});
