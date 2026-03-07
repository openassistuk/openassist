import type { OutboundEnvelope } from "@openassist/core-types";

export interface RenderedOutboundChunk {
  text: string;
  metadata: Record<string, string>;
}

interface RenderContext {
  maxLength: number;
  renderBlock: (block: MessageBlock) => string;
}

interface MessageBlock {
  type: "code" | "text";
  lines: string[];
}

function renderCodeChunk(
  language: string,
  payload: string,
  renderBlock: (block: MessageBlock) => string
): string {
  return renderBlock({
    type: "code",
    lines: [`\`\`\`${language}`.trim(), payload, "```"]
  }).trim();
}

function splitOversizedCodeBlock(block: MessageBlock, context: RenderContext): string[] {
  const language = block.lines[0]?.trim().slice(3) ?? "";
  let remaining = block.lines
    .filter((line, index) => {
      if (index === 0 && line.trim().startsWith("```")) {
        return false;
      }
      if (index === block.lines.length - 1 && line.trim() === "```") {
        return false;
      }
      return true;
    })
    .join("\n");

  const chunks: string[] = [];
  while (remaining.length > 0) {
    let low = 1;
    let high = remaining.length;
    let best = 0;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const candidate = renderCodeChunk(language, remaining.slice(0, mid), context.renderBlock);
      if (candidate.length <= context.maxLength) {
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const safeLength = Math.max(1, best);
    chunks.push(renderCodeChunk(language, remaining.slice(0, safeLength), context.renderBlock));
    remaining = remaining.slice(safeLength);
  }

  return chunks;
}

function splitBlocks(text: string): MessageBlock[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length === 0) {
    return [{ type: "text", lines: [""] }];
  }

  const lines = normalized.split("\n");
  const blocks: MessageBlock[] = [];
  let current: string[] = [];
  let inCode = false;

  const flushText = (): void => {
    if (current.length === 0) {
      return;
    }
    blocks.push({
      type: inCode ? "code" : "text",
      lines: [...current]
    });
    current = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      if (inCode) {
        current.push(line);
        flushText();
        inCode = false;
      } else {
        flushText();
        inCode = true;
        current.push(line);
      }
      continue;
    }

    if (!inCode && trimmed.length === 0) {
      flushText();
      continue;
    }

    current.push(line);
  }

  flushText();
  return blocks;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderTelegramInline(text: string): string {
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*/g;
  let cursor = 0;
  let output = "";

  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    output += escapeHtml(text.slice(cursor, start));
    if (match[1] && match[2]) {
      output += `<a href="${escapeHtml(match[2])}">${escapeHtml(match[1])}</a>`;
    } else if (match[3]) {
      output += `<code>${escapeHtml(match[3])}</code>`;
    } else if (match[4]) {
      output += `<b>${escapeHtml(match[4])}</b>`;
    }
    cursor = start + match[0].length;
  }

  output += escapeHtml(text.slice(cursor));
  return output;
}

function renderTelegramBlock(block: MessageBlock): string {
  if (block.type === "code") {
    const lines = [...block.lines];
    if (lines[0]?.trim().startsWith("```")) {
      lines.shift();
    }
    if (lines[lines.length - 1]?.trim() === "```") {
      lines.pop();
    }
    return `<pre><code>${escapeHtml(lines.join("\n"))}</code></pre>`;
  }

  return block.lines
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        return "";
      }
      const heading = trimmed.match(/^#{1,6}\s+(.+)$/);
      if (heading) {
        return `<b>${renderTelegramInline(heading[1] ?? trimmed)}</b>`;
      }
      const bullet = trimmed.match(/^[-*]\s+(.+)$/);
      if (bullet) {
        return `• ${renderTelegramInline(bullet[1] ?? trimmed)}`;
      }
      const numbered = trimmed.match(/^(\d+)\.\s+(.+)$/);
      if (numbered) {
        return `${numbered[1]}. ${renderTelegramInline(numbered[2] ?? trimmed)}`;
      }
      return renderTelegramInline(line);
    })
    .join("\n");
}

