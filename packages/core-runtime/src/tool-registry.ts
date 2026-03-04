import type { ToolSchema } from "@openassist/core-types";

export function runtimeToolSchemas(): ToolSchema[] {
  return [
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
    },
    {
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
    }
  ];
}
