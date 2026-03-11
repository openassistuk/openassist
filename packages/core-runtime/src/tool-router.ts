import type { ToolCall, ToolResultMessage } from "@openassist/core-types";
import { redactSensitiveData, type OpenAssistLogger } from "@openassist/observability";
import type { ExecTool } from "@openassist/tools-exec";
import type { FsTool } from "@openassist/tools-fs";
import type { PackageInstallTool } from "@openassist/tools-package";
import type { WebTool } from "@openassist/tools-web";

export interface ToolExecutionContext {
  sessionId: string;
  actorId: string;
  conversationKey: string;
  activeChannelType: string;
  replyToTransportMessageId?: string;
}

export interface ToolExecutionRecord {
  message: ToolResultMessage;
  request: Record<string, unknown>;
  result: Record<string, unknown>;
  status: "succeeded" | "failed" | "blocked";
  errorText?: string;
}

export interface ChannelSendToolRequest {
  mode: "reply" | "notify";
  text?: string;
  attachmentPaths?: string[];
  channelId?: string;
  recipientUserId?: string;
  reason: string;
}

export interface ChannelSendToolResult {
  ok: boolean;
  mode: "reply" | "notify";
  channelId: string;
  conversationKey: string;
  directRecipientUserId?: string;
  deliveredAttachmentCount: number;
  notes: string[];
}

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("tool arguments must be a JSON object");
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value;
}

function asOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error("boolean value expected");
  }
  return value;
}

function asOptionalNumber(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error("number value expected");
  }
  return value;
}

function asOptionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error("string[] value expected");
  }
  return value.map((item) => asString(item, "array item"));
}

function asOptionalRecord(value: unknown): Record<string, string> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("env must be an object");
  }
  const output: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = asString(item, `env.${key}`);
  }
  return output;
}

function makeFailure(
  toolCall: ToolCall,
  request: Record<string, unknown>,
  errorText: string,
  status: "failed" | "blocked" = "failed"
): ToolExecutionRecord {
  return {
    message: {
      toolCallId: toolCall.id,
      name: toolCall.name,
      content: errorText,
      isError: true
    },
    request,
    result: {
      error: errorText
    },
    status,
    errorText
  };
}

export class RuntimeToolRouter {
  private readonly execTool: ExecTool;
  private readonly fsTool: FsTool;
  private readonly pkgTool: PackageInstallTool;
  private readonly webTool: WebTool;
  private readonly channelSendTool: (
    request: ChannelSendToolRequest,
    context: ToolExecutionContext
  ) => Promise<ChannelSendToolResult>;
  private readonly logger: OpenAssistLogger;

  constructor(options: {
    execTool: ExecTool;
    fsTool: FsTool;
    pkgTool: PackageInstallTool;
    webTool: WebTool;
    channelSendTool: (
      request: ChannelSendToolRequest,
      context: ToolExecutionContext
    ) => Promise<ChannelSendToolResult>;
    logger: OpenAssistLogger;
  }) {
    this.execTool = options.execTool;
    this.fsTool = options.fsTool;
    this.pkgTool = options.pkgTool;
    this.webTool = options.webTool;
    this.channelSendTool = options.channelSendTool;
    this.logger = options.logger;
  }

