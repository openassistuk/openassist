import type { ToolSchema } from "@openassist/core-types";

export function runtimeToolSchemas(options?: {
  enablePackageTool?: boolean;
  enableWebTools?: boolean;
}): ToolSchema[] {
  const schemas: ToolSchema[] = [
    {
      name: "channel.send",
      description:
        "Return a user-requested local artifact through the current chat, or send a targeted notification to a specifically listed approved operator when that is genuinely required.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["mode", "reason"],
        properties: {
          mode: {
            type: "string",
            enum: ["reply", "notify"]
          },
          text: { type: "string" },
          attachmentPaths: {
            type: "array",
            items: { type: "string" }
          },
          channelId: { type: "string" },
          recipientUserId: { type: "string" },
          reason: { type: "string" }
        }
      }
    },
    {
      name: "exec.run",
      description: "Run a shell command on the local machine.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["command"],
        properties: {
          command: { type: "string" },
          timeoutMs: { type: "number" },
          cwd: { type: "string" },
          env: {
            type: "object",
            additionalProperties: { type: "string" }
          }
        }
      }
    },
    {
      name: "fs.read",
      description: "Read a UTF-8 text file.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["path"],
        properties: {
          path: { type: "string" }
        }
      }
    },
    {
      name: "fs.write",
      description: "Write UTF-8 text content to a file.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["path", "content"],
        properties: {
          path: { type: "string" },
          content: { type: "string" }
        }
      }
    },
    {
      name: "fs.delete",
      description: "Delete a file or directory.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["path"],
        properties: {
          path: { type: "string" },
          recursive: { type: "boolean" }
        }
      }
    }
  ];

  if (options?.enablePackageTool !== false) {
    schemas.push({
      name: "pkg.install",
      description:
        "Install packages using the local OS/package manager (apt, brew, dnf, npm, pnpm, pip, etc.).",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["packages"],
        properties: {
          packages: {
            type: "array",
            minItems: 1,
            items: { type: "string" }
          },
          manager: { type: "string" },
          global: { type: "boolean" },
          dev: { type: "boolean" },
          extraArgs: {
            type: "array",
            items: { type: "string" }
          },
          useSudo: { type: "boolean" }
        }
      }
    });
  }

  if (options?.enableWebTools !== false) {
    schemas.push(
      {
        name: "web.search",
        description:
          "Search the web using the configured runtime backend and return structured search results.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["query"],
          properties: {
            query: { type: "string" },
            limit: { type: "number" },
            domains: {
              type: "array",
              items: { type: "string" }
            }
          }
        }
      },
      {
        name: "web.fetch",
        description:
          "Fetch one HTTP or HTTPS page and return normalized extracted text with citations.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["url"],
          properties: {
            url: { type: "string" },
            format: {
              type: "string",
              enum: ["text", "excerpt"]
            },
            maxBytes: { type: "number" }
          }
        }
      },
      {
        name: "web.run",
        description:
          "Run a bounded web research pass using search and fetch, then return consolidated cited source material.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["objective"],
          properties: {
            objective: { type: "string" },
            query: { type: "string" },
            urls: {
              type: "array",
              items: { type: "string" }
            },
            searchLimit: { type: "number" },
            pageLimit: { type: "number" },
            domains: {
              type: "array",
              items: { type: "string" }
            }
          }
        }
      }
    );
  }

  return schemas;
}
