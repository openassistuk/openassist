import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  SpawnCommandRunner,
  resolveCommandInvocation,
  runOrThrow,
  runStreamingOrThrow
} from "../../apps/openassist-cli/src/lib/command-runner.js";

const roots: string[] = [];
function tempDir(prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

function fixture(root: string, relative: string, content = ""): string {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

describe("command-runner", () => {
  it("leaves Unix commands and Windows commands other than pnpm unchanged", () => {
    expect(resolveCommandInvocation("pnpm", ["--version"], {}, "linux")).toEqual({command:"pnpm",args:["--version"]});
    expect(resolveCommandInvocation("git", ["--version"], {}, "win32")).toEqual({command:"git",args:["--version"]});
  });

  it("honors PATH order, quoting and Node's Windows environment-key precedence", () => {
    const root = tempDir("openassist-command-path-");
    const first = fixture(path.join(root, "first bin"), "pnpm.exe");
    fixture(path.join(root, "second"), "pnpm.exe");
    const args = ["a & b", "space value"];
    expect(resolveCommandInvocation("pnpm", args, {env:{PATH:`"${path.dirname(first)}";${root}/second`,Path:"missing"}}, "win32"))
      .toEqual({command:first,args});
    expect(resolveCommandInvocation("pnpm", args, {env:{PATH:"",Path:path.dirname(first)}}, "win32"))
      .toEqual({error:expect.stringContaining("not found on the selected PATH")});
  });

  it.each(["node_modules/pnpm/pnpm.exe", "../pnpm/pnpm.exe"])("resolves npm's native pnpm executable at %s without executing its cmd shim", relative => {
    const root = tempDir("openassist-command-native-");
    const bin = path.join(root,"bin");
    fixture(bin, "pnpm.cmd");
    const executable = fixture(bin, relative);
    expect(resolveCommandInvocation("pnpm", ["--version"], {env:{Path:bin}}, "win32"))
      .toEqual({command:executable,args:["--version"]});
  });

  it.each(["node_modules/pnpm/bin/pnpm.mjs", "node_modules/pnpm/bin/pnpm.cjs", "node_modules/corepack/dist/pnpm.js"])("runs %s with Node and literal arguments", relative => {
    const root = tempDir("openassist-command-script-");
    fixture(root, "pnpm.cmd");
    const script = fixture(root, relative);
    const args = ["a & b", "$value", "space value"];
    expect(resolveCommandInvocation("pnpm", args, {env:{PATH:`${root}/absent;${root}`}}, "win32"))
      .toEqual({command:process.execPath,args:[script,...args]});
    const node = fixture(root, "node.exe");
    expect(resolveCommandInvocation("pnpm", args, {env:{PATH:root}}, "win32"))
      .toEqual({command:node,args:[script,...args]});
  });

  it("does not find pnpm outside the supplied PATH or guess unfamiliar shim targets", () => {
    const root = tempDir("openassist-command-missing-");
    fixture(root, "pnpm.cmd", "@echo should not execute");
    expect(resolveCommandInvocation("pnpm", [], {env:{}}, "win32")).toEqual({error:expect.stringContaining("not found on the selected PATH")});
    expect(resolveCommandInvocation("pnpm", [], {env:{PATH:root}}, "win32")).toEqual({error:expect.stringContaining("Unsupported pnpm.cmd shim")});
    const later = path.join(root,"later");
    fixture(later,"pnpm.exe");
    expect(resolveCommandInvocation("pnpm", [], {env:{PATH:`${root};${later}`}}, "win32")).toEqual({error:expect.stringContaining("Unsupported pnpm.cmd shim")});
    fs.unlinkSync(path.join(root,"pnpm.cmd"));
    fixture(root,"node_modules/pnpm/bin/pnpm.cjs");
    expect(resolveCommandInvocation("pnpm", [], {env:{PATH:root}}, "win32")).toEqual({error:expect.stringContaining("not found on the selected PATH")});
  });

  it.runIf(process.platform === "win32")("preserves shell metacharacters in captured and streaming pnpm launches", async () => {
    const root = tempDir("openassist-command-literal-");
    fixture(root, "pnpm.cmd", "@echo should not execute");
    fixture(root, "node_modules/pnpm/bin/pnpm.cjs", "const fs=require('node:fs'); const args=process.argv.slice(2); if(process.env.ARGV_FILE) fs.writeFileSync(process.env.ARGV_FILE,JSON.stringify(args)); else process.stdout.write(JSON.stringify(args));");
    const args = ["spaces here", "a & echo injected", "%PATH%", "$(echo injected)"];
    const runner = new SpawnCommandRunner();
    const env = {...process.env,PATH:root,Path:root};
    const result = await runner.run("pnpm",args,{env});
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual(args);
    const output = path.join(root,"args.json");
    expect(await runner.runStreaming("pnpm",args,{env:{...env,ARGV_FILE:output}})).toBe(0);
    expect(JSON.parse(fs.readFileSync(output,"utf8"))).toEqual(args);
  });

  it.runIf(process.platform === "win32").each(["run", "runStreaming"] as const)("never launches a later executable through %s when the first pnpm shim is unsupported", async method => {
    const root = tempDir("openassist-command-unsupported-");
    const first = path.join(root,"first");
    const later = path.join(root,"later");
    fixture(first,"pnpm.cmd","@exit /b 99\r\n");
    fs.mkdirSync(later,{recursive:true});
    // A real executable must be present so a second PATH search would succeed.
    fs.copyFileSync(process.execPath,path.join(later,"pnpm.exe"));
    const search = `${first};${later}`;
    const runner = new SpawnCommandRunner();
    await expect(runner[method]("pnpm",["--version"],{env:{...process.env,PATH:search,Path:search}}))
      .rejects.toThrow("Unsupported pnpm.cmd shim");
  });

  it("captures stdout/stderr and exit code", async () => {
    const root = tempDir("openassist-command-runner-");
    const scriptPath = path.join(root, "ok.js");
    fs.writeFileSync(scriptPath, "process.stdout.write('ok'); process.stderr.write('warn');", "utf8");

    const runner = new SpawnCommandRunner();
    const result = await runner.run("node", [scriptPath]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("ok");
    expect(result.stderr).toContain("warn");
  });

  it("throws on non-zero exit in runOrThrow", async () => {
    const root = tempDir("openassist-command-runner-fail-");
    const scriptPath = path.join(root, "fail.js");
    fs.writeFileSync(scriptPath, "process.stderr.write('boom'); process.exit(7);", "utf8");

    const runner = new SpawnCommandRunner();

    await expect(runOrThrow(runner, "node", [scriptPath])).rejects.toThrow("Command failed: node");
  });

  it("throws on non-zero exit in runStreamingOrThrow", async () => {
    const root = tempDir("openassist-command-runner-stream-fail-");
    const scriptPath = path.join(root, "fail-stream.js");
    fs.writeFileSync(scriptPath, "process.exit(5);", "utf8");

    const runner = new SpawnCommandRunner();

    await expect(runStreamingOrThrow(runner, "node", [scriptPath])).rejects.toThrow("Command failed: node");
  });
});
