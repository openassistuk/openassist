import { describe, expect, it } from "vitest";
import type { PromptAdapter } from "../../apps/openassist-cli/src/lib/setup-wizard.js";
import {
  isCountryCityTimezone,
  isValidBindAddress,
  isValidIanaTimezone,
  promptIdentifier,
  promptInteger,
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

describe("prompt validation helpers", () => {
  it("re-prompts integer fields until valid", async () => {
    const prompts = new ScriptedPromptAdapter(["not-a-number", "42"]);
    const value = await promptInteger(prompts, "Number", 10, { min: 1, max: 100 });
    expect(value).toBe(42);
  });

  it("uses guided country/region -> city selection for timezone fields", async () => {
    const prompts = new ScriptedPromptAdapter(["Europe", "Europe/London"]);
    const timezone = await promptTimezone(prompts, "Timezone", "Europe/London");
    expect(timezone).toBe("Europe/London");
  });

  it("allows optional timezone override to remain unset in picker mode", async () => {
    const prompts = new ScriptedPromptAdapter(["__none__"]);
    const timezone = await promptOptionalTimezone(prompts, "Task timezone override", "");
    expect(timezone).toBeUndefined();
  });

  it("supports optional timezone override with guided picker", async () => {
    const prompts = new ScriptedPromptAdapter(["__pick__", "America", "America/New_York"]);
    const timezone = await promptOptionalTimezone(prompts, "Task timezone override", "");
    expect(timezone).toBe("America/New_York");
  });

  it("re-prompts invalid region selection in guided picker", async () => {
    const prompts = new ScriptedPromptAdapter(["NotARegion", "Europe", "Europe/Paris"]);
    const timezone = await promptTimezone(prompts, "Timezone", "Europe/London");
    expect(timezone).toBe("Europe/Paris");
  });

  it("supports optional picker compatibility mode for direct timezone and region values", async () => {
    const promptsDirect = new ScriptedPromptAdapter(["Europe/London"]);
    const direct = await promptOptionalTimezone(promptsDirect, "Task timezone override", "");
    expect(direct).toBe("Europe/London");

    const promptsRegion = new ScriptedPromptAdapter(["America", "America/Chicago"]);
    const fromRegion = await promptOptionalTimezone(promptsRegion, "Task timezone override", "");
    expect(fromRegion).toBe("America/Chicago");
  });

  it("covers input-only fallback timezone prompts", async () => {
    const requiredPrompts = new ScriptedInputOnlyPrompts(["", "UTC", "London"]);
    const timezone = await promptTimezone(requiredPrompts, "Timezone", "Europe/London");
    expect(timezone).toBe("Europe/London");

    const optionalPrompts = new ScriptedInputOnlyPrompts(["UTC", "America/New_York"]);
    const optionalTimezone = await promptOptionalTimezone(optionalPrompts, "Task timezone override", "");
    expect(optionalTimezone).toBe("America/New_York");

    const optionalBlankPrompts = new ScriptedInputOnlyPrompts([""]);
    const blank = await promptOptionalTimezone(optionalBlankPrompts, "Task timezone override", "");
    expect(blank).toBeUndefined();
  });

  it("re-prompts identifiers until valid", async () => {
    const prompts = new ScriptedPromptAdapter(["bad id with spaces", "telegram-main"]);
    const id = await promptIdentifier(prompts, "Identifier", "");
    expect(id).toBe("telegram-main");
  });

  it("validates bind address and timezone helpers", () => {
    expect(isValidBindAddress("127.0.0.1")).toBe(true);
    expect(isValidBindAddress("0.0.0.0")).toBe(true);
    expect(isValidBindAddress("localhost")).toBe(true);
    expect(isValidBindAddress("bad host ???")).toBe(false);

    expect(isValidIanaTimezone("UTC")).toBe(true);
    expect(isValidIanaTimezone("America/New_York")).toBe(true);
    expect(isValidIanaTimezone("Frederick")).toBe(false);

    expect(isCountryCityTimezone("America/New_York")).toBe(true);
    expect(isCountryCityTimezone("UTC")).toBe(false);
  });
});
