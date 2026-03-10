export type ParsedOAuthCompletionInput = Record<string, unknown> & {
  code: string;
  state: string;
  callbackUrl?: string;
};

function stripWrappedWhitespace(value: string): string {
  return value.replace(/\s+/g, "");
}

export function parseOAuthCompletionInput(
  rawInput: string,
  fallbackState: string
): ParsedOAuthCompletionInput | null {
  const trimmed = rawInput.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const compact = stripWrappedWhitespace(trimmed);
  if (compact.startsWith("http://") || compact.startsWith("https://")) {
    try {
      const parsed = new URL(compact);
      const code = parsed.searchParams.get("code")?.trim();
      if (code) {
        return {
          code,
          state: parsed.searchParams.get("state")?.trim() || fallbackState,
          callbackUrl: parsed.toString()
        };
      }
    } catch {
      // Fall through to raw code parsing below.
    }
  }

  return {
    code: compact,
    state: fallbackState
  };
}
