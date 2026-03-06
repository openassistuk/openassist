import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { ChannelConfig } from "@openassist/core-types";
import { OpenAssistDatabase } from "../../packages/storage-sqlite/src/index.js";
import { DatabasePolicyEngine } from "../../packages/core-runtime/src/policy-engine.js";
import { createLogger } from "../../packages/observability/src/index.js";

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function buildChannels(count = 1): ChannelConfig[] {
  const channels: ChannelConfig[] = [
    {
      id: "telegram-main",
      type: "telegram",
      enabled: true,
      settings: {
        operatorUserIds: ["123456789"]
      }
    }
  ];
  if (count > 1) {
    channels.push({
      id: "telegram-backup",
      type: "telegram",
      enabled: true,
      settings: {
        operatorUserIds: ["987654321"]
      }
    });
  }
  return channels;
}

describe("DatabasePolicyEngine", () => {
  it("applies actor override before session override, channel operator default, and runtime default", async () => {
    const root = tempDir("openassist-policy-engine-");
    roots.push(root);

    const db = new OpenAssistDatabase({
      dbPath: path.join(root, "openassist.db"),
      logger: createLogger({ service: "test" })
    });
    const engine = new DatabasePolicyEngine({
      db,
      defaultProfile: "operator",
      operatorAccessProfile: "full-root",
      channels: buildChannels()
    });

    const operatorDefault = await engine.resolveProfile({
      sessionId: "telegram-main:ops-room",
      actorId: "123456789"
    });
    assert.deepEqual(operatorDefault, {
      profile: "full-root",
      source: "channel-operator-default"
    });

    await engine.setProfile("telegram-main:ops-room", "restricted");
    const sessionOverride = await engine.resolveProfile({
      sessionId: "telegram-main:ops-room",
      actorId: "123456789"
    });
    assert.deepEqual(sessionOverride, {
      profile: "restricted",
      source: "session-override"
    });

    await engine.setProfile("telegram-main:ops-room", "full-root", "123456789");
    const actorOverride = await engine.resolveProfile({
      sessionId: "telegram-main:ops-room",
      actorId: "123456789"
    });
    assert.deepEqual(actorOverride, {
      profile: "full-root",
      source: "actor-override"
    });

    const differentSender = await engine.resolveProfile({
      sessionId: "telegram-main:ops-room",
      actorId: "222222222"
    });
    assert.deepEqual(differentSender, {
      profile: "restricted",
      source: "session-override"
    });

    db.close();
  });

  it("reads legacy type-based overrides when the upgraded mapping is unambiguous", async () => {
    const root = tempDir("openassist-policy-engine-legacy-");
    roots.push(root);

    const db = new OpenAssistDatabase({
      dbPath: path.join(root, "openassist.db"),
      logger: createLogger({ service: "test" })
    });
    db.setPolicyProfile("telegram:ops-room", "full-root");
    db.setActorPolicyProfile("telegram:ops-room", "123456789", "operator");

    const engine = new DatabasePolicyEngine({
      db,
      defaultProfile: "restricted",
      operatorAccessProfile: "operator",
      channels: buildChannels()
    });

    const actorOverride = await engine.resolveProfile({
      sessionId: "telegram-main:ops-room",
      actorId: "123456789"
    });
    assert.deepEqual(actorOverride, {
      profile: "operator",
      source: "actor-override"
    });

    const sessionOverride = await engine.resolveProfile({
      sessionId: "telegram-main:ops-room",
      actorId: "222222222"
    });
    assert.deepEqual(sessionOverride, {
      profile: "full-root",
      source: "session-override"
    });

    db.close();
  });

  it("does not apply legacy type-based overrides when multiple configured channels make the mapping ambiguous", async () => {
    const root = tempDir("openassist-policy-engine-ambiguous-");
    roots.push(root);

    const db = new OpenAssistDatabase({
      dbPath: path.join(root, "openassist.db"),
      logger: createLogger({ service: "test" })
    });
    db.setPolicyProfile("telegram:ops-room", "full-root");

    const engine = new DatabasePolicyEngine({
      db,
      defaultProfile: "operator",
      operatorAccessProfile: "operator",
      channels: buildChannels(2)
    });

    const resolution = await engine.resolveProfile({
      sessionId: "telegram-main:ops-room",
      actorId: "123456789"
    });
    assert.deepEqual(resolution, {
      profile: "operator",
      source: "default"
    });

    db.close();
  });
});
