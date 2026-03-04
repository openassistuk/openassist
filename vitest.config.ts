import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/vitest/**/*.test.ts"],
    environment: "node",
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov", "json-summary"],
      reportsDirectory: "coverage/vitest",
      include: [
        "apps/openassist-cli/src/lib/**/*.ts",
        "apps/openassistd/src/channel-settings.ts",
        "packages/core-runtime/src/{context,clock-health,scheduler}.ts"
      ],
      exclude: [
        "**/*.d.ts",
        "**/dist/**",
        "**/node_modules/**",
        "tests/**"
      ],
      thresholds: {
        lines: 81,
        functions: 80,
        branches: 71,
        statements: 81
      }
    }
  }
});
