import type { OpenAssistConfig } from "@openassist/config";
import type { ServiceManagerKind } from "./install-state.js";
import { detectSetupAccessMode, getOperatorUserIds } from "./setup-access.js";
import type { SetupValidationIssue } from "./setup-validation.js";

export type LifecycleSimpleReadiness = "ready" | "needs-action";
export type UpgradeReadiness = "safe-to-continue" | "fix-before-updating" | "rerun-bootstrap";
export type LifecycleRepairBucketId =
  | "provider-auth"
  | "channel-auth-routing"
  | "timezone-time"
  | "service-health"
  | "access-operator-ids";

export interface LifecycleReportItem {
  id: string;
  label: string;
  detail: string;
  reason?: string;
  nextStep?: string;
}

export interface LifecycleRepairBucket {
  id: LifecycleRepairBucketId;
  label: string;
  issues: SetupValidationIssue[];
}

export interface LifecycleReportSummary {
  installReadiness: LifecycleSimpleReadiness;
  firstReplyReadiness: LifecycleSimpleReadiness;
  serviceReadiness: LifecycleSimpleReadiness;
  accessModeReadiness: LifecycleSimpleReadiness;
  upgradeReadiness: UpgradeReadiness;
}

export interface LifecycleRecommendedAction {
  kind:
    | "run-quickstart"
    | "repair-first-reply"
    | "repair-full-access"
    | "rerun-bootstrap"
    | "upgrade-dry-run";
  command: string;
}

export interface LifecycleReport {
  version: 1;
  summary: LifecycleReportSummary;
  context: {
    installDir: string;
    configPath: string;
    envFilePath: string;
    firstReplyDestination: string;
    accessMode: string;
    serviceState: string;
    updateTrack: string;
  };
  sections: {
    readyNow: LifecycleReportItem[];
    needsActionBeforeFirstReply: LifecycleReportItem[];
    needsActionBeforeFullAccess: LifecycleReportItem[];
    needsActionBeforeUpgrade: LifecycleReportItem[];
  };
  recommendedNextCommand: LifecycleRecommendedAction;
}

export interface LifecycleReportInput {
  installDir: string;
  configPath: string;
  envFilePath: string;
  installStatePresent: boolean;
  repoBacked: boolean;
  configExists: boolean;
  envExists: boolean;
  repoUrl?: string;
  trackedRef?: string;
  currentCommit?: string;
  detectedTimezone?: string;
  config?: OpenAssistConfig;
  serviceManagerKind?: ServiceManagerKind | "skipped" | "unsupported";
  serviceInstalled?: boolean;
  serviceHealthOk?: boolean;
  serviceHealthDetail?: string;
  validationErrors?: SetupValidationIssue[];
  validationWarnings?: SetupValidationIssue[];
  hasGit?: boolean;
  hasPnpm?: boolean;
  hasNode?: boolean;
  daemonBuildExists?: boolean;
  dirtyWorkingTree?: boolean;
  localWrapperAvailable?: boolean;
  localWrapperCommand?: string;
  growth?: {
    skillsDirectory: string;
    helperToolsDirectory: string;
    installedSkillCount: number;
    managedHelperCount: number;
    installedSkillIds?: string[];
    managedHelperIds?: string[];
    updateSafetyNote: string;
  };
  bootstrapMode?: "interactive" | "non-interactive";
  onboardingWasRun?: boolean;
  serviceWasSkipped?: boolean;
  prereqAutoInstallDisabled?: boolean;
  dirtyCheckoutAllowed?: boolean;
}

function describeAccessMode(config?: OpenAssistConfig): string {
  if (!config) {
    return "Not configured yet";
  }
  const mode = detectSetupAccessMode(config);
  if (mode === "full-access") {
    return "Full access for approved operators";
  }
  if (mode === "custom") {
    return "Custom advanced access settings";
  }
  return "Standard mode (recommended)";
}

function describeFirstReplyDestination(config?: OpenAssistConfig): string {
  if (!config) {
    return "Quickstart has not configured a primary chat destination yet";
  }

  const primaryChannel = config.runtime.channels.find((channel) => channel.enabled);
  if (!primaryChannel) {
    return "Quickstart still needs one enabled channel for the first reply";
  }

  if (primaryChannel.type === "telegram") {
    return `Telegram via ${primaryChannel.id}`;
  }
  if (primaryChannel.type === "discord") {
    return `Discord via ${primaryChannel.id}`;
  }
  return `WhatsApp via ${primaryChannel.id}`;
}

