import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { describe, it } from "node:test";

async function runCommand(
  command: string,
  args: string[],
  cwd: string
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout.on("data", (chunk) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.stderr.on("data", (chunk) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8")
      });
    });
  });
}

function repoRoot(): string {
  return path.resolve(".");
}

async function runCli(args: string[], cwd = repoRoot()): Promise<{ code: number; stdout: string; stderr: string }> {
  const tsxCli = path.join(repoRoot(), "apps", "openassist-cli", "src", "index.ts");
  const tsxEntrypoint = path.join(repoRoot(), "node_modules", "tsx", "dist", "cli.mjs");
  return runCommand(process.execPath, [tsxEntrypoint, tsxCli, ...args], cwd);
}

describe("cli api surface coverage", () => {
  it("covers status and mutation command paths against daemon APIs", async () => {
    const seenToolStatusQueries: string[] = [];
    const seenCodexCompleteBodies: Array<Record<string, unknown>> = [];
    const seenCodexDeviceCodeBodies: Array<Record<string, unknown>> = [];
    const server = http.createServer((req, res) => {
      const requestUrl = new URL(req.url ?? "/", "http://localhost");
      const pathname = requestUrl.pathname;
      const method = req.method ?? "GET";

      if (method === "GET" && pathname === "/v1/channels/status") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ channels: [{ channelId: "discord-main", health: { ok: true } }] }));
        return;
      }
      if (method === "GET" && pathname === "/v1/channels/discord-main/status") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ channelId: "discord-main", health: { ok: true } }));
        return;
      }
      if (method === "GET" && pathname === "/v1/channels/whatsapp-main/qr") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ channelId: "whatsapp-main", qr: "data:image/png;base64,AA==" }));
        return;
      }
      if (method === "GET" && pathname === "/v1/time/status") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ time: { timezone: "Europe/London", timezoneConfirmed: true } }));
        return;
      }
      if (method === "POST" && pathname === "/v1/time/timezone/confirm") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ timezone: "Europe/London", confirmed: true }));
        return;
      }
      if (method === "GET" && pathname === "/v1/scheduler/status") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ scheduler: { running: true, taskCount: 1 } }));
        return;
      }
      if (method === "GET" && pathname === "/v1/scheduler/tasks") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ tasks: [{ id: "task-demo" }] }));
        return;
      }
      if (method === "POST" && pathname === "/v1/scheduler/tasks/task-demo/run") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ taskId: "task-demo", enqueued: true }));
        return;
      }
      if (method === "GET" && pathname === "/v1/tools/status") {
        seenToolStatusQueries.push(requestUrl.search);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ tools: { enabled: true } }));
        return;
      }
      if (method === "GET" && pathname === "/v1/skills") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            skills: [
              {
                id: "disk-maintenance",
                version: "1.0.0",
                description: "Disk maintenance skill"
              }
            ]
          })
        );
        return;
      }
      if (method === "POST" && pathname === "/v1/skills/install") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            installed: {
              id: "disk-maintenance",
              version: "1.0.0",
              description: "Disk maintenance skill"
            }
          })
        );
        return;
      }
      if (method === "GET" && pathname === "/v1/growth/status") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            growth: {
              defaultMode: "extensions-first",
              fullRootCanGrowNow: true,
              skillsDirectory: "/tmp/openassist/skills",
              helperToolsDirectory: "/tmp/openassist/helper-tools",
              updateSafetyNote: "Managed growth survives normal updates more predictably.",
              installedSkills: [{ id: "disk-maintenance", version: "1.0.0" }],
              managedHelpers: [{ id: "ripgrep-helper", installer: "manual", updateSafe: true }]
            }
          })
        );
        return;
      }
      if (method === "POST" && pathname === "/v1/growth/helpers") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            helper: {
              id: "ripgrep-helper",
              installRoot: "/tmp/openassist/helper-tools/ripgrep",
              installer: "manual",
              updateSafe: true
            }
          })
        );
        return;
      }
      if (method === "GET" && pathname === "/v1/tools/invocations") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ invocations: [] }));
        return;
      }
      if (method === "POST" && pathname === "/v1/oauth/openai-main/start") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            authorizationUrl: "https://example.test/oauth/authorize",
            state: "state-openai",
            accountId: "default",
            expiresAt: "2026-03-04T00:00:00.000Z"
          })
        );
        return;
      }
      if (method === "POST" && pathname === "/v1/oauth/codex-main/start") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            authorizationUrl: "https://example.test/codex/authorize",
            state: "state-codex",
            accountId: "default",
            expiresAt: "2026-03-04T00:00:00.000Z"
          })
        );
        return;
      }
      if (method === "POST" && pathname === "/v1/oauth/codex-main/device-code/start") {
        const chunks: Buffer[] = [];
        req.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        req.on("end", () => {
          seenCodexDeviceCodeBodies.push(
            JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>
          );
          res.writeHead(200, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              verificationUri: "https://auth.openai.com/codex/device",
              userCode: "ABCD-EFGH",
              deviceCodeId: "device-auth-1",
              intervalSeconds: 1,
              expiresAt: "2026-03-05T00:00:00.000Z",
              accountId: "default"
            })
          );
        });
        return;
      }
      if (method === "POST" && pathname === "/v1/oauth/codex-main/device-code/complete") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            accountId: "default",
            expiresAt: "2026-03-05T00:10:00.000Z"
          })
        );
        return;
      }
      if (method === "POST" && pathname === "/v1/oauth/codex-main/complete") {
        const chunks: Buffer[] = [];
        req.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        req.on("end", () => {
          seenCodexCompleteBodies.push(
            JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>
          );
          res.writeHead(200, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              accountId: "default",
              expiresAt: "2026-03-05T00:00:00.000Z"
            })
          );
        });
        return;
      }
      if (method === "DELETE" && pathname === "/v1/oauth/codex-main/account/default/disconnect") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            providerId: "codex-main",
            accountId: "default",
            removed: true
          })
        );
        return;
      }
      if (method === "POST" && pathname === "/v1/oauth/openai-main/complete") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            accountId: "default",
            expiresAt: "2026-03-05T00:00:00.000Z"
          })
        );
        return;
      }
      if (method === "DELETE" && pathname === "/v1/oauth/openai-main/account/default/disconnect") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            providerId: "openai-main",
            accountId: "default",
            removed: true
          })
        );
        return;
      }
      if (method === "POST" && pathname === "/v1/oauth/bad-provider/start") {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "bad provider" }));
        return;
      }

      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const address = server.address();
    assert.notEqual(address, null);
    assert.equal(typeof address, "object");
    const baseUrl = `http://127.0.0.1:${(address as { port: number }).port}`;

    const successCommands: Array<{ args: string[]; outputPattern?: RegExp }> = [
      {
        args: ["channel", "status", "--base-url", baseUrl],
        outputPattern: /discord-main/
      },
      {
        args: ["channel", "status", "--id", "discord-main", "--base-url", baseUrl],
        outputPattern: /discord-main/
      },
      {
        args: ["channel", "qr", "--id", "whatsapp-main", "--base-url", baseUrl],
        outputPattern: /whatsapp-main/
      },
      {
        args: ["time", "status", "--base-url", baseUrl],
        outputPattern: /Europe\/London/
      },
      {
        args: ["time", "confirm", "--timezone", "Europe/London", "--base-url", baseUrl],
        outputPattern: /confirmed/
      },
      {
        args: ["scheduler", "status", "--base-url", baseUrl],
        outputPattern: /running/
      },
      {
        args: ["scheduler", "tasks", "--base-url", baseUrl],
        outputPattern: /task-demo/
      },
      {
        args: ["scheduler", "run", "--id", "task-demo", "--base-url", baseUrl],
        outputPattern: /enqueued/
      },
      {
        args: [
          "tools",
          "status",
          "--session",
          "telegram-main:ops-room",
          "--sender-id",
          "123456789",
          "--base-url",
          baseUrl
        ],
        outputPattern: /enabled/
      },
      {
        args: ["skills", "list", "--base-url", baseUrl],
        outputPattern: /disk-maintenance/
      },
      {
        args: ["skills", "list", "--json", "--base-url", baseUrl],
        outputPattern: /\"skills\"/
      },
      {
        args: ["skills", "install", "--path", ".", "--base-url", baseUrl],
        outputPattern: /Installed managed skill/
      },
      {
        args: ["growth", "status", "--base-url", baseUrl],
        outputPattern: /extensions-first/
      },
      {
        args: [
          "growth",
          "helper",
          "add",
          "--name",
          "ripgrep-helper",
          "--root",
          ".",
          "--installer",
          "manual",
          "--summary",
          "Local search helper",
          "--base-url",
          baseUrl
        ],
        outputPattern: /Registered helper/
      },
      {
        args: [
          "tools",
          "invocations",
          "--session",
          "telegram-main:ops-room",
          "--limit",
          "5",
          "--base-url",
          baseUrl
        ],
        outputPattern: /invocations/
      },
      {
        args: ["auth", "start", "--provider", "openai-main", "--account", "default", "--base-url", baseUrl],
        outputPattern: /Authorization URL/
      },
      {
        args: ["auth", "start", "--provider", "codex-main", "--account", "default", "--base-url", baseUrl],
        outputPattern: /Authorization URL/
      },
      {
        args: [
          "auth",
          "start",
          "--provider",
          "codex-main",
          "--device-code",
          "--base-url",
          baseUrl
        ],
        outputPattern: /Verification URL/
      },
      {
        args: [
          "auth",
          "complete",
          "--provider",
          "openai-main",
          "--state",
          "state-openai",
          "--code",
          "code-openai",
          "--base-url",
          baseUrl
        ],
        outputPattern: /OAuth linked/
      },
      {
        args: [
          "auth",
          "complete",
          "--provider",
          "codex-main",
          "--callback-url",
          "http://localhost:1455/auth/callback?state=state-codex&code=code-codex",
          "--base-url",
          baseUrl
        ],
        outputPattern: /OAuth linked/
      },
      {
        args: [
          "auth",
          "disconnect",
          "--provider",
          "openai-main",
          "--account",
          "default",
          "--base-url",
          baseUrl
        ],
        outputPattern: /Disconnected account/
      },
      {
        args: [
          "auth",
          "disconnect",
          "--provider",
          "codex-main",
          "--account",
          "default",
          "--base-url",
          baseUrl
        ],
        outputPattern: /Disconnected account/
      }
    ];

    try {
      for (const command of successCommands) {
        const result = await runCli(command.args);
        assert.equal(result.code, 0, result.stderr || result.stdout);
        if (command.outputPattern) {
          assert.match(result.stdout, command.outputPattern);
        }
      }

      assert.deepEqual(seenToolStatusQueries, ["?sessionId=telegram-main%3Aops-room&senderId=123456789"]);
      assert.deepEqual(seenCodexDeviceCodeBodies, [
        {
          accountId: "default",
          scopes: []
        }
      ]);
      assert.deepEqual(seenCodexCompleteBodies, [
        {
          state: "state-codex",
          code: "code-codex"
        }
      ]);

      const failedStart = await runCli([
        "auth",
        "start",
        "--provider",
        "bad-provider",
        "--account",
        "default",
        "--base-url",
        baseUrl
      ]);
      assert.equal(failedStart.code, 1, failedStart.stderr || failedStart.stdout);
      assert.match(failedStart.stderr, /OAuth start failed/);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });
});

