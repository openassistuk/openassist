import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type {
  ChannelAdapter,
  ChannelCapabilities,
  HealthStatus,
  InboundEnvelope,
  OutboundEnvelope,
  ProviderAdapter,
  ProviderCapabilities,
  RuntimeConfig,
  ValidationResult
} from "@openassist/core-types";
import { OpenAssistRuntime } from "../../packages/core-runtime/src/runtime.js";
import { OpenAssistDatabase } from "../../packages/storage-sqlite/src/index.js";
import { createLogger } from "../../packages/observability/src/index.js";

class MockProvider implements ProviderAdapter {
  id(): string {
    return "mock-provider";
  }

  capabilities(): ProviderCapabilities {
    return {
      supportsStreaming: false,
      supportsTools: false,
      supportsOAuth: false,
      supportsApiKeys: true,
      supportsImageInputs: false
    };
  }

  async validateConfig(): Promise<ValidationResult> {
    return { valid: true, errors: [] };
  }

  async chat(): Promise<any> {
    return {
      output: { role: "assistant", content: "manual run ok" },
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
    };
  }
}

class MockChannel implements ChannelAdapter {
  id(): string {
    return "telegram-mock";
  }
  capabilities(): ChannelCapabilities {
    return {
      supportsEdits: false,
      supportsDeletes: false,
      supportsReadReceipts: false,
      supportsFormattedText: true,
      supportsImageAttachments: true,
      supportsDocumentAttachments: true,
      supportsOutboundImageAttachments: true,
      supportsOutboundDocumentAttachments: true,
      supportsDirectRecipientDelivery: true
    };
  }
  async validateConfig(): Promise<ValidationResult> {
    return { valid: true, errors: [] };
  }
  async start(_handler: (msg: InboundEnvelope) => Promise<void>): Promise<void> {}
  async stop(): Promise<void> {}
  async send(_msg: OutboundEnvelope): Promise<{ transportMessageId: string }> {
    return { transportMessageId: "sent-1" };
  }
  async health(): Promise<HealthStatus> {
    return "healthy";
  }
}

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 5000,
  sleepMs = 50
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, sleepMs));
  }
  throw new Error("waitFor timeout");
}

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("manual scheduler run", () => {
  it("enqueues and executes a task run on demand", async () => {
    const root = tempDir("openassist-manual-run-");
    roots.push(root);

    const config: RuntimeConfig = {
      bindAddress: "127.0.0.1",
      bindPort: 3344,
      defaultProviderId: "mock-provider",
      providers: [
        {
          id: "mock-provider",
          type: "openai-compatible",
          defaultModel: "x"
        }
      ],
      channels: [
        {
          id: "telegram-mock",
          type: "telegram",
          enabled: true,
          settings: {}
        }
      ],
      defaultPolicyProfile: "operator",
      paths: {
        dataDir: root,
        skillsDir: path.join(root, "skills"),
        logsDir: path.join(root, "logs")
      },
      time: {
        ntpPolicy: "off",
        ntpCheckIntervalSec: 300,
        ntpMaxSkewMs: 10_000,
        ntpHttpSources: [],
        requireTimezoneConfirmation: false
      },
      scheduler: {
        enabled: true,
        tickIntervalMs: 1000,
        heartbeatIntervalSec: 30,
        defaultMisfirePolicy: "catch-up-once",
        tasks: [
          {
            id: "manual-task",
            enabled: true,
            scheduleKind: "interval",
            intervalSec: 3600,
            action: {
              type: "prompt",
              promptTemplate: "manual trigger"
            }
          }
        ]
      }
    };

    const logger = createLogger({ service: "test" });
    const db = new OpenAssistDatabase({
      dbPath: path.join(root, "openassist.db"),
      logger
    });

    const runtime = new OpenAssistRuntime(
      config,
      { db, logger },
      { providers: [new MockProvider()], channels: [new MockChannel()] }
    );
    runtime.setProviderApiKey("mock-provider", "test-key");
    await runtime.start();

    assert.equal(runtime.enqueueScheduledTaskNow("manual-task"), true);
    await waitFor(() => db.getLatestScheduledRuns(5, "manual-task").length > 0, 7000);

    const run = db.getLatestScheduledRuns(1, "manual-task")[0];
    assert.equal(run?.status, "succeeded");

    await runtime.stop();
    db.close();
  });
});
