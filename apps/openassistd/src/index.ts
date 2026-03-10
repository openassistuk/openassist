#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { Command } from "commander";
import { defaultConfigPath, loadConfig, resolveConfigOverlaysDir } from "@openassist/config";
import { OpenAssistRuntime } from "@openassist/core-runtime";
import type { RuntimeConfig } from "@openassist/core-types";
import { createLogger } from "@openassist/observability";
import { OpenAssistDatabase } from "@openassist/storage-sqlite";
import { OpenAIProviderAdapter } from "@openassist/providers-openai";
import { CodexProviderAdapter } from "@openassist/providers-codex";
import { AnthropicProviderAdapter } from "@openassist/providers-anthropic";
import { OpenAICompatibleProviderAdapter } from "@openassist/providers-openai-compatible";
import { TelegramChannelAdapter } from "@openassist/channels-telegram";
import { DiscordChannelAdapter } from "@openassist/channels-discord";
import { WhatsAppMdChannelAdapter } from "@openassist/channels-whatsapp-md";
import { loadRuntimeInstallContext } from "./install-context.js";
import { resolveChannelSettings } from "./channel-settings.js";
import { resolveDefaultOAuthRedirectUri } from "./oauth-redirect.js";

function envApiKeyVar(providerId: string): string {
  return `OPENASSIST_PROVIDER_${providerId.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`;
}

const workspaceCwd = process.env.INIT_CWD ? path.resolve(process.env.INIT_CWD) : process.cwd();

function resolveFromWorkspace(target: string): string {
  if (path.isAbsolute(target)) {
    return target;
  }
  return path.resolve(workspaceCwd, target);
}

function toModeText(mode: number): string {
  return `0o${(mode & 0o777).toString(8).padStart(3, "0")}`;
}

function assertUnixOwnerOnlyPath(targetPath: string, kind: "file" | "directory"): void {
  if (process.platform === "win32") {
    return;
  }

  if (!fs.existsSync(targetPath)) {
    throw new Error(`Missing ${kind} path for security permission check: ${targetPath}`);
  }
  const stat = fs.statSync(targetPath);
  if (kind === "file" && !stat.isFile()) {
    throw new Error(`Expected file path for security permission check: ${targetPath}`);
  }
  if (kind === "directory" && !stat.isDirectory()) {
    throw new Error(`Expected directory path for security permission check: ${targetPath}`);
  }

  const mode = stat.mode & 0o777;
  if ((mode & 0o077) !== 0) {
    throw new Error(
      `Insecure permissions on ${kind} '${targetPath}': ${toModeText(mode)}. ` +
        "Use owner-only permissions (no group/other access)."
    );
  }
}

function ensureDirectories(pathsToEnsure: string[]): void {
  for (const target of pathsToEnsure) {
    fs.mkdirSync(target, { recursive: true });
  }
}

function sendJson(
  res: http.ServerResponse,
  statusCode: number,
  payload: Record<string, unknown> | Array<unknown>
): void {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendText(res: http.ServerResponse, statusCode: number, text: string): void {
  res.writeHead(statusCode, {
    "content-type": "text/plain; charset=utf-8",
    "content-length": Buffer.byteLength(text)
  });
  res.end(text);
}

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return {};
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (text.trim().length === 0) {
    return {};
  }
  return JSON.parse(text) as Record<string, unknown>;
}

function classifyHttpError(error: unknown): { statusCode: 400 | 500 | 502; operatorMessage: string } {
  if (typeof error === "object" && error !== null) {
    const statusCode = (error as { statusCode?: unknown }).statusCode;
    const operatorMessage = (error as { operatorMessage?: unknown }).operatorMessage;
    if (
      (statusCode === 400 || statusCode === 502) &&
      typeof operatorMessage === "string" &&
      operatorMessage.trim().length > 0
    ) {
      return {
        statusCode,
        operatorMessage: operatorMessage.trim()
      };
    }
  }

  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  if (
    normalized.includes("oauth state is required") ||
    normalized.includes("oauth code is required") ||
    normalized.includes("oauth flow state not found") ||
    normalized.includes("oauth flow provider mismatch") ||
    normalized.includes("oauth flow expired")
  ) {
    return {
      statusCode: 400,
      operatorMessage: message
    };
  }
  return {
    statusCode: 500,
    operatorMessage: "internal server error"
  };
}

