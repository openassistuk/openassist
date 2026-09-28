export type ScheduleKind = "cron" | "interval";

export interface OneShotOwner {
  actorId: string;
  channelId: string;
  conversationKey: string;
}

export type OneShotState = "pending" | "executing" | "ready" | "delivering" | "delivered" | "cancelled" | "failed" | "uncertain";
export type OneShotAction = { type: "text"; text: string } | { type: "prompt"; prompt: string };
export interface OneShotRequest {
  at?: string;
  delaySeconds?: number;
  action: OneShotAction;
}
export interface OneShotTask extends OneShotOwner {
  id: string;
  requestKey: string;
  scheduledFor: string;
  timezone: string;
  action: OneShotAction;
  state: OneShotState;
  createdAt: string;
  startedAt?: string;
  attempts: number;
  runAfter: string;
  note?: string;
}

export const ONE_SHOT_LIMITS = { actionChars: 8000, activePerActor: 32, activeTotal: 256, listing: 50, perTick: 8, attempts: 3 } as const;

export type MisfirePolicy = "catch-up-once" | "skip" | "backfill";

export type NtpPolicy = "warn-degrade" | "hard-fail" | "off";

export interface TimeConfig {
  defaultTimezone?: string;
  ntpPolicy: NtpPolicy;
  ntpCheckIntervalSec: number;
  ntpMaxSkewMs: number;
  ntpHttpSources: string[];
  requireTimezoneConfirmation: boolean;
}

export interface ScheduledPromptAction {
  type: "prompt";
  providerId?: string;
  model?: string;
  promptTemplate: string;
  metadata?: Record<string, string>;
}

export interface ScheduledSkillAction {
  type: "skill";
  skillId: string;
  entrypoint: string;
  input?: Record<string, unknown>;
}

export type ScheduledActionConfig = ScheduledPromptAction | ScheduledSkillAction;

export interface ScheduledOutputConfig {
  channelId?: string;
  conversationKey?: string;
  messageTemplate?: string;
}

export interface ScheduledTaskConfig {
  id: string;
  enabled: boolean;
  scheduleKind: ScheduleKind;
  cron?: string;
  intervalSec?: number;
  timezone?: string;
  misfirePolicy?: MisfirePolicy;
  maxRuntimeSec?: number;
  action: ScheduledActionConfig;
  output?: ScheduledOutputConfig;
}

export interface SchedulerConfig {
  enabled: boolean;
  tickIntervalMs: number;
  heartbeatIntervalSec: number;
  defaultMisfirePolicy: MisfirePolicy;
  tasks: ScheduledTaskConfig[];
}

export interface TimeStatus {
  timezone: string;
  timezoneConfirmed: boolean;
  clockHealth: "healthy" | "degraded" | "unhealthy";
  lastClockCheckAt?: string;
  lastClockOffsetMs?: number;
  lastClockCheckSource?: string;
  ntpPolicy: NtpPolicy;
}
