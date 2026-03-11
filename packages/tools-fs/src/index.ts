import fs from "node:fs";
import path from "node:path";
import type { PolicyEngine } from "@openassist/core-types";
import type { OpenAssistLogger } from "@openassist/observability";

export interface FsToolOptions {
  policyEngine: PolicyEngine;
  logger: OpenAssistLogger;
  workspaceRoot?: string;
  allowedReadPaths?: string[];
  allowedWritePaths?: string[];
  workspaceOnly?: boolean;
}

export interface FsReadRequest {
  sessionId: string;
  actorId: string;
  filePath: string;
}

export interface FsWriteRequest extends FsReadRequest {
  content: string;
}

export interface FsDeleteRequest extends FsReadRequest {
  recursive?: boolean;
}

export class FsTool {
  private readonly policyEngine: PolicyEngine;
  private readonly logger: OpenAssistLogger;
  private readonly workspaceRoot?: string;
  private readonly allowedReadPaths: string[];
  private readonly allowedWritePaths: string[];
  private readonly workspaceOnly: boolean;

  constructor(options: FsToolOptions) {
    this.policyEngine = options.policyEngine;
    this.logger = options.logger;
    this.workspaceRoot = options.workspaceRoot ? path.resolve(options.workspaceRoot) : undefined;
    this.allowedReadPaths = (options.allowedReadPaths ?? []).map((p) => path.resolve(p));
    this.allowedWritePaths = (options.allowedWritePaths ?? []).map((p) => path.resolve(p));
    this.workspaceOnly = options.workspaceOnly ?? true;
  }

  private resolvePath(filePath: string): string {
    return path.resolve(filePath);
  }

  private ensurePathAllowed(absolutePath: string, mode: "read" | "write"): void {
    if (this.workspaceOnly && this.workspaceRoot) {
      const relative = path.relative(this.workspaceRoot, absolutePath);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error(`Path ${absolutePath} is outside workspace root ${this.workspaceRoot}`);
      }
    }

    const allowedSet = mode === "read" ? this.allowedReadPaths : this.allowedWritePaths;
    if (allowedSet.length === 0) {
      return;
    }

    const inAllowedPath = allowedSet.some((allowedPath) => {
      const relative = path.relative(allowedPath, absolutePath);
      return !relative.startsWith("..") && !path.isAbsolute(relative);
    });

    if (!inAllowedPath) {
      throw new Error(`Path ${absolutePath} is not allowed for ${mode}`);
    }
  }

  async authorizeReadPath(request: FsReadRequest): Promise<string> {
    const absolutePath = this.resolvePath(request.filePath);
    this.ensurePathAllowed(absolutePath, "read");

    const decision = await this.policyEngine.authorize("fs.read", {
      sessionId: request.sessionId,
      actorId: request.actorId,
      path: absolutePath
    });

    if (!decision.allowed) {
      throw new Error(decision.reason ?? "fs.read blocked by policy");
    }

    return absolutePath;
  }

  async read(request: FsReadRequest): Promise<string> {
    const absolutePath = await this.authorizeReadPath(request);

    const content = fs.readFileSync(absolutePath, "utf8");
    this.logger.info(
      {
        type: "audit.fs.read",
        sessionId: request.sessionId,
        actorId: request.actorId,
        path: absolutePath
      },
      "file read"
    );
    return content;
  }

  async write(request: FsWriteRequest): Promise<void> {
    const absolutePath = this.resolvePath(request.filePath);
    this.ensurePathAllowed(absolutePath, "write");

    const decision = await this.policyEngine.authorize("fs.write", {
      sessionId: request.sessionId,
      actorId: request.actorId,
      path: absolutePath
    });

    if (!decision.allowed) {
      throw new Error(decision.reason ?? "fs.write blocked by policy");
    }

    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    const fd = fs.openSync(
      absolutePath,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC,
      0o600
    );
    try {
      fs.writeFileSync(fd, request.content, "utf8");
    } finally {
      fs.closeSync(fd);
    }
    this.logger.info(
      {
        type: "audit.fs.write",
        sessionId: request.sessionId,
        actorId: request.actorId,
        path: absolutePath,
        bytes: Buffer.byteLength(request.content)
      },
      "file written"
    );
  }

  async delete(request: FsDeleteRequest): Promise<void> {
    const absolutePath = this.resolvePath(request.filePath);
    this.ensurePathAllowed(absolutePath, "write");

    const decision = await this.policyEngine.authorize("fs.delete", {
      sessionId: request.sessionId,
      actorId: request.actorId,
      path: absolutePath
    });

    if (!decision.allowed) {
      throw new Error(decision.reason ?? "fs.delete blocked by policy");
    }

    const stats = fs.existsSync(absolutePath) ? fs.statSync(absolutePath) : null;
    if (!stats) {
      return;
    }

    if (stats.isDirectory()) {
      fs.rmSync(absolutePath, { recursive: request.recursive === true, force: false });
    } else {
      fs.rmSync(absolutePath, { force: false });
    }

    this.logger.info(
      {
        type: "audit.fs.delete",
        sessionId: request.sessionId,
        actorId: request.actorId,
        path: absolutePath,
        recursive: request.recursive === true
      },
      "file deleted"
    );
  }
}