function describeServiceState(
  serviceWasSkipped: boolean | undefined,
  serviceHealthOk: boolean | undefined,
  serviceInstalled: boolean | undefined
): string {
  if (serviceWasSkipped) {
    return "Service checks skipped";
  }
  if (serviceHealthOk) {
    return "Service healthy";
  }
  if (serviceInstalled === false) {
    return "Service not installed yet";
  }
  if (serviceHealthOk === false) {
    return "Service needs attention";
  }
  return "Service state not confirmed yet";
}

function createItem(
  id: string,
  label: string,
  detail: string,
  reason?: string,
  nextStep?: string
): LifecycleReportItem {
  return { id, label, detail, ...(reason ? { reason } : {}), ...(nextStep ? { nextStep } : {}) };
}

function mapIssueToBucketId(issue: SetupValidationIssue): LifecycleRepairBucketId {
  if (issue.code.startsWith("provider.")) {
    return "provider-auth";
  }
  if (issue.code.startsWith("tools.web_")) {
    return "provider-auth";
  }
  if (issue.code.startsWith("channel.")) {
    return "channel-auth-routing";
  }
  if (issue.code.startsWith("access.")) {
    return "access-operator-ids";
  }
  if (issue.code.startsWith("time.")) {
    return "timezone-time";
  }
  if (
    issue.code.startsWith("service.") ||
    issue.code.startsWith("runtime.") ||
    issue.code.startsWith("paths.") ||
    issue.code.startsWith("config.") ||
    issue.code.startsWith("tools.")
  ) {
    return "service-health";
  }
  return "service-health";
}

function bucketLabel(id: LifecycleRepairBucketId): string {
  if (id === "provider-auth") {
    return "Provider auth";
  }
  if (id === "channel-auth-routing") {
    return "Channel auth or routing";
  }
  if (id === "timezone-time") {
    return "Timezone or time";
  }
  if (id === "access-operator-ids") {
    return "Access or operator IDs";
  }
  return "Service or health";
}

export function groupValidationIssuesByLifecycleBucket(
  issues: SetupValidationIssue[]
): LifecycleRepairBucket[] {
  const grouped = new Map<LifecycleRepairBucketId, SetupValidationIssue[]>();
  for (const issue of issues) {
    const bucket = mapIssueToBucketId(issue);
    const list = grouped.get(bucket);
    if (list) {
      list.push(issue);
      continue;
    }
    grouped.set(bucket, [issue]);
  }

  const orderedIds: LifecycleRepairBucketId[] = [
    "provider-auth",
    "channel-auth-routing",
    "timezone-time",
    "service-health",
    "access-operator-ids"
  ];
  return orderedIds
    .filter((id) => grouped.has(id))
    .map((id) => ({
      id,
      label: bucketLabel(id),
      issues: grouped.get(id) ?? []
    }));
}

function appendBucketIssues(
  target: LifecycleReportItem[],
  prefix: string,
  buckets: LifecycleRepairBucket[]
): void {
  for (const bucket of buckets) {
    const detail = bucket.issues.map((issue) => issue.message).join(" ");
    const nextStep = bucket.issues
      .map((issue) => issue.hint)
      .find((hint): hint is string => typeof hint === "string" && hint.trim().length > 0);
    target.push(createItem(`${prefix}.${bucket.id}`, bucket.label, detail, undefined, nextStep));
  }
}

