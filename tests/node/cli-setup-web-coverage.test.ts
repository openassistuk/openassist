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

function minimalQuickstartAnswers(bindPort: number): string[] {
  return [
    "false",
    "127.0.0.1",
    String(bindPort),
    "openai",
    "openai-main",
    "gpt-5.2",
    "",
    "openai-key",
    "telegram",
    "telegram-main",
    "telegram-token",
    "123,456",
    "Europe",
    "Europe/London",
    "true"
  ];
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
      timezoneConfirmed: true,
      requireEnabledChannel: false
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
      timezoneConfirmed: true,
      requireEnabledChannel: false
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
    assert.equal(summary.some((line) => line.includes(`Env keys updated: ${braveVar}`)), true);
    assert.equal(summary.some((line) => line.includes("Secret refs in config:")), true);
    assert.equal(summary.some((line) => line.includes("Validation warnings:")), true);

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
    assert.equal(disabledSummary.some((line) => line.includes("First reply checklist:")), true);
  });

  it("keeps advanced native web settings for wizard instead of quickstart prompts", async () => {
    const root = tempDir("openassist-node-web-quickstart-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const installDir = root;
    const bindPort = await getFreePort();
    const state = loadSetupQuickstartState(configPath, envPath, installDir);
    const braveVar = toWebBraveApiKeyEnvVar();

    state.config.tools.web.enabled = true;
    state.config.tools.web.searchMode = "hybrid";
    state.env[braveVar] = "brave-secret";

    const result = await runSetupQuickstart(
      state,
      {
        configPath,
        envFilePath: envPath,
        installDir,
        allowIncomplete: false,
        skipService: true,
        requireTty: false,
        preflightCommandChecks: false
      },
      new ScriptedPromptAdapter(minimalQuickstartAnswers(bindPort))
    );

    assert.equal(result.saved, true);
    assert.equal(result.validationWarnings, 0);
    assert.equal(state.config.tools.web.enabled, true);
    assert.equal(state.config.tools.web.searchMode, "hybrid");
    assert.equal(state.env[braveVar], "brave-secret");
    assert.equal(result.summary.some((line) => line.includes(braveVar)), true);
    assert.equal(fs.readFileSync(envPath, "utf8").includes(`${braveVar}=brave-secret`), true);
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
