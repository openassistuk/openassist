import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PromptAdapter } from "../../apps/openassist-cli/src/lib/setup-wizard.js";
import {
  promptOptionalTimezone,
  promptTimezone
} from "../../apps/openassist-cli/src/lib/prompt-validation.js";

class ScriptedPromptAdapter implements PromptAdapter {
  private readonly queue: string[];

  constructor(values: string[]) {
    this.queue = [...values];
  }

  private next(): string {
    if (this.queue.length === 0) {
      throw new Error("No scripted value available");
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

class ScriptedInputOnlyPrompts {
  private readonly queue: string[];

  constructor(values: string[]) {
    this.queue = [...values];
  }

  private next(): string {
    if (this.queue.length === 0) {
      throw new Error("No scripted value available");
    }
    return this.queue.shift() ?? "";
  }

  async input(): Promise<string> {
    return this.next();
  }
}

describe("cli prompt validation coverage", () => {
  it("covers guided picker and compatibility branches", async () => {
    const required = new ScriptedPromptAdapter(["NotARegion", "Europe", "Europe/London"]);
    assert.equal(await promptTimezone(required, "Timezone", "Europe/London"), "Europe/London");

    const optionalUnset = new ScriptedPromptAdapter(["__none__"]);
    assert.equal(await promptOptionalTimezone(optionalUnset, "Task timezone override", ""), undefined);

    const optionalPick = new ScriptedPromptAdapter(["__pick__", "America", "America/New_York"]);
    assert.equal(await promptOptionalTimezone(optionalPick, "Task timezone override", ""), "America/New_York");

    const optionalDirect = new ScriptedPromptAdapter(["Europe/Paris"]);
    assert.equal(await promptOptionalTimezone(optionalDirect, "Task timezone override", ""), "Europe/Paris");

    const optionalRegionCompat = new ScriptedPromptAdapter(["America", "America/Chicago"]);
    assert.equal(await promptOptionalTimezone(optionalRegionCompat, "Task timezone override", ""), "America/Chicago");
  });

  it("covers input-only fallback branches", async () => {
    const required = new ScriptedInputOnlyPrompts(["", "UTC", "London"]);
    assert.equal(await promptTimezone(required, "Timezone", "Europe/London"), "Europe/London");

    const optional = new ScriptedInputOnlyPrompts(["UTC", "America/New_York"]);
    assert.equal(await promptOptionalTimezone(optional, "Task timezone override", ""), "America/New_York");
  });
});
