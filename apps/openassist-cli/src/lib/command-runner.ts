import { spawn } from "node:child_process";

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

export class SpawnCommandRunner implements CommandRunner {
  async run(command: string, args: string[] = [], options: RunCommandOptions = {}): Promise<RunCommandResult> {
    return new Promise<RunCommandResult>((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        env: options.env ?? process.env,
        stdio: ["ignore", "pipe", "pipe"],
        shell: process.platform === "win32"
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
      const child = spawn(command, args, {
        cwd: options.cwd,
        env: options.env ?? process.env,
        stdio: "inherit",
        shell: process.platform === "win32"
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