function buildUpgradeBlockerItems(input: LifecycleReportInput): {
  items: LifecycleReportItem[];
  readiness: UpgradeReadiness;
} {
  const items: LifecycleReportItem[] = [];
  if (!input.repoBacked) {
    items.push(
      createItem(
        "upgrade.repo-backed-required",
        "Repo-backed install",
        "This install directory is missing its Git checkout, so in-place update is not safe here.",
        "OpenAssist upgrade only works against the tracked repository checkout.",
        `Re-run bootstrap for this install directory: scripts/install/bootstrap.sh --install-dir "${input.installDir}"`
      )
    );
    return { items, readiness: "rerun-bootstrap" };
  }

  if (!input.daemonBuildExists) {
    items.push(
      createItem(
        "upgrade.build-output-missing",
        "Built daemon output",
        "The daemon build output is missing from this install, so upgrade should hand back to bootstrap instead of guessing.",
        undefined,
        `Re-run bootstrap to rebuild this install: scripts/install/bootstrap.sh --install-dir "${input.installDir}"`
      )
    );
    return { items, readiness: "rerun-bootstrap" };
  }

  if (input.hasGit === false || input.hasPnpm === false || input.hasNode === false) {
    items.push(
      createItem(
        "upgrade.prerequisites",
        "Update prerequisites",
        `Required commands must be available before updating (git=${input.hasGit !== false ? "ok" : "missing"}, pnpm=${input.hasPnpm !== false ? "ok" : "missing"}, node=${input.hasNode !== false ? "ok" : "missing"}).`,
        undefined,
        "Install the missing command, then rerun: openassist doctor"
      )
    );
  }

  if (!input.configExists) {
    items.push(
      createItem(
        "upgrade.config",
        "Config file",
        "OpenAssist cannot verify the active install without the main config file.",
        undefined,
        `Finish setup first: openassist setup quickstart --install-dir "${input.installDir}" --config "${input.configPath}" --env-file "${input.envFilePath}"`
      )
    );
  }

  if (input.dirtyWorkingTree) {
    items.push(
      createItem(
        "upgrade.local-changes",
        "Local code changes",
        "The install directory has uncommitted changes, so upgrade would stop to avoid overwriting local work.",
        undefined,
        "Commit or stash the local changes, then rerun: openassist upgrade --dry-run"
      )
    );
  }

  return {
    items,
    readiness: items.length > 0 ? "fix-before-updating" : "safe-to-continue"
  };
}

function uniquePush(target: LifecycleReportItem[], item: LifecycleReportItem): void {
  if (target.some((existing) => existing.id === item.id)) {
    return;
  }
  target.push(item);
}