function renderDiscordBlock(block: MessageBlock): string {
  if (block.type === "code") {
    return block.lines.join("\n");
  }

  return block.lines
    .map((line) => {
      const trimmed = line.trim();
      const heading = trimmed.match(/^#{1,6}\s+(.+)$/);
      if (heading) {
        return `**${heading[1] ?? trimmed}**`;
      }
      return line;
    })
    .join("\n");
}

function renderWhatsAppBlock(block: MessageBlock): string {
  if (block.type === "code") {
    return block.lines.join("\n");
  }

  return block.lines
    .map((line) => {
      const trimmed = line.trim();
      const heading = trimmed.match(/^#{1,6}\s+(.+)$/);
      if (heading) {
        return `*${heading[1] ?? trimmed}*`;
      }
      const link = trimmed.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
      if (link) {
        return `${link[1]} (${link[2]})`;
      }
      return line;
    })
    .join("\n");
}

function splitRenderedBlocks(blocks: MessageBlock[], context: RenderContext): string[] {
  const chunks: string[] = [];
  let current = "";

  const pushCurrent = (): void => {
    if (current.trim().length > 0) {
      chunks.push(current.trim());
      current = "";
    }
  };

  for (const block of blocks) {
    const renderedBlock = context.renderBlock(block).trim();
    if (renderedBlock.length === 0) {
      continue;
    }

    if (renderedBlock.length > context.maxLength) {
      pushCurrent();
      if (block.type === "code") {
        chunks.push(...splitOversizedCodeBlock(block, context));
        continue;
      }

      let remaining = renderedBlock;
      while (remaining.length > context.maxLength) {
        const slice = remaining.slice(0, context.maxLength);
        const breakIndex = Math.max(slice.lastIndexOf("\n"), slice.lastIndexOf(". "));
        const cutAt = breakIndex > 200 ? breakIndex + (slice[breakIndex] === "\n" ? 0 : 1) : context.maxLength;
        chunks.push(remaining.slice(0, cutAt).trim());
        remaining = remaining.slice(cutAt).trimStart();
      }
      if (remaining.length > 0) {
        chunks.push(remaining);
      }
      continue;
    }

    const candidate = current.length === 0 ? renderedBlock : `${current}\n\n${renderedBlock}`;
    if (candidate.length > context.maxLength) {
      pushCurrent();
      current = renderedBlock;
    } else {
      current = candidate;
    }
  }

  pushCurrent();
  return chunks.length > 0 ? chunks : [""];
}

export function renderOutboundText(
  channelType: string,
  text: string,
  metadata: Record<string, string>
): RenderedOutboundChunk[] {
  const blocks = splitBlocks(text);
  if (channelType === "telegram") {
    return splitRenderedBlocks(blocks, {
      maxLength: 3800,
      renderBlock: renderTelegramBlock
    }).map((chunk) => ({
      text: chunk,
      metadata: {
        ...metadata,
        renderFormat: "telegram-html"
      }
    }));
  }

  if (channelType === "discord") {
    return splitRenderedBlocks(blocks, {
      maxLength: 1800,
      renderBlock: renderDiscordBlock
    }).map((chunk) => ({
      text: chunk,
      metadata
    }));
  }

  return splitRenderedBlocks(blocks, {
    maxLength: 3200,
    renderBlock: renderWhatsAppBlock
  }).map((chunk) => ({
    text: chunk,
    metadata
  }));
}

export function renderOutboundEnvelope(outbound: OutboundEnvelope): Array<OutboundEnvelope> {
  const chunks = renderOutboundText(outbound.channel, outbound.text, outbound.metadata);
  return chunks.map((chunk, index) => ({
    ...outbound,
    text: chunk.text,
    replyToTransportMessageId: index === 0 ? outbound.replyToTransportMessageId : undefined,
    metadata: chunk.metadata
  }));
}
