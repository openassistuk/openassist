import { DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity";
import OpenAI from "openai";
import { z } from "zod";
import type {
  ApiKeyAuth,
  ChatRequest,
  ChatResponse,
  EntraAuth,
  OpenAIReasoningEffort,
  ProviderAdapter,
  ProviderAuth,
  ProviderCapabilities,
  ValidationResult
} from "@openassist/core-types";
import {
  hasImageInputs,
  mapResponsesApiResponse,
  mapResponsesInput,
  mapResponsesTools,
  reasoningPayload
} from "@openassist/providers-openai-shared";

const AZURE_FOUNDRY_SCOPE = "https://ai.azure.com/.default";
const RESOURCE_NAME_PATTERN = /^[A-Za-z0-9-]+$/;

const configSchema = z.object({
  id: z.string().min(1),
  defaultModel: z.string().min(1),
  baseUrl: z.string().url().optional(),
  authMode: z.enum(["api-key", "entra"]),
  resourceName: z
    .string()
    .min(1)
    .regex(RESOURCE_NAME_PATTERN, "resourceName must use letters, numbers, or hyphen"),
  endpointFlavor: z.enum(["openai-resource", "foundry-resource"]),
  underlyingModel: z.string().min(1).optional(),
  reasoningEffort: z.enum(["low", "medium", "high", "xhigh"]).optional()
});

export interface AzureFoundryProviderConfig extends z.infer<typeof configSchema> {}

export interface AzureFoundryProviderAdapterDependencies {
  createCredential?: () => DefaultAzureCredential;
  createTokenProvider?: (
    credential: DefaultAzureCredential,
    scope: string
  ) => () => Promise<string>;
}

class AzureFoundryProviderError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "AzureFoundryProviderError";
    this.status = status;
  }
}

function trimTrailingSlash(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) {
    end -= 1;
  }
  return end === value.length ? value : value.slice(0, end);
}

function deriveBaseUrl(config: AzureFoundryProviderConfig): string {
  if (config.baseUrl) {
    return trimTrailingSlash(config.baseUrl);
  }

  const host =
    config.endpointFlavor === "foundry-resource"
      ? `${config.resourceName}.services.ai.azure.com`
      : `${config.resourceName}.openai.azure.com`;
  return `https://${host}/openai/v1`;
}

function isApiKeyAuth(auth: ProviderAuth): auth is ApiKeyAuth {
  return "apiKey" in auth;
}

function isEntraAuth(auth: ProviderAuth): auth is EntraAuth {
  return "kind" in auth && auth.kind === "entra";
}

function sanitizeProviderError(
  error: unknown,
  config: AzureFoundryProviderConfig,
  deploymentName: string
): AzureFoundryProviderError {
  const status =
    typeof error === "object" && error !== null && typeof (error as { status?: unknown }).status === "number"
      ? ((error as { status: number }).status)
      : undefined;
  const rawMessage = error instanceof Error ? error.message : String(error);
  const message = rawMessage.trim();
  const normalized = message.toLowerCase();

  if (status === 401 || status === 403 || normalized.includes("unauthorized") || normalized.includes("forbidden")) {
    return new AzureFoundryProviderError(
      `Azure Foundry authentication failed for resource '${config.resourceName}'. ` +
        `Check the configured ${config.authMode === "entra" ? "Entra host credentials and Azure role assignment" : "API key"} and try again.`,
      status
    );
  }

  if (status === 404 || normalized.includes("deployment") || normalized.includes("not found")) {
    return new AzureFoundryProviderError(
      `Azure Foundry could not find deployment '${deploymentName}' on resource '${config.resourceName}'. ` +
        "Confirm the resource endpoint and deployment name in the Foundry or Azure portal.",
      status
    );
  }

  if (
    status === 400 ||
    status === 422 ||
    normalized.includes("responses") ||
    normalized.includes("not supported") ||
    normalized.includes("unsupported")
  ) {
    return new AzureFoundryProviderError(
      `Azure Foundry rejected deployment '${deploymentName}' for the Responses API. ` +
        "Confirm that the deployment exists and uses a Responses API-compatible model.",
      status
    );
  }

  if (status) {
    return new AzureFoundryProviderError(
      `Azure Foundry request failed with HTTP ${status}. ${message || "Check the Azure resource, deployment, and auth configuration."}`,
      status
    );
  }

  return new AzureFoundryProviderError(
    `Azure Foundry request failed. ${message || "Check the Azure resource, deployment, and auth configuration."}`
  );
}

