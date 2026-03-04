import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export interface SecretBoxOptions {
  dataDir: string;
  keyFromEnv?: string;
}

function toModeText(mode: number): string {
  return `0o${(mode & 0o777).toString(8).padStart(3, "0")}`;
}

function assertUnixOwnerOnlyPath(targetPath: string, kind: "file" | "directory"): void {
  if (process.platform === "win32") {
    return;
  }

  if (!fs.existsSync(targetPath)) {
    throw new Error(`Missing ${kind} path for permission check: ${targetPath}`);
  }
  const stat = fs.statSync(targetPath);
  if (kind === "file" && !stat.isFile()) {
    throw new Error(`Expected file path for permission check: ${targetPath}`);
  }
  if (kind === "directory" && !stat.isDirectory()) {
    throw new Error(`Expected directory path for permission check: ${targetPath}`);
  }

  const mode = stat.mode & 0o777;
  if ((mode & 0o077) !== 0) {
    throw new Error(
      `Insecure permissions on ${kind} '${targetPath}': ${toModeText(mode)}. ` +
        "Use owner-only permissions (no group/other access)."
    );
  }
}

function decodeStrictBase64Material(value: string): Buffer {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(
      "Secret key material is empty. Use OPENASSIST_SECRET_KEY=base64:<32-byte-key-base64>."
    );
  }

  const decoded = Buffer.from(normalized, "base64");
  const canonical = decoded.toString("base64");
  const normalizedNoPadding = normalized.replace(/=+$/g, "");
  const canonicalNoPadding = canonical.replace(/=+$/g, "");
  if (canonicalNoPadding !== normalizedNoPadding) {
    throw new Error(
      "Secret key material must be valid base64. Use OPENASSIST_SECRET_KEY=base64:<32-byte-key-base64>."
    );
  }
  if (decoded.length !== 32) {
    throw new Error(
      "Secret key material must decode to exactly 32 bytes. Use OPENASSIST_SECRET_KEY=base64:<32-byte-key-base64>."
    );
  }
  return decoded;
}

function parseKeyFromEnv(input: string): Buffer {
  const trimmed = input.trim();
  const material = trimmed.startsWith("base64:") ? trimmed.slice("base64:".length) : trimmed;
  return decodeStrictBase64Material(material);
}

function loadOrCreateFileKey(filePath: string): Buffer {
  const dirPath = path.dirname(filePath);
  fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") {
    fs.chmodSync(dirPath, 0o700);
    assertUnixOwnerOnlyPath(dirPath, "directory");
  }

  const key = crypto.randomBytes(32).toString("base64");
  let fd: number | undefined;
  try {
    fd = fs.openSync(
      filePath,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL,
      0o600
    );
    fs.writeFileSync(fd, key, "utf8");
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (fd !== undefined) {
      fs.closeSync(fd);
    }
    if (err.code !== "EEXIST") {
      throw error;
    }
    if (process.platform !== "win32") {
      assertUnixOwnerOnlyPath(filePath, "file");
    }
    const encoded = fs.readFileSync(filePath, "utf8").trim();
    return decodeStrictBase64Material(encoded);
  }

  if (fd !== undefined) {
    fs.closeSync(fd);
  }
  if (process.platform !== "win32") {
    fs.chmodSync(filePath, 0o600);
    assertUnixOwnerOnlyPath(filePath, "file");
  }
  return decodeStrictBase64Material(key);
}

export class SecretBox {
  private readonly key: Buffer;

  constructor(options: SecretBoxOptions) {
    const keyFromEnv = options.keyFromEnv ?? process.env.OPENASSIST_SECRET_KEY;
    if (keyFromEnv) {
      this.key = parseKeyFromEnv(keyFromEnv);
      return;
    }

    const keyPath = path.join(path.resolve(options.dataDir), "secrets.key");
    this.key = loadOrCreateFileKey(keyPath);
  }

  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [
      "v1",
      iv.toString("base64url"),
      tag.toString("base64url"),
      ciphertext.toString("base64url")
    ].join(":");
  }

  decrypt(ciphertext: string): string {
    const parts = ciphertext.split(":");
    if (parts.length !== 4 || parts[0] !== "v1") {
      throw new Error("Unsupported secret payload format");
    }

    const iv = Buffer.from(parts[1]!, "base64url");
    const tag = Buffer.from(parts[2]!, "base64url");
    const encrypted = Buffer.from(parts[3]!, "base64url");

    const decipher = crypto.createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return plaintext.toString("utf8");
  }
}
