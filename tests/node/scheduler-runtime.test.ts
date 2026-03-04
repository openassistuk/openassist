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
      supportsApiKeys: true
    };
  }

  async validateConfig(): Promise<ValidationResult> {
    return { valid: true, errors: [] };
  }

  async chat(): Promise<any> {
    return {
      output: { role: "assistant", content: "scheduled result" },
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
    };
  }
}

class MockChannel implements ChannelAdapter {
  public sent: OutboundEnvelope[] = [];
  private handler: ((msg: InboundEnvelope) => Promise<void>) | null = null;

  id(): string {
    return "telegram-mock";
  }

  capabilities(): ChannelCapabilities {
    return { supportsEdits: false, supportsDeletes: false, supportsReadReceipts: false };
  }

  async validateConfig(): Promise<ValidationResult> {
    return { valid: true, errors: [] };
  }

  async start(handler: (msg: InboundEnvelope) => Promise<void>): Promise<void> {
    this.handler = handler;
  }

  async stop(): Promise<void> {
    this.handler = null;
  }

  async send(msg: OutboundEnvelope): Promise<{ transportMessageId: string }> {
    this.sent.push(msg);
    return { transportMessageId: `sent-${this.sent.length}` };
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

function buildConfig(root: string): RuntimeConfig {
  return {
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
      requireTimezoneConfirmation: true
    },
    scheduler: {
      enabled: true,
      tickIntervalMs: 100,
      heartbeatIntervalSec: 1,
      defaultMisfirePolicy: "catch-up-once",
      tasks: [
        {
          id: "skill-task",
          enabled: true,
          scheduleKind: "interval",
          intervalSec: 1,
          action: {
            type: "skill",
            skillId: "scheduler-demo",
            entrypoint: "scripts/run.mjs",
            input: {
              message: "hello"
            }
          }
        },
        {
          id: "prompt-task",
          enabled: true,
          scheduleKind: "interval",
          intervalSec: 1,
          action: {
            type: "prompt",
            promptTemplate: "say hi"
          }
        }
      ]
    }
  };
}

function writeSkillSource(root: string): string {
  const source = path.join(root, "skill-source");
  fs.mkdirSync(path.join(source, "scripts"), { recursive: true });
  fs.writeFileSync(
    path.join(source, "openassist.skill.json"),
    JSON.stringify(
      {
        id: "scheduler-demo",
        version: "1.0.0",
        description: "scheduler test skill",
        triggers: ["schedule"],
        requiredCapabilities: ["provider.api"],
        resources: {
          promptFiles: [],
          referenceFiles: [],
          scriptEntrypoints: ["scripts/run.mjs"]
        }
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(source, "scripts", "run.mjs"),
    "export async function run(input){ return { ok: true, input }; }\n"
  );
  return source;
}

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("scheduler runtime", () => {
  it("blocks scheduler until timezone is confirmed, then runs tasks", async () => {
    const root = tempDir("openassist-scheduler-runtime-");
    roots.push(root);

    const logger = createLogger({ service: "test" });
    const db = new OpenAssistDatabase({
      dbPath: path.join(root, "openassist.db"),
      logger
    });
    const runtime = new OpenAssistRuntime(
      buildConfig(root),
      { db, logger },
      { providers: [new MockProvider()], channels: [new MockChannel()] }
    );

    runtime.setProviderApiKey("mock-provider", "test-key");
    await runtime.getSkillRuntime().installFromPath(writeSkillSource(root));
    await runtime.start();

    const blockedStatus = runtime.getSchedulerStatus();
    assert.equal(blockedStatus.blockedReason, "timezone confirmation required");

    const confirmed = runtime.confirmTimezone("UTC");
    assert.equal(confirmed.confirmed, true);

    await waitFor(() => db.getLatestScheduledRuns(20, "skill-task").length > 0, 7000);
    await waitFor(() => db.getLatestScheduledRuns(20, "prompt-task").length > 0, 7000);

    const skillRun = db.getLatestScheduledRuns(1, "skill-task")[0];
    const promptRun = db.getLatestScheduledRuns(1, "prompt-task")[0];
    assert.equal(skillRun?.status, "succeeded");
    assert.equal(promptRun?.status, "succeeded");

    await runtime.stop();
    db.close();
  });

  it("does not duplicate the same scheduled window after restart", async () => {
    const root = tempDir("openassist-scheduler-restart-");
    roots.push(root);
    const dbPath = path.join(root, "openassist.db");
    const logger = createLogger({ service: "test" });
    const config = buildConfig(root);
    config.time.requireTimezoneConfirmation = false;
    config.scheduler.tasks = [
      {
        id: "prompt-task",
        enabled: true,
        scheduleKind: "interval",
        intervalSec: 1,
        action: {
          type: "prompt",
          promptTemplate: "scheduled prompt"
        }
      }
    ];

    const db1 = new OpenAssistDatabase({ dbPath, logger });
    const runtime1 = new OpenAssistRuntime(
      config,
      { db: db1, logger },
      { providers: [new MockProvider()], channels: [new MockChannel()] }
    );
    runtime1.setProviderApiKey("mock-provider", "test-key");
    await runtime1.start();
    await waitFor(() => db1.getLatestScheduledRuns(5, "prompt-task").length > 0, 7000);
    await runtime1.stop();
    db1.close();

    const db2 = new OpenAssistDatabase({ dbPath, logger });
    const runtime2 = new OpenAssistRuntime(
      config,
      { db: db2, logger },
      { providers: [new MockProvider()], channels: [new MockChannel()] }
    );
    runtime2.setProviderApiKey("mock-provider", "test-key");
    await runtime2.start();
    await waitFor(() => db2.getLatestScheduledRuns(10, "prompt-task").length >= 2, 7000);

    const runs = db2.getLatestScheduledRuns(20, "prompt-task");
    const keys = runs.map((run) => run.scheduledFor);
    const unique = new Set(keys);
    assert.equal(unique.size, keys.length);

    await runtime2.stop();
    db2.close();
  });
});
