import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

test("Baileys registry libsignal encrypts, decrypts, and reloads persisted sessions", async () => {
  const require = createRequire(path.resolve("packages/channels-whatsapp-md/package.json"));
  const entry = require.resolve("@whiskeysockets/baileys");
  const { useMultiFileAuthState, generateSignalPubKey } = await import(pathToFileURL(entry).href);
  const { makeLibSignalRepository } = await import(pathToFileURL(path.join(path.dirname(entry), "Signal/libsignal.js")).href);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "openassist-signal-compat-"));
  try {
    const alice = await useMultiFileAuthState(path.join(root, "alice"));
    const bob = await useMultiFileAuthState(path.join(root, "bob"));
    await alice.saveCreds();
    await bob.saveCreds();
    const sender = makeLibSignalRepository(alice.state);
    const receiver = makeLibSignalRepository(bob.state);
    const creds = bob.state.creds;
    await sender.injectE2ESession({ jid: "222@s.whatsapp.net", session: {
      registrationId: creds.registrationId,
      identityKey: generateSignalPubKey(creds.signedIdentityKey.public),
      signedPreKey: { keyId: creds.signedPreKey.keyId,
        publicKey: generateSignalPubKey(creds.signedPreKey.keyPair.public),
        signature: creds.signedPreKey.signature }
    } });
    const first = await sender.encryptMessage({ jid: "222@s.whatsapp.net", data: Buffer.from("before restart") });
    assert.equal((await receiver.decryptMessage({ jid: "111@s.whatsapp.net", ...first })).toString(), "before restart");
    const restored = await useMultiFileAuthState(path.join(root, "bob"));
    const restartedReceiver = makeLibSignalRepository(restored.state);
    const next = await sender.encryptMessage({ jid: "222@s.whatsapp.net", data: Buffer.from("after restart") });
    assert.equal((await restartedReceiver.decryptMessage({ jid: "111@s.whatsapp.net", ...next })).toString(), "after restart");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