  async execute(toolCall: ToolCall, context: ToolExecutionContext): Promise<ToolExecutionRecord> {
    let argsValue: Record<string, unknown>;
    try {
      argsValue = asObject(JSON.parse(toolCall.argumentsJson || "{}"));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return makeFailure(toolCall, {}, `Invalid tool arguments JSON: ${message}`);
    }

    try {
      if (toolCall.name === "exec.run") {
        const command = asString(argsValue.command, "command");
        const result = await this.execTool.run({
          sessionId: context.sessionId,
          actorId: context.actorId,
          command,
          timeoutMs: asOptionalNumber(argsValue.timeoutMs),
          cwd: argsValue.cwd ? asString(argsValue.cwd, "cwd") : undefined,
          env: asOptionalRecord(argsValue.env)
        });
        const isError = result.exitCode !== 0;
        const status = result.exitCode === 126 ? "blocked" : isError ? "failed" : "succeeded";
        return {
          message: {
            toolCallId: toolCall.id,
            name: toolCall.name,
            content: JSON.stringify(result, null, 2),
            isError
          },
          request: argsValue,
          result: {
            ...result
          },
          status
        };
      }

      if (toolCall.name === "channel.send") {
        const mode = asString(argsValue.mode, "mode");
        if (mode !== "reply" && mode !== "notify") {
          throw new Error("mode must be 'reply' or 'notify'");
        }
        const reason = asString(argsValue.reason, "reason");
        const text =
          argsValue.text === undefined ? undefined : asString(argsValue.text, "text");
        const result = await this.channelSendTool(
          {
            mode,
            reason,
            text,
            attachmentPaths: asOptionalStringArray(argsValue.attachmentPaths),
            channelId:
              argsValue.channelId === undefined ? undefined : asString(argsValue.channelId, "channelId"),
            recipientUserId:
              argsValue.recipientUserId === undefined
                ? undefined
                : asString(argsValue.recipientUserId, "recipientUserId")
          },
          context
        );
        return {
          message: {
            toolCallId: toolCall.id,
            name: toolCall.name,
            content: JSON.stringify(result, null, 2),
            isError: false
          },
          request: argsValue,
          result: {
            ...result
          },
          status: "succeeded"
        };
      }

      if (toolCall.name === "fs.read") {
        const filePath = asString(argsValue.path, "path");
        const content = await this.fsTool.read({
          sessionId: context.sessionId,
          actorId: context.actorId,
          filePath
        });
        return {
          message: {
            toolCallId: toolCall.id,
            name: toolCall.name,
            content,
            isError: false
          },
          request: argsValue,
          result: {
            content
          },
          status: "succeeded"
        };
      }

      if (toolCall.name === "fs.write") {
        const filePath = asString(argsValue.path, "path");
        const content = asString(argsValue.content, "content");
        await this.fsTool.write({
          sessionId: context.sessionId,
          actorId: context.actorId,
          filePath,
          content
        });
        return {
          message: {
            toolCallId: toolCall.id,
            name: toolCall.name,
            content: JSON.stringify({ ok: true }, null, 2),
            isError: false
          },
          request: argsValue,
          result: {
            ok: true
          },
          status: "succeeded"
        };
      }

      if (toolCall.name === "fs.delete") {
        const filePath = asString(argsValue.path, "path");
        await this.fsTool.delete({
          sessionId: context.sessionId,
          actorId: context.actorId,
          filePath,
          recursive: asOptionalBoolean(argsValue.recursive)
        });
        return {
          message: {
            toolCallId: toolCall.id,
            name: toolCall.name,
            content: JSON.stringify({ ok: true }, null, 2),
            isError: false
          },
          request: argsValue,
          result: {
            ok: true
          },
          status: "succeeded"
        };
      }

      if (toolCall.name === "pkg.install") {
        const packages = asOptionalStringArray(argsValue.packages);
        if (!packages || packages.length === 0) {
          throw new Error("packages must be a non-empty string array");
        }

        const result = await this.pkgTool.install({
          sessionId: context.sessionId,
          actorId: context.actorId,
          packages,
          manager: argsValue.manager ? asString(argsValue.manager, "manager") : undefined,
          global: asOptionalBoolean(argsValue.global),
          dev: asOptionalBoolean(argsValue.dev),
          extraArgs: asOptionalStringArray(argsValue.extraArgs),
          useSudo: asOptionalBoolean(argsValue.useSudo)
        });
        const isError = result.exitCode !== 0;
        return {
          message: {
            toolCallId: toolCall.id,
            name: toolCall.name,
            content: JSON.stringify(result, null, 2),
            isError
          },
          request: argsValue,
          result: {
            ...result
          },
          status: isError ? "failed" : "succeeded"
        };
      }

      if (toolCall.name === "web.search") {
        const query = asString(argsValue.query, "query");
        const result = await this.webTool.search({
          sessionId: context.sessionId,
          actorId: context.actorId,
          query,
          limit: asOptionalNumber(argsValue.limit),
          domains: asOptionalStringArray(argsValue.domains)
        });
        return {
          message: {
            toolCallId: toolCall.id,
            name: toolCall.name,
            content: JSON.stringify(result, null, 2),
            isError: false
          },
          request: argsValue,
          result: {
            ...result
          },
          status: "succeeded"
        };
      }

      if (toolCall.name === "web.fetch") {
        const url = asString(argsValue.url, "url");
        const format =
          argsValue.format === undefined ? undefined : asString(argsValue.format, "format");
        const result = await this.webTool.fetchUrl({
          sessionId: context.sessionId,
          actorId: context.actorId,
          url,
          format: format as "text" | "excerpt" | undefined,
          maxBytes: asOptionalNumber(argsValue.maxBytes)
        });
        return {
          message: {
            toolCallId: toolCall.id,
            name: toolCall.name,
            content: JSON.stringify(result, null, 2),
            isError: false
          },
          request: argsValue,
          result: {
            ...result
          },
          status: "succeeded"
        };
      }

      if (toolCall.name === "web.run") {
        const objective = asString(argsValue.objective, "objective");
        const query =
          argsValue.query === undefined ? undefined : asString(argsValue.query, "query");
        const result = await this.webTool.run({
          sessionId: context.sessionId,
          actorId: context.actorId,
          objective,
          query,
          urls: asOptionalStringArray(argsValue.urls),
          searchLimit: asOptionalNumber(argsValue.searchLimit),
          pageLimit: asOptionalNumber(argsValue.pageLimit),
          domains: asOptionalStringArray(argsValue.domains)
        });
        return {
          message: {
            toolCallId: toolCall.id,
            name: toolCall.name,
            content: JSON.stringify(result, null, 2),
            isError: false
          },
          request: argsValue,
          result: {
            ...result
          },
          status: "succeeded"
        };
      }

      return makeFailure(toolCall, argsValue, `Unknown tool: ${toolCall.name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        redactSensitiveData({
          type: "tool.call.error",
          toolName: toolCall.name,
          toolCallId: toolCall.id,
          sessionId: context.sessionId,
          actorId: context.actorId,
          request: argsValue,
          error: message
        }),
        "tool execution failed"
      );
      return makeFailure(toolCall, argsValue, message);
    }
  }
}
