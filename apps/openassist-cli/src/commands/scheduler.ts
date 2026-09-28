import { randomUUID } from "node:crypto";
import type { Command } from "commander";
import { detectDefaultDaemonBaseUrl, requestJson } from "../lib/runtime-context.js";

export function configureManagedSchedulerCommand(command: Command, action: "create" | "cancel" | "list"): void {
    const entry = command.description(`${action} managed one-shot reminders for an approved operator and chat`)
      .requiredOption("--actor <id>","Approved operator ID")
      .requiredOption("--channel <id>","Configured channel ID")
      .requiredOption("--conversation <key>","Conversation key")
      .option("--request-id <id>","Reuse this ID for safe request retries")
      .option("--base-url <url>","Daemon API base URL",detectDefaultDaemonBaseUrl());
    if (action === "create") entry.option("--at <timestamp>","ISO timestamp with timezone offset")
      .option("--delay-seconds <seconds>","Delay from command receipt")
      .option("--text <text>","Saved text; no model call")
      .option("--prompt <prompt>","Prompt to generate at the deadline; no tools");
    if (action === "cancel") entry.requiredOption("--id <id>","Durable task ID");
    entry.action(async options => {
      const receivedAt = new Date().toISOString();
      try {
        if (action === "create" && (options.text !== undefined) === (options.prompt !== undefined)) throw new Error("Choose exactly one of --text or --prompt.");
        const request = action === "create" ? {
          ...(options.at !== undefined ? { at: options.at } : {}),
          ...(options.delaySeconds !== undefined ? { delaySeconds: Number(options.delaySeconds) } : {}),
          action: options.text !== undefined ? { type: "text", text: options.text } : { type: "prompt", prompt: options.prompt }
        } : action === "cancel" ? { id: options.id } : {};
        const result = await requestJson("POST",`${String(options.baseUrl).replace(/\/+$/,"")}/v1/scheduler/${action}`,{
          actorId: options.actor, channelId: options.channel, conversationKey: options.conversation,
          requestId: options.requestId ?? randomUUID(), receivedAt, request
        });
        if (result.status >= 400) throw new Error(`Scheduler request failed (${result.status}): ${JSON.stringify(result.data)}`);
        console.log(JSON.stringify(result.data,null,2));
      } catch (error) {
        console.error(error instanceof Error ? error.message : "Scheduler request failed.");
        process.exitCode = 1;
      }
    });
}