export function supportsAzureFoundryResponsesModel(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return (
    normalized.startsWith("gpt-5") ||
    normalized.startsWith("o1") ||
    normalized.startsWith("o2") ||
    normalized.startsWith("o3") ||
    normalized.startsWith("o4") ||
    normalized.includes("deepseek") ||
    normalized.includes("grok") ||
    normalized.includes("mai") ||
    normalized.includes("llama") ||
    normalized.includes("mistral") ||
    normalized.includes("phi")
  );
}

function resolveReasoningModel(config: AzureFoundryProviderConfig, requestedModel: string): string {
  return requestedModel === config.defaultModel && config.underlyingModel
    ? config.underlyingModel
    : requestedModel;
}

export class AzureFoundryProviderAdapter implements ProviderAdapter {
  private readonly config: AzureFoundryProviderConfig;
  private readonly baseUrl: string;
  private readonly dependencies: AzureFoundryProviderAdapterDependencies;
  private entraTokenProvider?: () => Promise<string>;

  constructor(
    config: AzureFoundryProviderConfig,
    dependencies: AzureFoundryProviderAdapterDependencies = {}
  ) {
    this.config = configSchema.parse(config);
    this.baseUrl = deriveBaseUrl(this.config);
    this.dependencies = dependencies;
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
      supportsImageInputs: true
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

  private client(auth: ProviderAuth): OpenAI {
    if (this.config.authMode === "api-key") {
      if (!isApiKeyAuth(auth) || !auth.apiKey) {
        throw new AzureFoundryProviderError("Azure Foundry API-key auth is required for this provider.");
      }

      return new OpenAI({
        apiKey: auth.apiKey,
        baseURL: this.baseUrl
      });
    }

    if (!isEntraAuth(auth)) {
      throw new AzureFoundryProviderError("Azure Foundry Entra host-credential auth is required for this provider.");
    }

    const createCredential =
      this.dependencies.createCredential ?? (() => new DefaultAzureCredential());
    const createTokenProvider =
      this.dependencies.createTokenProvider ??
      ((credential: DefaultAzureCredential, scope: string) => getBearerTokenProvider(credential, scope));

    this.entraTokenProvider ??= createTokenProvider(
      createCredential(),
      AZURE_FOUNDRY_SCOPE
    );

    return new OpenAI({
      apiKey: this.entraTokenProvider as unknown as string,
      baseURL: this.baseUrl
    });
  }

  async chat(req: ChatRequest, auth: ProviderAuth): Promise<ChatResponse> {
    const client = this.client(auth);
    const model = req.model || this.config.defaultModel;
    const reasoningModel = resolveReasoningModel(this.config, model);

    try {
      const response = await client.responses.create({
        model,
        temperature: req.temperature,
        max_output_tokens: req.maxTokens,
        reasoning: reasoningPayload(reasoningModel, this.config.reasoningEffort as OpenAIReasoningEffort | undefined),
        input: await mapResponsesInput(req.messages) as any,
        tools: mapResponsesTools(req.tools) as any,
        metadata: req.metadata
      } as any);

      return mapResponsesApiResponse(response);
    } catch (error) {
      throw sanitizeProviderError(error, this.config, model);
    }
  }
}

export { AZURE_FOUNDRY_SCOPE, deriveBaseUrl, hasImageInputs };
