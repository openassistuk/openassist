export function resolveEnvReference(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  if (!value.startsWith("env:")) {
    return value;
  }
  const varName = value.slice(4).trim();
  if (!varName) {
    return "";
  }
  return process.env[varName] ?? "";
}

export function resolveChannelSettings(
  settings: Record<string, string | number | boolean | string[]>
): Record<string, string | number | boolean | string[]> {
  const resolved: Record<string, string | number | boolean | string[]> = {};
  for (const [key, value] of Object.entries(settings)) {
    if (Array.isArray(value)) {
      resolved[key] = value.map((item) => String(resolveEnvReference(item)));
      continue;
    }
    resolved[key] = resolveEnvReference(value) as string | number | boolean | string[];
  }
  return resolved;
}
