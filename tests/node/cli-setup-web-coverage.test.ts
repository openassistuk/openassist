import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { createDefaultConfigObject, toProviderApiKeyEnvVar, toWebBraveApiKeyEnvVar } from "../../apps/openassist-cli/src/lib/config-edit.js";
import { buildSetupSummary } from "../../apps/openassist-cli/src/lib/setup-summary.js";
import { validateSetupReadiness } from "../../apps/openassist-cli/src/lib/setup-validation.js";
import type { PromptAdapter } from "../../apps/openassist-cli/src/lib/setup-wizard.js";
import { loadSetupQuickstartState, runSetupQuickstart } from "../../apps/openassist-cli/src/lib/setup-quickstart.js";
import { loadSetupWizardState, runSetupWizard } from "../../apps/openassist-cli/src/lib/setup-wizard.js";

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("failed to allocate free port")));
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

class ScriptedPromptAdapter implements PromptAdapter {
  private readonly queue: string[];

  constructor(answers: string[]) {
    this.queue = [...answers];
  }

  private next(): string {
    if (this.queue.length === 0) {
      throw new Error("No scripted answer available");
    }
    return this.queue.shift() ?? "";
  }

  async input(): Promise<string> {
    return this.next();
  }

  async password(): Promise<string> {
    return this.next();
  }

  async confirm(): Promise<boolean> {
    return this.next() === "true";
  }

  async select<T extends string>(): Promise<T> {
    return this.next() as T;
  }
}

function setTty(value: boolean): () => void {
  const stdinDescriptor = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
  const stdoutDescriptor = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
  Object.defineProperty(process.stdin, "isTTY", {
    configurable: true,
    value
  });
  Object.defineProperty(process.stdout, "isTTY", {
    configurable: true,
    value
  });
  return () => {
    if (stdinDescriptor) {
      Object.defineProperty(process.stdin, "isTTY", stdinDescriptor);
    } else {
      delete (process.stdin as Record<string, unknown>).isTTY;
    }
    if (stdoutDescriptor) {
      Object.defineProperty(process.stdout, "isTTY", stdoutDescriptor);
    } else {
      delete (process.stdout as Record<string, unknown>).isTTY;
    }
  };
}

