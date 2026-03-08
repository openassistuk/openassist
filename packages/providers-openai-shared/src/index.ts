import fs from "node:fs";
import type { ChatRequest, ChatResponse } from "@openassist/core-types";

const TOOL_NAME_SAFE_PATTERN = /^[a-zA-Z0-9_-]+$/;
const TOOL_NAME_ENCODING_PREFIX = "oa__";

export function encodeToolName(name: string): string {
  if (TOOL_NAME_SAFE_PATTERN.test(name)) {
    return name;
  }
  const encoded = Buffer.from(name, "utf8").toString("base64url");
  return `${TOOL_NAME_ENCODING_PREFIX}${encoded}`;
}

export function decodeToolName(name: string): string {
  if (!name.startsWith(TOOL_NAME_ENCODING_PREFIX)) {
    return name;
  }
  const encoded = name.slice(TOOL_NAME_ENCODING_PREFIX.length);
  try {
    const decoded = Buffer.from(encoded, "base64url").toString("utf8");
    return decoded.length > 0 ? decoded : name;
  } catch {
    return name;
  }
}

function mapRole(role: string): "system" | "user" | "assistant" {
  if (role === "system" || role === "assistant" || role === "user") {
    return role;
  }
  return "user";
}

export function mapMessages(messages: ChatRequest["messages"]): Array<Record<string, unknown>> {
  return messages.map((message) => {
    if (message.role === "tool") {
      return {
        role: "tool",
        content: message.content,
        tool_call_id: message.toolCallId
      };
    }

    if (message.role === "assistant" && message.toolCallId && message.toolName) {
      return {
        role: "assistant",
        content: message.content,
        tool_calls: [
          {
            id: message.toolCallId,
            type: "function",
            function: {
              name: encodeToolName(message.toolName),
              arguments: message.metadata?.toolArgumentsJson ?? "{}"
            }
          }
        ]
      };
    }

    return {
      role: mapRole(message.role),
      content: message.content
    };
  });
}

function imageAttachmentsForMessage(message: ChatRequest["messages"][number]) {
  return (message.attachments ?? []).filter(
    (attachment) => attachment.kind === "image" && typeof attachment.localPath === "string"
  );
}

async function toDataUrl(filePath: string, mimeType: string | undefined): Promise<string> {
  const bytes = await fs.promises.readFile(filePath);
  const resolvedMime = mimeType?.trim() || "image/jpeg";
  return `data:${resolvedMime};base64,${bytes.toString("base64")}`;
}

export function mapTools(tools: ChatRequest["tools"]): Array<Record<string, unknown>> | undefined {
  if (tools.length === 0) {
    return undefined;
  }
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: encodeToolName(tool.name),
      description: tool.description,
      parameters: tool.inputSchema
    }
  }));
}

export async function mapResponsesInput(
  messages: ChatRequest["messages"]
): Promise<Array<Record<string, unknown>>> {
  return Promise.all(
    messages.map(async (message) => {
      if (message.role === "assistant" && message.toolCallId && message.toolName) {
        return {
          type: "function_call",
          call_id: message.toolCallId,
          name: encodeToolName(message.toolName),
          arguments: message.metadata?.toolArgumentsJson ?? "{}"
        };
      }

      if (message.role === "tool") {
        return {
          type: "function_call_output",
          call_id: message.toolCallId ?? "tool-call-unknown",
          output: message.content
        };
      }

      if (message.role === "assistant" || message.role === "system" || message.role === "user") {
        const imageAttachments = message.role === "user" ? imageAttachmentsForMessage(message) : [];
        if (imageAttachments.length > 0) {
          const content: Array<Record<string, unknown>> = [];
          if (message.content.trim().length > 0) {
            content.push({
              type: "input_text",
              text: message.content
            });
          }
          for (const attachment of imageAttachments) {
            content.push({
              type: "input_image",
              image_url: await toDataUrl(attachment.localPath!, attachment.mimeType)
            });
          }
          return {
            type: "message",
            role: message.role,
            content
          };
        }

        return {
          type: "message",
          role: message.role,
          content: message.content
        };
      }

      return {
        type: "message",
        role: "user",
        content: message.content
      };
    })
  );
}

export function hasImageInputs(messages: ChatRequest["messages"]): boolean {
  return messages.some((message) => imageAttachmentsForMessage(message).length > 0);
}

export function mapResponsesTools(
  tools: ChatRequest["tools"]
): Array<Record<string, unknown>> | undefined {
  if (tools.length === 0) {
    return undefined;
  }
  return tools.map((tool) => ({
    type: "function",
    name: encodeToolName(tool.name),
    description: tool.description,
    parameters: tool.inputSchema,
    strict: false
  }));
}

export function shouldPreferResponsesApi(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return (
    normalized.startsWith("gpt-5") ||
    normalized.includes("codex") ||
    normalized.startsWith("o1") ||
    normalized.startsWith("o2") ||
    normalized.startsWith("o3") ||
    normalized.startsWith("o4")
  );
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function shouldFallbackToResponses(error: unknown): boolean {
  const message = extractErrorMessage(error).toLowerCase();
  return (
    message.includes("not a chat model") ||
    message.includes("not supported in the v1/chat/completions endpoint") ||
    message.includes("use v1/completions")
  );
}

function extractResponsesText(response: any): string {
  if (typeof response?.output_text === "string" && response.output_text.length > 0) {
    return response.output_text;
  }

  const output = Array.isArray(response?.output) ? response.output : [];
  const texts: string[] = [];
  for (const item of output) {
    if (item?.type !== "message" || !Array.isArray(item?.content)) {
      continue;
    }
    for (const block of item.content) {
      if (block?.type === "output_text" && typeof block?.text === "string") {
        texts.push(block.text);
      }
    }
  }
  return texts.join("\n");
}

export function mapChatCompletionResponse(completion: any): ChatResponse {
  const choice = completion.choices[0];
  const output = choice?.message?.content ?? "";
  const usage = completion.usage;
  const rawToolCalls = ((choice?.message as any)?.tool_calls as Array<any> | undefined) ?? [];
  const toolCalls = rawToolCalls
    .filter((toolCall) => toolCall?.type === "function" && toolCall?.function?.name)
    .map((toolCall) => ({
      id: String(toolCall.id),
      name: decodeToolName(String(toolCall.function.name)),
      argumentsJson: String(toolCall.function.arguments ?? "{}")
    }));

  return {
    output: {
      role: "assistant",
      content: typeof output === "string" ? output : ""
    },
    usage: {
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
      totalTokens: usage?.total_tokens ?? 0
    },
    rawProviderResponseId: completion.id,
    finishReason: choice?.finish_reason ?? undefined,
    toolCalls
  };
}

export function mapResponsesApiResponse(response: any): ChatResponse {
  const output = extractResponsesText(response);
  const usage = response?.usage;
  const rawToolCalls = (response?.output as Array<any> | undefined) ?? [];
  const toolCalls = rawToolCalls
    .filter((item) => item?.type === "function_call" && typeof item?.name === "string")
    .map((item, index) => ({
      id: String(item.call_id ?? item.id ?? `call-${index + 1}`),
      name: decodeToolName(String(item.name)),
      argumentsJson: String(item.arguments ?? "{}")
    }));

  return {
    output: {
      role: "assistant",
      content: output
    },
    usage: {
      inputTokens: usage?.input_tokens ?? 0,
      outputTokens: usage?.output_tokens ?? 0,
      totalTokens: usage?.total_tokens ?? 0
    },
    rawProviderResponseId: response?.id,
    finishReason: typeof response?.status === "string" ? response.status : undefined,
    toolCalls
  };
}
