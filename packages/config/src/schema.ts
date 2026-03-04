import { z } from "zod";
import type { RuntimeConfig } from "@openassist/core-types";

function isValidIanaTimezone(value: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const ENV_VAR_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SECRET_LIKE_CHANNEL_SETTING_KEY_PATTERN =
  /(token|secret|api[_-]?key|password|passphrase|credential|authorization|auth)/i;

function parseEnvReference(value: string): { varName: string } | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("env:")) {
    return null;
  }

  const varName = trimmed.slice(4).trim();
  if (!ENV_VAR_NAME_PATTERN.test(varName)) {
    return null;
  }

  return { varName };
}

function isSecretLikeChannelSettingKey(key: string): boolean {
  return SECRET_LIKE_CHANNEL_SETTING_KEY_PATTERN.test(key);
}

const providerSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["openai", "anthropic", "openai-compatible"]),
  defaultModel: z.string().min(1),
  baseUrl: z.string().url().optional(),
  oauth: z
    .object({
      authorizeUrl: z.string().url(),
      tokenUrl: z.string().url(),
      clientId: z.string().min(1),
      clientSecretEnv: z
        .string()
        .regex(ENV_VAR_NAME_PATTERN, "OAuth clientSecretEnv must be a valid env var name")
        .optional(),
      scopes: z.array(z.string()).optional(),
      audience: z.string().optional(),
      extraAuthParams: z.record(z.string()).optional(),
      extraTokenParams: z.record(z.string()).optional()
  })
    .optional(),
  metadata: z.record(z.unknown()).optional()
});

const scheduledOutputSchema = z
  .object({
    channelId: z.string().min(1).optional(),
    conversationKey: z.string().min(1).optional(),
    messageTemplate: z.string().min(1).optional()
  })
  .optional();

const scheduledActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("prompt"),
    providerId: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    promptTemplate: z.string().min(1),
    metadata: z.record(z.string()).optional()
  }),
  z.object({
    type: z.literal("skill"),
    skillId: z.string().min(1),
    entrypoint: z.string().min(1),
    input: z.record(z.unknown()).optional()
  })
]);

const scheduledTaskSchema = z
  .discriminatedUnion("scheduleKind", [
    z.object({
      id: z.string().min(1),
      enabled: z.boolean().default(true),
      scheduleKind: z.literal("cron"),
      cron: z.string().min(1),
      timezone: z
        .string()
        .refine((value) => isValidIanaTimezone(value), "Invalid IANA timezone")
        .optional(),
      misfirePolicy: z.enum(["catch-up-once", "skip", "backfill"]).optional(),
      maxRuntimeSec: z.number().int().positive().optional(),
      action: scheduledActionSchema,
      output: scheduledOutputSchema
    }),
    z.object({
      id: z.string().min(1),
      enabled: z.boolean().default(true),
      scheduleKind: z.literal("interval"),
      intervalSec: z.number().int().min(1),
      timezone: z
        .string()
        .refine((value) => isValidIanaTimezone(value), "Invalid IANA timezone")
        .optional(),
      misfirePolicy: z.enum(["catch-up-once", "skip", "backfill"]).optional(),
      maxRuntimeSec: z.number().int().positive().optional(),
      action: scheduledActionSchema,
      output: scheduledOutputSchema
    })
  ])
  .superRefine((task, ctx) => {
    if (task.action.type === "prompt" && task.output?.channelId && !task.output?.conversationKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "output.conversationKey is required when output.channelId is set",
        path: ["output", "conversationKey"]
      });
    }
  });

const channelSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["telegram", "discord", "whatsapp-md"]),
  enabled: z.boolean().default(true),
  settings: z
    .record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]))
    .default({})
}).superRefine((channel, ctx) => {
  for (const [key, value] of Object.entries(channel.settings)) {
    const secretLike = isSecretLikeChannelSettingKey(key);
    const keyPath = ["settings", key];

    if (typeof value === "string") {
      if (secretLike) {
        if (!parseEnvReference(value)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Channel secret-like setting '${key}' must use env:VAR_NAME`,
            path: keyPath
          });
        }
        continue;
      }

      if (value.trim().startsWith("env:") && !parseEnvReference(value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Invalid env reference format for channel setting '${key}'`,
          path: keyPath
        });
      }
      continue;
    }

    if (Array.isArray(value)) {
      if (secretLike) {
        value.forEach((entry, index) => {
          if (!parseEnvReference(entry)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Channel secret-like setting '${key}' must use env:VAR_NAME entries`,
              path: [...keyPath, index]
            });
          }
        });
        continue;
      }

      value.forEach((entry, index) => {
        if (entry.trim().startsWith("env:") && !parseEnvReference(entry)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Invalid env reference format for channel setting '${key}'`,
            path: [...keyPath, index]
          });
        }
      });
      continue;
    }

    if (secretLike) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Channel secret-like setting '${key}' must use string env:VAR_NAME values`,
        path: keyPath
      });
    }
  }
});

const runtimeSchema = z.object({
  bindAddress: z.string().default("127.0.0.1"),
  bindPort: z.number().int().min(1).max(65535).default(3344),
  defaultProviderId: z.string().min(1),
  providers: z.array(providerSchema).min(1),
  channels: z.array(channelSchema).default([]),
  defaultPolicyProfile: z.enum(["restricted", "operator", "full-root"]).default("operator"),
  workspaceRoot: z.string().optional(),
  assistant: z
    .object({
      name: z.string().min(1).default("OpenAssist"),
      persona: z
        .string()
        .default("Pragmatic, concise, and execution-focused local AI assistant."),
      operatorPreferences: z.string().default(""),
      promptOnFirstContact: z.boolean().default(true)
    })
    .default({}),
  time: z
    .object({
      defaultTimezone: z
        .string()
        .refine((value) => isValidIanaTimezone(value), "Invalid IANA timezone")
        .optional(),
      ntpPolicy: z.enum(["warn-degrade", "hard-fail", "off"]).default("warn-degrade"),
      ntpCheckIntervalSec: z.number().int().positive().default(300),
      ntpMaxSkewMs: z.number().int().nonnegative().default(10_000),
      ntpHttpSources: z
        .array(z.string().url())
        .default([
          "https://www.google.com",
          "https://www.cloudflare.com",
          "https://www.microsoft.com"
        ]),
      requireTimezoneConfirmation: z.boolean().default(true)
    })
    .default({}),
  scheduler: z
    .object({
      enabled: z.boolean().default(true),
      tickIntervalMs: z.number().int().positive().default(1000),
      heartbeatIntervalSec: z.number().int().positive().default(30),
      defaultMisfirePolicy: z.enum(["catch-up-once", "skip", "backfill"]).default("catch-up-once"),
      tasks: z.array(scheduledTaskSchema).default([])
    })
    .default({}),
  paths: z.object({
    dataDir: z.string().min(1),
    skillsDir: z.string().min(1),
    logsDir: z.string().min(1)
  })
});

const toolPoliciesSchema = z.object({
  workspaceOnly: z.boolean().default(true),
  allowedReadPaths: z.array(z.string()).default([]),
  allowedWritePaths: z.array(z.string()).default([])
});

const execGuardrailsSchema = z.object({
  mode: z.enum(["minimal", "off", "strict"]).default("minimal"),
  extraBlockedPatterns: z.array(z.string()).default([])
});

const execToolSchema = z.object({
  defaultTimeoutMs: z.number().int().positive().default(60_000),
  guardrails: execGuardrailsSchema.default({})
});

const packageToolSchema = z.object({
  enabled: z.boolean().default(true),
  preferStructuredInstall: z.boolean().default(true),
  allowExecFallback: z.boolean().default(true),
  sudoNonInteractive: z.boolean().default(true),
  allowedManagers: z.array(z.string()).default([])
});

const securitySchema = z.object({
  auditLogEnabled: z.boolean().default(true),
  secretsBackend: z.enum(["encrypted-file"]).default("encrypted-file")
});

export const openAssistConfigSchema = z.object({
  runtime: runtimeSchema,
  tools: z
    .object({
      fs: toolPoliciesSchema.default({}),
      exec: execToolSchema.default({}),
      pkg: packageToolSchema.default({})
    })
    .default({}),
  security: securitySchema.default({})
});

export type OpenAssistConfig = z.infer<typeof openAssistConfigSchema>;

export function parseConfig(input: unknown): OpenAssistConfig {
  return openAssistConfigSchema.parse(input);
}

export function toRuntimeConfig(config: OpenAssistConfig): RuntimeConfig {
  return {
    bindAddress: config.runtime.bindAddress,
    bindPort: config.runtime.bindPort,
    defaultProviderId: config.runtime.defaultProviderId,
    providers: config.runtime.providers,
    channels: config.runtime.channels,
    defaultPolicyProfile: config.runtime.defaultPolicyProfile,
    workspaceRoot: config.runtime.workspaceRoot,
    assistant: config.runtime.assistant,
    paths: config.runtime.paths,
    time: config.runtime.time,
    scheduler: config.runtime.scheduler,
    tools: config.tools,
    security: config.security
  };
}
