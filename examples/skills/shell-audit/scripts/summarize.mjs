export async function run(input) {
  const text = typeof input === "string" ? input : JSON.stringify(input, null, 2);
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const errorLines = lines.filter((line) => /error|fail|exception/i.test(line)).slice(0, 10);

  return {
    totalLines: lines.length,
    highlightedErrors: errorLines,
    summary:
      errorLines.length > 0
        ? `Found ${errorLines.length} high-signal error lines.`
        : "No obvious error lines detected."
  };
}