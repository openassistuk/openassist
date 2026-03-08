import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PromptAdapter } from "../../apps/openassist-cli/src/lib/setup-wizard.js";
import { runSetupHub } from "../../apps/openassist-cli/src/lib/setup-hub.js";

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("failed to resolve test port")));
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

class ScriptedPromptAdapter implements PromptAdapter {
  private readonly queue: string[];

  constructor(answers: string[]) {
    this.queue = [...answers];
  }

  private next(): string {
    if (this.queue.length === 0) {
      throw new Error("No scripted answer available");
    }
    return this.queue.shift() ?? "";
  }

  async input(): Promise<string> {
    return this.next();
  }

  async password(): Promise<string> {
    return this.next();
  }

  async confirm(): Promise<boolean> {
    return this.next() === "true";
  }

  async select<T extends string>(): Promise<T> {
    return this.next() as T;
  }
}

function minimalTelegramAnswers(bindPort: number): string[] {
  return [
    "false",
    "127.0.0.1",
    String(bindPort),
    "OpenAssist",
    "Pragmatic and concise",
    "Keep answers practical",
    "openai",
    "openai-main",
    "gpt-5.4",
    "",
    "openai-key",
    "telegram",
    "telegram-main",
    "telegram-token",
    "123,456",
    "Europe",
    "Europe/London",
    "true",
    "save"
  ];
}

const stdinDescriptor = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
const stdoutDescriptor = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");

afterEach(() => {
  process.exitCode = undefined;
  if (stdinDescriptor) {
    Object.defineProperty(process.stdin, "isTTY", stdinDescriptor);
  } else {
    Reflect.deleteProperty(process.stdin, "isTTY");
  }
  if (stdoutDescriptor) {
    Object.defineProperty(process.stdout, "isTTY", stdoutDescriptor);
  } else {
    Reflect.deleteProperty(process.stdout, "isTTY");
  }
  vi.restoreAllMocks();
});

describe("setup hub", () => {
  it("prints scriptable guidance and does not mutate when no TTY is available", async () => {
    const root = tempDir("openassist-setup-hub-nontty-");
    const configPath = path.join(root, "openassist.toml");
    const envFilePath = path.join(root, "openassistd.env");
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: false });
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: false });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await runSetupHub(
      {
        installDir: root,
        configPath,
        envFilePath
      },
      new ScriptedPromptAdapter([])
    );

    expect(process.exitCode).toBe(1);
    expect(fs.existsSync(configPath)).toBe(false);
    expect(fs.existsSync(envFilePath)).toBe(false);
    expect(errorSpy.mock.calls.flat().join("\n")).toContain("Interactive lifecycle hub requires TTY.");
    expect(errorSpy.mock.calls.flat().join("\n")).toContain("openassist setup quickstart");
    expect(errorSpy.mock.calls.flat().join("\n")).toContain("openassist setup wizard");
  });

  it("routes first-time setup through the bare setup hub", async () => {
    const root = tempDir("openassist-setup-hub-first-time-");
    const configPath = path.join(root, "openassist.toml");
    const envFilePath = path.join(root, "openassistd.env");
    const installDir = root;
    const bindPort = await getFreePort();
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runSetupHub(
      {
        installDir,
        configPath,
        envFilePath,
        skipService: true
      },
      new ScriptedPromptAdapter(["first-time", ...minimalTelegramAnswers(bindPort)])
    );

    expect(fs.existsSync(configPath)).toBe(true);
    expect(fs.existsSync(envFilePath)).toBe(true);
    expect(logSpy.mock.calls.flat().join("\n")).toContain("Quickstart saved");
  });
});
