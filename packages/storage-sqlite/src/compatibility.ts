import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

export const DATABASE_VERSION = 1;

export function assertDatabaseVersion(db: DatabaseSync): void {
  const version = Number((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version);
  if (version !== 0 && version !== DATABASE_VERSION) {
    throw new Error(`Unsupported database schema ${version}; this build supports ${DATABASE_VERSION}. Restore a compatible application, not an older database.`);
  }
  if (version === 0) {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as {name: string}[];
    if (tables.length && !["sessions", "messages", "events", "jobs", "idempotency_keys"].every(name => tables.some(t => t.name === name))) {
      throw new Error("Unrecognized unversioned database; refusing automatic adoption.");
    }
  }
}

/** Read-only admission check: never initializes or changes an existing database. */
export function inspectDatabaseVersion(file: string): number {
  if (!fs.existsSync(file)) return DATABASE_VERSION;
  const db = new DatabaseSync(file, { readOnly: true });
  try { assertDatabaseVersion(db); return DATABASE_VERSION; }
  finally { db.close(); }
}

export function assertManagedTaskCompatibility(file: string, features: string[] = []): void {
  if (!fs.existsSync(file) || features.includes("managed-one-shots-v1")) return;
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='managed_one_shots'").get();
    if (tables && db.prepare("SELECT 1 FROM managed_one_shots WHERE state IN ('pending','executing','ready','delivering') LIMIT 1").get()) {
      throw new Error("Application lacks managed one-shot support. Complete or cancel active reminders and wait for in-flight dispatch before rollback; state will not be downgraded.");
    }
  } finally { db.close(); }
}
