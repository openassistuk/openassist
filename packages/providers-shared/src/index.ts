import { createHash } from "node:crypto";
import type { ChatResponse, PreparedChatRequest, ProviderAuth } from "@openassist/core-types";

/** Conservative estimate, explicitly not a tokenizer or a provider guarantee. */
export function estimateWireTokens(value: unknown): number {
  const json = JSON.stringify(value) ?? "";
  return Math.ceil(Buffer.byteLength(json, "utf8") / 3) + 32;
}

function freezePayload(value: unknown): void {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freezePayload(child);
  }
}

/** Share accounting mechanics, never vendor request mapping or authentication. */
export function prepareWireChat<T extends object>(payload: T,
  send: (payload: T, auth: ProviderAuth) => Promise<ChatResponse>,
  options: {
    identity: string;
    outputTokens?: number;
    countTokens?: (payload: T, auth: ProviderAuth) => Promise<number>;
    alternatives?: object[];
  }): PreparedChatRequest {
  freezePayload(payload);
  for (const alternate of options.alternatives ?? []) freezePayload(alternate);
  const candidates = [payload, ...(options.alternatives ?? [])];
  const components = Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, estimateWireTokens(value)]));
  const accounting = Object.freeze({
    fingerprint: createHash("sha256").update(options.identity).update(JSON.stringify(candidates)).digest("hex"),
    inputTokens: Math.max(...candidates.map(estimateWireTokens)),
    bytes: Math.max(...candidates.map(candidate => Buffer.byteLength(JSON.stringify(candidate), "utf8"))),
    source: "estimated" as const,
    components: Object.freeze(components)
  });
  return Object.freeze({ accounting, outputTokens: options.outputTokens,
    ...(options.countTokens ? { countTokens: async (auth: ProviderAuth) => {
      const count = await options.countTokens!(payload, auth);
      if (!Number.isSafeInteger(count) || count < 0) throw new Error("Provider token count was invalid.");
      return count;
    } } : {}),
    send: async (auth: ProviderAuth) => {
      try { return await send(payload, auth); }
      catch (error) {
        if (isContextOverflow(error)) throw Object.assign(new Error("Provider rejected the input context size."), { code: "OPENASSIST_CONTEXT_OVERFLOW" });
        throw error;
      }
    }
  });
}

/** Deliberately narrow: rate limits, byte limits and output exhaustion are different failures. */
export function isContextOverflow(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { status?: number; code?: string; message?: string; error?: { code?: string; message?: string } };
  if (value.code === "context_length_exceeded" || value.error?.code === "context_length_exceeded") return true;
  return value.status === 400 && /context (?:window|length)|prompt is too long|input (?:is too long|exceeds.*token)/i.test(
    (value.error?.message ?? value.message ?? "").slice(0, 2048));
}
