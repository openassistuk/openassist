import OpenAI from "openai";
import { z } from "zod";
import type {
  ApiKeyAuth,
  ChatRequest,
  ChatResponse,
  ProviderAdapter,
  ProviderAuth,
  ProviderAuthHandle,
  ProviderCapabilities,
  ValidationResult
} from "@openassist/core-types";

const configSchema = z.object({
  id: z.string().min(1),
  defaultModel: z.string().min(1),
  baseUrl: z.string().url(),
  apiPath: z.string().default("/chat/completions")
});

export type OpenAICompatibleConfig = z.input<typeof configSchema>;

const TOOL_NAME_SAFE_PATTERN = /^[a-zA-Z0-9_-]+$/;
const TOOL_NAME_ENCODING_PREFIX = "oa__";

function encodeToolName(name: string): string {
  if (TOOL_NAME_SAFE_PATTERN.test(name)) {
    return name;
  }
  const encoded = Buffer.from(name, "utf8").toString("base64url");
  return `${TOOL_NAME_ENCODING_PREFIX}${encoded}`;
}

function decodeToolName(name: string): string {
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

function mapMessages(messages: ChatRequest["messages"]): Array<Record<string, unknown>> {
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

function mapTools(tools: ChatRequest["tools"]): Array<Record<string, unknown>> | undefined {
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

export class OpenAICompatibleProviderAdapter implements ProviderAdapter {
  private readonly config: OpenAICompatibleConfig;

  constructor(config: OpenAICompatibleConfig) {
    this.config = configSchema.parse(config);
  }

  id(): string {
    return this.config.id;
  }

  capabilities(): ProviderCapabilities {
    return {
      supportsStreaming: false,
      supportsTools: true,
      supportsOAuth: false,
      supportsApiKeys: true,
      supportsImageInputs: false
    };
  }

  async validateConfig(config: unknown): Promise<ValidationResult> {
    const parsed = configSchema.safeParse(config);
    if (parsed.success) {
      return { valid: true, errors: [] };
    }

    return {
      valid: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    };
  }

  async chat(req: ChatRequest, auth: ProviderAuth): Promise<ChatResponse> {
    const apiKey = "apiKey" in auth ? auth.apiKey : "accessToken" in auth ? auth.accessToken : undefined;
    if (!apiKey) {
      throw new Error("OpenAI-compatible provider requires an API key or access token");
    }

    const client = new OpenAI({
      apiKey,
      baseURL: this.config.baseUrl
    });

    const completion = await client.chat.completions.create({
      model: req.model || this.config.defaultModel,
      temperature: req.temperature,
      max_tokens: req.maxTokens,
      messages: mapMessages(req.messages) as any,
      tools: mapTools(req.tools) as any
    } as any);

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
}