const program = new Command();
program
  .name("openassistd")
  .description("OpenAssist daemon")
  .version("0.1.0");

program
  .command("run")
  .description("Run OpenAssist daemon")
  .option("--config <path>", "Path to openassist.toml", defaultConfigPath())
  .action(async (options) => {
    const configPath = resolveFromWorkspace(options.config);

    const logger = createLogger({ service: "openassistd" });
    const { config, loadedFiles } = loadConfig({
      baseFile: configPath,
      overlaysDir: resolveConfigOverlaysDir(configPath)
    });

    ensureDirectories([
      resolveFromWorkspace(config.runtime.paths.dataDir),
      resolveFromWorkspace(config.runtime.paths.logsDir),
      resolveFromWorkspace(config.runtime.paths.skillsDir),
      path.join(resolveFromWorkspace(config.runtime.paths.dataDir), "helper-tools")
    ]);

    const dataDirPath = resolveFromWorkspace(config.runtime.paths.dataDir);
    const dbPath = path.join(dataDirPath, "openassist.db");
    if (process.platform !== "win32") {
      fs.chmodSync(dataDirPath, 0o700);
      assertUnixOwnerOnlyPath(dataDirPath, "directory");
      const envFilePath = process.env.OPENASSIST_ENV_FILE;
      if (envFilePath) {
        const resolvedEnvFilePath = resolveFromWorkspace(envFilePath);
        if (fs.existsSync(resolvedEnvFilePath)) {
          assertUnixOwnerOnlyPath(path.dirname(resolvedEnvFilePath), "directory");
          assertUnixOwnerOnlyPath(resolvedEnvFilePath, "file");
        } else {
          logger.warn(
            { envFilePath: resolvedEnvFilePath },
            "OPENASSIST_ENV_FILE is set but file does not exist"
          );
        }
      }
    } else {
      logger.info(
        {
          type: "security.permissions.skip",
          platform: process.platform
        },
        "skipping strict unix permission checks on this platform"
      );
    }

    const db = new OpenAssistDatabase({ dbPath, logger });
    if (process.platform !== "win32") {
      assertUnixOwnerOnlyPath(dbPath, "file");
    }

    const providers = config.runtime.providers.map((providerConfig) => {
      if (providerConfig.type === "openai") {
        return new OpenAIProviderAdapter({
          id: providerConfig.id,
          defaultModel: providerConfig.defaultModel,
          baseUrl: providerConfig.baseUrl,
          reasoningEffort: providerConfig.reasoningEffort,
          oauth: providerConfig.oauth
        });
      }
      if (providerConfig.type === "codex") {
        return new CodexProviderAdapter({
          id: providerConfig.id,
          defaultModel: providerConfig.defaultModel,
          baseUrl: providerConfig.baseUrl,
          reasoningEffort: providerConfig.reasoningEffort
        });
      }
      if (providerConfig.type === "anthropic") {
        return new AnthropicProviderAdapter({
          id: providerConfig.id,
          defaultModel: providerConfig.defaultModel,
          baseUrl: providerConfig.baseUrl,
          thinkingBudgetTokens: providerConfig.thinkingBudgetTokens,
          oauth: providerConfig.oauth
        });
      }
      return new OpenAICompatibleProviderAdapter({
        id: providerConfig.id,
        defaultModel: providerConfig.defaultModel,
        baseUrl: providerConfig.baseUrl ?? "http://localhost:11434/v1"
      });
    });

    const channels = config.runtime.channels
      .filter((channelConfig) => channelConfig.enabled)
      .map((channelConfig) => {
        const settings = resolveChannelSettings(channelConfig.settings);
        if (channelConfig.type === "telegram") {
          return new TelegramChannelAdapter({
            id: channelConfig.id,
            botToken: String(settings.botToken ?? ""),
            allowedChatIds: Array.isArray(settings.allowedChatIds)
              ? (settings.allowedChatIds as string[])
              : [],
            conversationMode:
              settings.conversationMode === "chat-thread" ? "chat-thread" : "chat",
            responseMode:
              settings.responseMode === "reply-threaded" ? "reply-threaded" : "inline"
          });
        }

        if (channelConfig.type === "discord") {
          return new DiscordChannelAdapter({
            id: channelConfig.id,
            botToken: String(settings.botToken ?? ""),
            allowedChannelIds: Array.isArray(settings.allowedChannelIds)
              ? (settings.allowedChannelIds as string[])
              : [],
            allowedDmUserIds: Array.isArray(settings.allowedDmUserIds)
              ? (settings.allowedDmUserIds as string[])
              : []
          });
        }

        return new WhatsAppMdChannelAdapter({
          id: channelConfig.id,
          mode:
            settings.mode === "experimental"
              ? "experimental"
              : "production",
          sessionDir:
            typeof settings.sessionDir === "string"
              ? settings.sessionDir
              : path.join(config.runtime.paths.dataDir, "whatsapp-md", channelConfig.id),
          printQrInTerminal: settings.printQrInTerminal !== false,
          syncFullHistory: settings.syncFullHistory === true,
          maxReconnectAttempts:
            typeof settings.maxReconnectAttempts === "number"
              ? Number(settings.maxReconnectAttempts)
              : 10,
          reconnectDelayMs:
            typeof settings.reconnectDelayMs === "number"
              ? Number(settings.reconnectDelayMs)
              : 5000,
          browserName:
            typeof settings.browserName === "string"
              ? settings.browserName
              : "OpenAssist",
          browserVersion:
            typeof settings.browserVersion === "string"
              ? settings.browserVersion
              : "0.1.0",
          browserPlatform:
            typeof settings.browserPlatform === "string"
              ? settings.browserPlatform
              : process.platform
        });
      });
    const channelsById = new Map(channels.map((channel) => [channel.id(), channel]));

    const runtimeConfig: RuntimeConfig = {
      ...config.runtime,
      tools: config.tools,
      security: config.security
    };

    const runtime = new OpenAssistRuntime(
      runtimeConfig,
      {
        db,
        logger,
        installContext: loadRuntimeInstallContext(configPath, logger)
      },
      { providers, channels }
    );

    for (const providerConfig of config.runtime.providers) {
      if (providerConfig.type === "codex") {
        continue;
      }
      const varName = envApiKeyVar(providerConfig.id);
      const apiKey = process.env[varName];
      if (apiKey) {
        runtime.setProviderApiKey(providerConfig.id, apiKey);
      } else {
        logger.warn({ providerId: providerConfig.id, envVar: varName }, "provider API key env var not set");
      }
    }

    logger.info({ loadedFiles, dbPath }, "starting openassist runtime");
    await runtime.start();

    const httpServer = http.createServer(async (req, res) => {
      try {
        const method = req.method ?? "GET";
        const requestUrl = new URL(req.url ?? "/", "http://localhost");
        const parts = requestUrl.pathname.split("/").filter(Boolean);

        if (method === "GET" && requestUrl.pathname === "/v1/health") {
          sendJson(res, 200, {
            status: "ok",
            runtime: runtime.getStatus()
          });
          return;
        }

        if (method === "GET" && requestUrl.pathname === "/v1/time/status") {
          sendJson(res, 200, {
            time: runtime.getTimeStatus()
          });
          return;
        }

        if (method === "POST" && requestUrl.pathname === "/v1/time/timezone/confirm") {
          const body = await readJsonBody(req);
          const timezone = String(body.timezone ?? "");
          if (!timezone) {
            sendJson(res, 400, { error: "timezone is required" });
            return;
          }

          sendJson(res, 200, runtime.confirmTimezone(timezone));
          return;
        }

        if (method === "GET" && requestUrl.pathname === "/v1/scheduler/status") {
          sendJson(res, 200, {
            scheduler: runtime.getSchedulerStatus()
          });
          return;
        }

        if (method === "GET" && requestUrl.pathname === "/v1/scheduler/tasks") {
          sendJson(res, 200, {
            tasks: runtime.listSchedulerTasks()
          });
          return;
        }

        if (method === "GET" && requestUrl.pathname === "/v1/tools/status") {
          const sessionId = requestUrl.searchParams.get("sessionId") ?? undefined;
          const senderId = requestUrl.searchParams.get("senderId") ?? undefined;
          sendJson(res, 200, {
            tools: await runtime.getToolsStatus(sessionId, senderId)
          });
          return;
        }

        if (method === "GET" && requestUrl.pathname === "/v1/skills") {
          sendJson(res, 200, {
            skills: await runtime.listInstalledSkills()
          });
          return;
        }

        if (method === "POST" && requestUrl.pathname === "/v1/skills/install") {
          const body = await readJsonBody(req);
          const installPath = String(body.path ?? "");
          if (!installPath) {
            sendJson(res, 400, { error: "path is required" });
            return;
          }
          sendJson(res, 200, {
            installed: await runtime.installSkillFromPath(installPath)
          });
          return;
        }

        if (method === "GET" && requestUrl.pathname === "/v1/growth/status") {
          const sessionId = requestUrl.searchParams.get("sessionId") ?? undefined;
          const senderId = requestUrl.searchParams.get("senderId") ?? undefined;
          sendJson(res, 200, {
            growth: await runtime.getGrowthStatus(sessionId, senderId)
          });
          return;
        }

        if (method === "POST" && requestUrl.pathname === "/v1/growth/helpers") {
          const body = await readJsonBody(req);
          const id = String(body.id ?? "");
          const installRoot = String(body.root ?? "");
          const installer = String(body.installer ?? "");
          const summary = String(body.summary ?? "");
          if (!id || !installRoot || !installer || !summary) {
            sendJson(res, 400, {
              error: "id, root, installer, and summary are required"
            });
            return;
          }
          sendJson(res, 200, {
            helper: await runtime.registerManagedHelper({
              id,
              installRoot,
              installer,
              summary
            })
          });
          return;
        }

        if (method === "GET" && requestUrl.pathname === "/v1/tools/invocations") {
          const sessionId = requestUrl.searchParams.get("sessionId") ?? undefined;
          const limitRaw = requestUrl.searchParams.get("limit");
          const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 50;
          sendJson(res, 200, {
            invocations: runtime.listToolInvocations(
              sessionId,
              Number.isFinite(limit) ? limit : 50
            )
          });
          return;
        }

        if (
          method === "POST" &&
          parts[0] === "v1" &&
          parts[1] === "scheduler" &&
          parts[2] === "tasks" &&
          parts[3] &&
          parts[4] === "run"
        ) {
          const taskId = decodeURIComponent(parts[3]);
          const enqueued = runtime.enqueueScheduledTaskNow(taskId);
          sendJson(res, enqueued ? 200 : 404, {
            taskId,
            enqueued
          });
          return;
        }

        if (method === "GET" && requestUrl.pathname === "/v1/channels/status") {
          sendJson(res, 200, {
            channels: await runtime.getChannelStatuses()
          });
          return;
        }

        if (parts[0] === "v1" && parts[1] === "channels" && parts[2]) {
          const channelId = decodeURIComponent(parts[2]);
          const adapter = channelsById.get(channelId);
          if (!adapter) {
            sendJson(res, 404, { error: `channel ${channelId} not found` });
            return;
          }

          if (method === "GET" && parts.length === 4 && parts[3] === "status") {
            sendJson(res, 200, {
              channelId,
              health: await adapter.health()
            });
            return;
          }

          if (method === "GET" && parts.length === 4 && parts[3] === "qr") {
            if (adapter instanceof WhatsAppMdChannelAdapter) {
              sendJson(res, 200, {
                channelId,
                qr: adapter.getLastQr() ?? null
              });
              return;
            }
            sendJson(res, 400, { error: "QR is only supported for WhatsApp MD channels" });
            return;
          }
        }

        if (parts[0] === "v1" && parts[1] === "oauth") {
          if (method === "GET" && parts.length === 3 && parts[2] === "status") {
            sendJson(res, 200, {
              accounts: runtime.listOAuthAccounts()
            });
            return;
          }

          const providerId = parts[2];
          if (!providerId) {
            sendJson(res, 400, { error: "provider id is required" });
            return;
          }

          if (method === "POST" && parts.length === 4 && parts[3] === "start") {
            const body = await readJsonBody(req);
            const accountId = String(body.accountId ?? "default");
            const scopes = Array.isArray(body.scopes)
              ? body.scopes.map((value) => String(value))
              : [];
            const defaultRedirect = resolveDefaultOAuthRedirectUri(config.runtime, providerId);
            const redirectUri =
              typeof body.redirectUri === "string" ? body.redirectUri : defaultRedirect;

            const started = await runtime.startOAuthLogin(
              providerId,
              accountId,
              redirectUri,
              scopes
            );

            sendJson(res, 200, {
              redirectUri,
              ...started
            });
            return;
          }

          if (method === "GET" && parts.length === 4 && parts[3] === "callback") {
            const state = String(requestUrl.searchParams.get("state") ?? "");
            const code = String(requestUrl.searchParams.get("code") ?? "");

            const completed = await runtime.completeOAuthLogin(providerId, state, code);
            sendText(
              res,
              200,
              `OAuth linked for provider ${completed.providerId}, account ${completed.accountId}. You can close this tab.`
            );
            return;
          }

          if (method === "POST" && parts.length === 4 && parts[3] === "complete") {
            const body = await readJsonBody(req);
            const state = String(body.state ?? "");
            const code = String(body.code ?? "");

            const completed = await runtime.completeOAuthLogin(providerId, state, code);
            sendJson(res, 200, completed);
            return;
          }

          if (method === "GET" && parts.length === 4 && parts[3] === "status") {
            sendJson(res, 200, {
              providerId,
              accounts: runtime.listOAuthAccounts(providerId)
            });
            return;
          }

          if (
            method === "DELETE" &&
            parts.length === 6 &&
            parts[3] === "account" &&
            parts[4] &&
            parts[5] === "disconnect"
          ) {
            const accountId = decodeURIComponent(parts[4]);
            const removed = runtime.removeOAuthAccount(providerId, accountId);
            sendJson(res, removed ? 200 : 404, {
              providerId,
              accountId,
              removed
            });
            return;
          }
        }

        sendJson(res, 404, { error: "not found" });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const classified = classifyHttpError(error);
        logger.error({ error: message, statusCode: classified.statusCode }, "http request failed");
        sendJson(res, classified.statusCode, { error: classified.operatorMessage });
      }
    });

    await new Promise<void>((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(config.runtime.bindPort, config.runtime.bindAddress, () => {
        logger.info(
          {
            bindAddress: config.runtime.bindAddress,
            bindPort: config.runtime.bindPort
          },
          "openassist http api listening"
        );
        resolve();
      });
    });

    const shutdown = async () => {
      logger.info("shutting down openassist runtime");
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
      await runtime.stop();
      db.close();
      process.exit(0);
    };

    process.on("SIGINT", () => {
      shutdown().catch((error) => {
        logger.error({ error }, "shutdown failed");
        process.exit(1);
      });
    });

    process.on("SIGTERM", () => {
      shutdown().catch((error) => {
        logger.error({ error }, "shutdown failed");
        process.exit(1);
      });
    });
  });

if (process.argv.length <= 2) {
  process.argv.push("run");
}

await program.parseAsync(process.argv);
