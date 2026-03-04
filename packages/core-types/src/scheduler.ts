export type ScheduleKind = "cron" | "interval";

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
