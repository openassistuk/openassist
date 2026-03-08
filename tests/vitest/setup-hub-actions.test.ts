import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PromptAdapter } from "../../apps/openassist-cli/src/lib/setup-wizard.js";

const spawnMock = vi.fn();
const autoMigrateMock = vi.fn();
const loadSetupWizardStateMock = vi.fn();
const runSetupWizardMock = vi.fn();
const runSetupWizardPostSaveChecksMock = vi.fn();

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return {
    ...actual,
    spawn: spawnMock
  };
});

vi.mock("../../apps/openassist-cli/src/lib/operator-layout.js", () => ({
  autoMigrateLegacyDefaultLayoutIfNeeded: autoMigrateMock
}));

vi.mock("../../apps/openassist-cli/src/lib/setup-wizard.js", () => ({
  createInquirerPromptAdapter: vi.fn(),
  loadSetupWizardState: loadSetupWizardStateMock,
  runSetupWizard: runSetupWizardMock
}));

vi.mock("../../apps/openassist-cli/src/lib/setup-post-save.js", () => ({
  runSetupWizardPostSaveChecks: runSetupWizardPostSaveChecksMock
}));

const { runSetupHub } = await import("../../apps/openassist-cli/src/lib/setup-hub.js");

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
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

function successfulChild(exitCode = 0): { once: (event: string, cb: (value?: unknown) => void) => unknown } {
  return {
    once(event, cb) {
      if (event === "exit") {
        queueMicrotask(() => cb(exitCode));
      }
      return this;
    }
  };
}

const stdinDescriptor = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
const stdoutDescriptor = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");

beforeEach(() => {
  spawnMock.mockReset();
  autoMigrateMock.mockReset();
  loadSetupWizardStateMock.mockReset();
  runSetupWizardMock.mockReset();
  runSetupWizardPostSaveChecksMock.mockReset();
  spawnMock.mockImplementation(() => successfulChild());
});

afterEach(() => {
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

describe("setup hub action routing", () => {
  it("routes status, repair, service, and upgrade actions through the current CLI entrypoint", async () => {
    const installDir = tempDir("openassist-setup-hub-actions-");
    const configPath = path.join(installDir, "openassist.toml");
    const envFilePath = path.join(installDir, "openassistd.env");
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
    autoMigrateMock.mockResolvedValue({
      configPath,
      envFilePath,
      migrated: false
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runSetupHub(
      {
        installDir,
        configPath,
        envFilePath
      },
      new ScriptedPromptAdapter(["status", "repair", "service", "upgrade", "exit"])
    );

    expect(logSpy.mock.calls.flat().join("\n")).toContain("Current lifecycle files");
    expect(logSpy.mock.calls.flat().join("\n")).toContain("Managed helper tools:");
    expect(spawnMock).toHaveBeenCalledTimes(4);
    expect(spawnMock.mock.calls[0]?.[1].slice(1)).toEqual(["doctor"]);
    expect(spawnMock.mock.calls[1]?.[1].slice(1)).toEqual(["doctor"]);
    expect(spawnMock.mock.calls[2]?.[1].slice(1)).toEqual(["service", "console"]);
    expect(spawnMock.mock.calls[3]?.[1].slice(1)).toEqual(["upgrade", "--dry-run", "--install-dir", installDir]);
  });

  it("reports blocked legacy migration before offering hub actions", async () => {
    const installDir = tempDir("openassist-setup-hub-blocked-");
    const configPath = path.join(installDir, "openassist.toml");
    const envFilePath = path.join(installDir, "openassistd.env");
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
    autoMigrateMock.mockResolvedValue({
      configPath,
      envFilePath,
      migrated: false,
      blockedReason: "conflicting target files"
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await runSetupHub(
      {
        installDir,
        configPath,
        envFilePath
      },
      new ScriptedPromptAdapter(["exit"])
    );

    expect(errorSpy.mock.calls.flat().join("\n")).toContain("Legacy repo-local layout detected but automatic migration stopped");
    expect(errorSpy.mock.calls.flat().join("\n")).toContain("conflicting target files");
  });

  it("handles advanced wizard exit without saving and returns to the hub", async () => {
    const installDir = tempDir("openassist-setup-hub-advanced-unsaved-");
    const configPath = path.join(installDir, "openassist.toml");
    const envFilePath = path.join(installDir, "openassistd.env");
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
    autoMigrateMock.mockResolvedValue({
      configPath,
      envFilePath,
      migrated: false
    });
    loadSetupWizardStateMock.mockReturnValue({ state: "wizard" });
    runSetupWizardMock.mockResolvedValue({ saved: false });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runSetupHub(
      {
        installDir,
        configPath,
        envFilePath
      },
      new ScriptedPromptAdapter(["advanced", "exit"])
    );

    expect(loadSetupWizardStateMock).toHaveBeenCalledWith(configPath, envFilePath);
    expect(runSetupWizardMock).toHaveBeenCalled();
    expect(logSpy.mock.calls.flat().join("\n")).toContain("Setup wizard exited without saving.");
    expect(runSetupWizardPostSaveChecksMock).not.toHaveBeenCalled();
  });

  it("reports advanced wizard save results and post-save follow-up", async () => {
    const installDir = tempDir("openassist-setup-hub-advanced-saved-");
    const configPath = path.join(installDir, "openassist.toml");
    const envFilePath = path.join(installDir, "openassistd.env");
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
    autoMigrateMock.mockResolvedValue({
      configPath,
      envFilePath,
      migrated: true,
      message: "Migrated repo-local operator state."
    });
    loadSetupWizardStateMock.mockReturnValue({ state: "wizard" });
    runSetupWizardMock.mockResolvedValue({
      saved: true,
      backupPath: path.join(installDir, "openassist.toml.bak")
    });
    runSetupWizardPostSaveChecksMock.mockResolvedValue({
      completed: false,
      lastError: "service health still needs attention"
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runSetupHub(
      {
        installDir,
        configPath,
        envFilePath
      },
      new ScriptedPromptAdapter(["advanced"])
    );

    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("Migrated repo-local operator state.");
    expect(logOutput).toContain(`Saved advanced configuration to ${configPath}`);
    expect(logOutput).toContain(`Backup created: ${path.join(installDir, "openassist.toml.bak")}`);
    expect(logOutput).toContain("Needs action: service health still needs attention");
    expect(runSetupWizardPostSaveChecksMock).toHaveBeenCalledTimes(1);
  });
});