describe("cli native web setup coverage", () => {
  it("validates native web search mode requirements and summary rendering", async () => {
    const root = tempDir("openassist-node-web-validation-");
    const config = createDefaultConfigObject();
    config.runtime.bindPort = await getFreePort();
    config.tools.web.enabled = true;
    config.tools.web.searchMode = "api-only";
    const providerVar = toProviderApiKeyEnvVar(config.runtime.defaultProviderId);
    const braveVar = toWebBraveApiKeyEnvVar();

    const missingKey = await validateSetupReadiness({
      config,
      env: {
        [providerVar]: "provider-key"
      },
      configPath: path.join(root, "openassist.toml"),
      envFilePath: path.join(root, "openassistd.env"),
      installDir: root,
      skipService: true,
      timezoneConfirmed: true
    });
    assert.equal(missingKey.errors.some((issue) => issue.code === "tools.web_brave_api_key_missing"), true);

    config.tools.web.searchMode = "hybrid";
    const hybrid = await validateSetupReadiness({
      config,
      env: {
        [providerVar]: "provider-key"
      },
      configPath: path.join(root, "openassist.toml"),
      envFilePath: path.join(root, "openassistd.env"),
      installDir: root,
      skipService: true,
      timezoneConfirmed: true
    });
    assert.equal(hybrid.warnings.some((issue) => issue.code === "tools.web_hybrid_fallback_only"), true);

    const summary = buildSetupSummary({
      configPath: path.join(root, "openassist.toml"),
      envFilePath: path.join(root, "openassistd.env"),
      config,
      changedEnvKeys: [braveVar],
      warningCount: hybrid.warnings.length,
      skippedService: true,
      healthOk: false
    });
    assert.equal(summary.some((line) => line.includes("Native web tools: hybrid mode")), true);
    assert.equal(summary.some((line) => line.includes(braveVar)), true);

    config.tools.web.enabled = false;
    const disabledSummary = buildSetupSummary({
      configPath: path.join(root, "openassist.toml"),
      envFilePath: path.join(root, "openassistd.env"),
      config,
      changedEnvKeys: [],
      warningCount: 0,
      skippedService: true,
      healthOk: false
    });
    assert.equal(disabledSummary.some((line) => line.includes("Native web tools: disabled")), true);
  });

  it("captures Brave API credentials during interactive quickstart", async () => {
    const root = tempDir("openassist-node-web-quickstart-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const installDir = root;
    const bindPort = await getFreePort();
    const state = loadSetupQuickstartState(configPath, envPath, installDir);
    const restoreTty = setTty(true);
    try {
      const prompts = new ScriptedPromptAdapter([
        "127.0.0.1",
        String(bindPort),
        "operator",
        ".openassist/data",
        ".openassist/skills",
        ".openassist/logs",
        "OpenAssist",
        "Grounded local operator",
        "Keep replies terse",
        "true",
        "openai",
        "openai-main",
        "gpt-5.2",
        "",
        "api-key-only",
        "openai-key",
        "false",
        "openai-main",
        "false",
        "Europe/London",
        "warn-degrade",
        "300",
        "10000",
        "true",
        "Europe/London",
        "true",
        "1000",
        "30",
        "catch-up-once",
        "false",
        "true",
        "api-only",
        "true",
        "brave-secret"
      ]);

      const result = await runSetupQuickstart(
        state,
        {
          configPath,
          envFilePath: envPath,
          installDir,
          allowIncomplete: false,
          skipService: true,
          requireTty: true,
          preflightCommandChecks: false
        },
        prompts
      );

      const braveVar = toWebBraveApiKeyEnvVar();
      assert.equal(result.saved, true);
      assert.equal(state.config.tools.web.enabled, true);
      assert.equal(state.config.tools.web.searchMode, "api-only");
      assert.equal(state.env[braveVar], "brave-secret");
      assert.equal(result.summary.some((line) => line.includes("Native web tools: api-only mode")), true);
      assert.equal(fs.readFileSync(envPath, "utf8").includes(`${braveVar}=brave-secret`), true);
    } finally {
      restoreTty();
    }
  });

  it("edits native web tool limits and Brave key in setup wizard", async () => {
    const root = tempDir("openassist-node-web-wizard-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const state = loadSetupWizardState(configPath, envPath);
    const braveVar = toWebBraveApiKeyEnvVar();
    const prompts = new ScriptedPromptAdapter([
      "tools",
      "false",
      "45000",
      "true",
      "true",
      "api-only",
      "22000",
      "4",
      "900000",
      "6",
      "3",
      "true",
      "wizard-brave-key",
      "save"
    ]);

    const result = await runSetupWizard(state, prompts, {
      requireTty: false
    });

    assert.equal(result.saved, true);
    assert.equal(state.config.tools.fs.workspaceOnly, false);
    assert.equal(state.config.tools.exec.defaultTimeoutMs, 45000);
    assert.equal(state.config.tools.web.enabled, true);
    assert.equal(state.config.tools.web.searchMode, "api-only");
    assert.equal(state.config.tools.web.requestTimeoutMs, 22000);
    assert.equal(state.config.tools.web.maxRedirects, 4);
    assert.equal(state.config.tools.web.maxFetchBytes, 900000);
    assert.equal(state.config.tools.web.maxSearchResults, 6);
    assert.equal(state.config.tools.web.maxPagesPerRun, 3);
    assert.equal(state.env[braveVar], "wizard-brave-key");
    assert.equal(fs.readFileSync(envPath, "utf8").includes(`${braveVar}=wizard-brave-key`), true);
  });
});
