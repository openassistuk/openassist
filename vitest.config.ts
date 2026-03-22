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
        "apps/openassistd/src/install-context.ts",
        "apps/openassistd/src/oauth-redirect.ts",
        "packages/config/src/operator-paths.ts",
        "packages/config/src/schema.ts",
        "packages/core-runtime/src/{attachments,clock-health,context,memory,scheduler,self-knowledge}.ts",
        "packages/providers-anthropic/src/index.ts",
        "packages/providers-codex/src/index.ts",
        "packages/providers-openai/src/index.ts",
        "packages/providers-openai-compatible/src/index.ts",
        "packages/tools-web/src/index.ts"
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
