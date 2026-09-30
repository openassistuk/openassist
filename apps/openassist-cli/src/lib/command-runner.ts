import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface RunCommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface RunCommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface CommandRunner {
  run(command: string, args?: string[], options?: RunCommandOptions): Promise<RunCommandResult>;
  runStreaming(command: string, args?: string[], options?: RunCommandOptions): Promise<number>;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function resolveCommandInvocation(
  command: string,
  args: string[],
  options: RunCommandOptions = {},
  platform: NodeJS.Platform = process.platform
): { command: string; args: string[] } {
  if (platform !== "win32" || command !== "pnpm") return { command, args };

  const env = options.env ?? process.env;
  // Match Node's case-insensitive Windows environment-key selection.
  const pathKey = Object.keys(env).sort().find(key => key.toUpperCase() === "PATH");
  for (const entry of (env[pathKey ?? "PATH"] ?? "").split(";").filter(Boolean)) {
    const directory = path.resolve(options.cwd ?? process.cwd(), entry.replace(/^"(.*)"$/, "$1"));
    const executable = path.join(directory, "pnpm.exe");
    if (fs.existsSync(executable)) return { command: executable, args };
    if (!fs.existsSync(path.join(directory, "pnpm.cmd"))) continue;

    // npm/Corepack shims need a shell; invoke their known entrypoint directly.
    for (const relative of ["node_modules/pnpm/bin/pnpm.exe", "node_modules/pnpm/bin/pnpm.cjs", "node_modules/corepack/dist/pnpm.js"]) {
      const cli = path.join(directory, relative);
      if (!fs.existsSync(cli)) continue;
      if (cli.endsWith(".exe")) return { command: cli, args };
      const node = path.join(directory, "node.exe");
      return { command: fs.existsSync(node) ? node : process.execPath, args: [cli, ...args] };
    }
    // An unfamiliar first shim must not silently select another pnpm later on PATH.
    return { command, args };
  }
  return { command, args };
}

export class SpawnCommandRunner implements CommandRunner {
  async run(command: string, args: string[] = [], options: RunCommandOptions = {}): Promise<RunCommandResult> {
    return new Promise<RunCommandResult>((resolve, reject) => {
      const invocation = resolveCommandInvocation(command, args, options);
      const child = spawn(invocation.command, invocation.args, {
        cwd: options.cwd,
        env: options.env ?? process.env,
        stdio: ["ignore", "pipe", "pipe"],
        shell: false
      });

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      child.stdout.on("data", (chunk: Buffer) => {
        stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });

      child.stderr.on("data", (chunk: Buffer) => {
        stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });

      child.on("error", (error) => {
        reject(new Error(`Failed to start ${command}: ${toErrorMessage(error)}`));
      });

      child.on("close", (code) => {
        resolve({
          code: code ?? 1,
          stdout: Buffer.concat(stdoutChunks).toString("utf8"),
          stderr: Buffer.concat(stderrChunks).toString("utf8")
        });
      });
    });
  }

  async runStreaming(command: string, args: string[] = [], options: RunCommandOptions = {}): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const invocation = resolveCommandInvocation(command, args, options);
      const child = spawn(invocation.command, invocation.args, {
        cwd: options.cwd,
        env: options.env ?? process.env,
        stdio: "inherit",
        shell: false
      });

      child.on("error", (error) => {
        reject(new Error(`Failed to start ${command}: ${toErrorMessage(error)}`));
      });

      child.on("close", (code) => {
        resolve(code ?? 1);
      });
    });
  }
}

export async function runOrThrow(
  runner: CommandRunner,
  command: string,
  args: string[],
  options: RunCommandOptions = {}
): Promise<RunCommandResult> {
  const result = await runner.run(command, args, options);
  if (result.code !== 0) {
    const stderr = result.stderr.trim();
    const stdout = result.stdout.trim();
    throw new Error(
      [`Command failed: ${command} ${args.join(" ")}`, stderr || stdout || `exit code ${result.code}`].join("\n")
    );
  }
  return result;
}

export async function runStreamingOrThrow(
  runner: CommandRunner,
  command: string,
  args: string[],
  options: RunCommandOptions = {}
): Promise<void> {
  const code = await runner.runStreaming(command, args, options);
  if (code !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")} (exit code ${code})`);
  }
}