export function buildLifecycleReport(input: LifecycleReportInput): LifecycleReport {
  const readyNow: LifecycleReportItem[] = [];
  const needsActionBeforeFirstReply: LifecycleReportItem[] = [];
  const needsActionBeforeFullAccess: LifecycleReportItem[] = [];
  const validationErrors = input.validationErrors ?? [];
  const validationWarnings = input.validationWarnings ?? [];
  const firstReplyBuckets = groupValidationIssuesByLifecycleBucket(
    validationErrors.filter((issue) => {
      const bucket = mapIssueToBucketId(issue);
      return bucket !== "access-operator-ids";
    })
  );
  const accessBuckets = groupValidationIssuesByLifecycleBucket(
    validationErrors.filter((issue) => mapIssueToBucketId(issue) === "access-operator-ids")
  );
  const accessWarnings = groupValidationIssuesByLifecycleBucket(
    validationWarnings.filter((issue) => mapIssueToBucketId(issue) === "access-operator-ids")
  );

  readyNow.push(
    createItem(
      "install.location",
      "Install location",
      `${input.installDir}${input.repoBacked ? " (repo-backed checkout)" : ""}`
    )
  );
  readyNow.push(createItem("config.path", "Config path", input.configPath));
  readyNow.push(createItem("env.path", "Env path", input.envFilePath));

  if (input.installStatePresent) {
    uniquePush(
      readyNow,
      createItem("install.record", "Install record", "Install state is present and readable.")
    );
  }
  if (input.trackedRef?.trim()) {
    uniquePush(readyNow, createItem("install.track", "Update track", input.trackedRef.trim()));
  }
  if (input.currentCommit?.trim()) {
    uniquePush(readyNow, createItem("install.commit", "Current commit", input.currentCommit.trim()));
  }
  if (input.detectedTimezone?.trim()) {
    uniquePush(readyNow, createItem("runtime.timezone", "Detected timezone", input.detectedTimezone.trim()));
  }
  if (input.growth) {
    uniquePush(
      readyNow,
      createItem(
        "growth.assets",
        "Managed growth assets",
        `skills=${input.growth.installedSkillCount}${input.growth.installedSkillIds && input.growth.installedSkillIds.length > 0 ? ` (${input.growth.installedSkillIds.join(", ")})` : ""}; helpers=${input.growth.managedHelperCount}${input.growth.managedHelperIds && input.growth.managedHelperIds.length > 0 ? ` (${input.growth.managedHelperIds.join(", ")})` : ""}`
      )
    );
    uniquePush(
      readyNow,
      createItem(
        "growth.directories",
        "Managed growth directories",
        `skills=${input.growth.skillsDirectory}; helpers=${input.growth.helperToolsDirectory}`
      )
    );
    uniquePush(
      readyNow,
      createItem(
        "growth.update-safety",
        "Managed growth update safety",
        input.growth.updateSafetyNote
      )
    );
  }
  if (input.localWrapperAvailable) {
    uniquePush(
      readyNow,
      createItem("wrappers.path", "CLI wrapper", "This shell can already run 'openassist'.")
    );
  } else if (input.localWrapperCommand) {
    uniquePush(
      needsActionBeforeFirstReply,
      createItem(
        "wrappers.path",
        "CLI wrapper",
        "This shell does not see 'openassist' on PATH yet.",
        "Start a new shell, or use the fallback wrapper directly for the next command.",
        input.localWrapperCommand
      )
    );
  }

  if (!input.configExists) {
    uniquePush(
      needsActionBeforeFirstReply,
      createItem(
        "setup.quickstart",
        "First-run setup",
        "Quickstart has not written the main config yet, so OpenAssist is not ready for a first reply.",
        undefined,
        `openassist setup quickstart --install-dir "${input.installDir}" --config "${input.configPath}" --env-file "${input.envFilePath}"`
      )
    );
  } else {
    uniquePush(
      readyNow,
      createItem("first-reply.destination", "First reply destination", describeFirstReplyDestination(input.config))
    );
    uniquePush(
      readyNow,
      createItem("access.mode", "Access mode", describeAccessMode(input.config))
    );
  }

  if (!input.envExists && input.configExists) {
    uniquePush(
      needsActionBeforeFirstReply,
      createItem(
        "setup.env",
        "Env file",
        "The env file is missing, so provider or channel secrets may not be available at runtime.",
        undefined,
        `openassist setup quickstart --install-dir "${input.installDir}" --config "${input.configPath}" --env-file "${input.envFilePath}"`
      )
    );
  }

  appendBucketIssues(needsActionBeforeFirstReply, "first-reply", firstReplyBuckets);
  appendBucketIssues(needsActionBeforeFullAccess, "full-access", accessBuckets);
  appendBucketIssues(needsActionBeforeFullAccess, "full-access-warning", accessWarnings);

  const enabledChannels = input.config?.runtime.channels.filter((channel) => channel.enabled) ?? [];
  const operatorReadyChannels = enabledChannels.filter((channel) => getOperatorUserIds(channel).length > 0);
  if (input.config && input.config.runtime.operatorAccessProfile === "full-root" && operatorReadyChannels.length > 0) {
    uniquePush(
      readyNow,
      createItem(
        "full-access.operators",
        "Approved operators",
        operatorReadyChannels.map((channel) => `${channel.id}=${getOperatorUserIds(channel).length}`).join(", ")
      )
    );
  }

  if (input.serviceManagerKind && input.serviceManagerKind !== "skipped") {
    uniquePush(
      readyNow,
      createItem(
        "service.manager",
        "Service manager",
        input.serviceInstalled === undefined
          ? input.serviceManagerKind
          : `${input.serviceManagerKind} / installed=${input.serviceInstalled ? "yes" : "no"}`
      )
    );
  }

  if (input.serviceWasSkipped) {
    uniquePush(
      needsActionBeforeFirstReply,
      createItem(
        "service.skipped",
        "Service and health checks",
        "Bootstrap or quickstart skipped service install/restart checks, so first reply readiness is not confirmed yet.",
        undefined,
        `openassist service install --install-dir "${input.installDir}" --config "${input.configPath}" --env-file "${input.envFilePath}"`
      )
    );
  } else if (input.serviceHealthOk) {
    uniquePush(
      readyNow,
      createItem(
        "service.health",
        "Service health",
        input.serviceHealthDetail ?? "Daemon health checks passed."
      )
    );
  } else if (input.serviceHealthOk === false) {
    uniquePush(
      needsActionBeforeFirstReply,
      createItem(
        "service.health",
        "Service health",
        input.serviceHealthDetail ?? "Daemon health checks still need attention before the first reply path is trustworthy.",
        undefined,
        "Run: openassist service health"
      )
    );
  }

  if (input.bootstrapMode === "non-interactive" && input.onboardingWasRun === false) {
    uniquePush(
      needsActionBeforeFirstReply,
      createItem(
        "bootstrap.non-interactive",
        "Interactive onboarding",
        "Bootstrap stopped in non-interactive mode before quickstart onboarding ran.",
        undefined,
        `openassist setup quickstart --install-dir "${input.installDir}" --config "${input.configPath}" --env-file "${input.envFilePath}"`
      )
    );
  }

  if (input.prereqAutoInstallDisabled) {
    uniquePush(
      readyNow,
      createItem(
        "bootstrap.prereqs",
        "Prerequisite install policy",
        "Bootstrap left prerequisite installation under operator control because auto-install was disabled."
      )
    );
  }
  if (input.dirtyCheckoutAllowed) {
    uniquePush(
      readyNow,
      createItem(
        "bootstrap.dirty",
        "Dirty checkout policy",
        "Bootstrap was allowed to proceed with local code changes in the checkout."
      )
    );
  }

  const { items: upgradeItems, readiness: upgradeReadiness } = buildUpgradeBlockerItems(input);

  const recommendedNextCommand: LifecycleRecommendedAction = upgradeReadiness === "rerun-bootstrap"
    ? {
        kind: "rerun-bootstrap",
        command: `scripts/install/bootstrap.sh --install-dir "${input.installDir}"`
      }
    : !input.configExists
      ? {
          kind: "run-quickstart",
          command: `openassist setup quickstart --install-dir "${input.installDir}" --config "${input.configPath}" --env-file "${input.envFilePath}"`
        }
      : needsActionBeforeFirstReply.length > 0
        ? {
            kind: "repair-first-reply",
            command: "openassist doctor"
          }
        : needsActionBeforeFullAccess.length > 0
          ? {
              kind: "repair-full-access",
              command: "openassist setup wizard"
            }
          : {
              kind: "upgrade-dry-run",
              command: `openassist upgrade --dry-run --install-dir "${input.installDir}"`
            };

  return {
    version: 1,
    summary: {
      installReadiness:
        input.repoBacked && input.configExists && input.hasNode !== false ? "ready" : "needs-action",
      firstReplyReadiness: needsActionBeforeFirstReply.length === 0 ? "ready" : "needs-action",
      serviceReadiness:
        input.serviceWasSkipped || input.serviceHealthOk === false ? "needs-action" : "ready",
      accessModeReadiness: needsActionBeforeFullAccess.length === 0 ? "ready" : "needs-action",
      upgradeReadiness
    },
    context: {
      installDir: input.installDir,
      configPath: input.configPath,
      envFilePath: input.envFilePath,
      firstReplyDestination: describeFirstReplyDestination(input.config),
      accessMode: describeAccessMode(input.config),
      serviceState: describeServiceState(input.serviceWasSkipped, input.serviceHealthOk, input.serviceInstalled),
      updateTrack: input.trackedRef?.trim() || "main"
    },
    sections: {
      readyNow,
      needsActionBeforeFirstReply,
      needsActionBeforeFullAccess,
      needsActionBeforeUpgrade: upgradeItems
    },
    recommendedNextCommand
  };
}

