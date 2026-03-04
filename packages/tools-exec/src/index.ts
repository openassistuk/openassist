import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";
import type { PolicyEngine } from "@openassist/core-types";
import { redactSensitiveData, type OpenAssistLogger } from "@openassist/observability";

const execAsync = promisify(execCb);

export interface ExecToolRequest {
  sessionId: string;
  actorId: string;
  command: string;
  timeoutMs?: number;
  cwd?: string;
  env?: Record<string, string>;
}

export interface ExecToolResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export interface ExecToolOptions {
  policyEngine: PolicyEngine;
  logger: OpenAssistLogger;
  defaultTimeoutMs?: number;
  guardrails?: {
    mode: "minimal" | "off" | "strict";
    extraBlockedPatterns?: string[];
  };
}

export class ExecTool {
  private readonly policyEngine: PolicyEngine;
  private readonly logger: OpenAssistLogger;
  private readonly defaultTimeoutMs: number;
  private readonly guardrailMode: "minimal" | "off" | "strict";
  private readonly extraBlockedRegexes: RegExp[];

  constructor(options: ExecToolOptions) {
    this.policyEngine = options.policyEngine;
    this.logger = options.logger;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 60_000;
    this.guardrailMode = options.guardrails?.mode ?? "minimal";
    this.extraBlockedRegexes = (options.guardrails?.extraBlockedPatterns ?? [])
      .map((pattern) => {
        try {
          return new RegExp(pattern, "i");
        } catch {
          return null;
        }
      })
      .filter((item): item is RegExp => item instanceof RegExp);
  }

  private guardrailPatterns(): RegExp[] {
    if (this.guardrailMode === "off") {
      return this.extraBlockedRegexes;
    }

    const patterns: RegExp[] = [
      /\brm\s+-rf\s+\/(\s|$)/i,
      /\bmkfs(\.[a-z0-9]+)?\b/i,
      /\bdd\s+if=.*\bof=\/dev\/(?:sd|vd|nvme)[a-z0-9]*/i,
      /:\(\)\s*\{\s*:\|:&\s*\};:/i
    ];

    if (this.guardrailMode === "strict") {
      patterns.push(/\bshutdown\b/i, /\breboot\b/i, /\bpoweroff\b/i);
    }

    patterns.push(...this.extraBlockedRegexes);
    return patterns;
  }

  private findBlockedPattern(command: string): string | null {
    for (const pattern of this.guardrailPatterns()) {
      if (pattern.test(command)) {
        return pattern.source;
      }
    }
    return null;
  }

  async run(request: ExecToolRequest): Promise<ExecToolResult> {
    const decision = await this.policyEngine.authorize("exec.run", {
      sessionId: request.sessionId,
      actorId: request.actorId,
      command: request.command
    });

    if (!decision.allowed) {
      throw new Error(decision.reason ?? "exec action blocked by policy");
    }

    const timeoutMs = request.timeoutMs ?? this.defaultTimeoutMs;
    const startedAt = Date.now();
    const blockedPattern = this.findBlockedPattern(request.command);
    if (blockedPattern) {
      const durationMs = Date.now() - startedAt;
      this.logger.warn(
        redactSensitiveData({
          type: "audit.exec",
          sessionId: request.sessionId,
          actorId: request.actorId,
          command: request.command,
          env: request.env,
          durationMs,
          exitCode: 126,
          blocked: true,
          blockedPattern
        }),
        "exec blocked by guardrail"
      );

      return {
        stdout: "",
        stderr: `Command blocked by guardrail pattern: ${blockedPattern}`,
        exitCode: 126,
        durationMs
      };
    }

    try {
      const result = await execAsync(request.command, {
        timeout: timeoutMs,
        cwd: request.cwd,
        env: {
          ...process.env,
          ...request.env
        },
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024
      });

      const durationMs = Date.now() - startedAt;
      this.logger.info(
        redactSensitiveData({
          type: "audit.exec",
          sessionId: request.sessionId,
          actorId: request.actorId,
          command: request.command,
          env: request.env,
          durationMs,
          exitCode: 0
        }),
        "exec completed"
      );

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: 0,
        durationMs
      };
    } catch (error: unknown) {
      const durationMs = Date.now() - startedAt;
      const err = error as Error & {
        code?: number;
        stdout?: string;
        stderr?: string;
      };

      const exitCode = typeof err.code === "number" ? err.code : 1;
      this.logger.warn(
        redactSensitiveData({
          type: "audit.exec",
          sessionId: request.sessionId,
          actorId: request.actorId,
          command: request.command,
          env: request.env,
          durationMs,
          exitCode,
          error: err.message
        }),
        "exec failed"
      );

      return {
        stdout: err.stdout ?? "",
        stderr: err.stderr ?? err.message,
        exitCode,
        durationMs
      };
    }
  }
}