function renderItem(item: LifecycleReportItem): string {
  const segments = [item.label, item.detail];
  if (item.reason) {
    segments.push(`Why: ${item.reason}`);
  }
  if (item.nextStep) {
    segments.push(`Next step: ${item.nextStep}`);
  }
  return `- ${segments.join(". ")}`;
}

function renderSection(title: string, items: LifecycleReportItem[]): string[] {
  const lines = [title];
  if (items.length === 0) {
    lines.push("- None.");
    return lines;
  }
  for (const item of items) {
    lines.push(renderItem(item));
  }
  return lines;
}

export function renderLifecycleReport(report: LifecycleReport, heading = "OpenAssist lifecycle doctor"): string[] {
  return [
    heading,
    ...renderSection("Ready now", report.sections.readyNow),
    ...renderSection("Needs action before first reply", report.sections.needsActionBeforeFirstReply),
    ...renderSection("Needs action before full access", report.sections.needsActionBeforeFullAccess),
    ...renderSection("Needs action before upgrade", report.sections.needsActionBeforeUpgrade),
    "Recommended next command",
    `- ${report.recommendedNextCommand.command}`
  ];
}

export function renderGroupedValidationBuckets(buckets: LifecycleRepairBucket[]): string[] {
  const lines: string[] = [];
  for (const bucket of buckets) {
    lines.push(`${bucket.label}:`);
    for (const issue of bucket.issues) {
      lines.push(`- ${issue.message}${issue.hint ? ` Next step: ${issue.hint}` : ""}`);
    }
  }
  return lines;
}

export function serviceHealthRecoveryLines(baseUrl: string): string[] {
  return [
    "Check service state: openassist service status",
    "Inspect service logs: openassist service logs --lines 200 --follow",
    "Verify daemon health: openassist service health",
    `Raw health endpoint: curl -fsS ${baseUrl.replace(/\/+$/, "")}/v1/health`
  ];
}
