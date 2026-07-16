import { env } from "cloudflare:workers";

export function getD1(): D1Database {
  if (!env.DB) throw new Error("Database binding is unavailable");
  return env.DB;
}

let initialized = false;

export async function ensureSchema() {
  if (initialized) return;
  const db = getD1();
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS families (id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL UNIQUE REFERENCES users(id), name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS family_members (id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id), user_id TEXT NOT NULL REFERENCES users(id), role TEXT NOT NULL DEFAULT 'parent', invited_by_user_id TEXT REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(family_id, user_id))"),
    db.prepare("CREATE TABLE IF NOT EXISTS parent_invites (id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id), invited_by_user_id TEXT NOT NULL REFERENCES users(id), code_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS children (id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id), name TEXT NOT NULL, age INTEGER NOT NULL, avatar TEXT NOT NULL DEFAULT '🧒🏻', nickname TEXT, pin_salt TEXT, pin_hash TEXT, daily_budget INTEGER NOT NULL DEFAULT 20000, weekly_budget INTEGER NOT NULL DEFAULT 100000, monthly_budget INTEGER NOT NULL DEFAULT 350000, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS invites (id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id), child_id TEXT NOT NULL REFERENCES children(id), code_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS child_sessions (token_hash TEXT PRIMARY KEY, child_id TEXT NOT NULL REFERENCES children(id), expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS transactions (id TEXT PRIMARY KEY, child_id TEXT NOT NULL REFERENCES children(id), actor_type TEXT NOT NULL, kind TEXT NOT NULL, amount INTEGER NOT NULL, category TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS savings_goals (id TEXT PRIMARY KEY, child_id TEXT NOT NULL REFERENCES children(id), name TEXT NOT NULL, target_amount INTEGER NOT NULL, saved_amount INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE INDEX IF NOT EXISTS children_family_idx ON children(family_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS family_members_user_idx ON family_members(user_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS transactions_child_created_idx ON transactions(child_id, created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS sessions_child_idx ON child_sessions(child_id)"),
    db.prepare("INSERT OR IGNORE INTO family_members (id, family_id, user_id, role) SELECT 'mbr_' || replace(id, 'fam_', ''), id, owner_user_id, 'owner' FROM families"),
  ]);
  initialized = true;
}

export function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function randomCode() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const value = Array.from(bytes, (byte) => letters[byte % letters.length]).join("");
  return `${value.slice(0, 4)}-${value.slice(4)}`;
}

export function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return toBase64Url(bytes);
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toBase64Url(new Uint8Array(digest));
}

export async function hashPin(pin: string, salt = randomToken().slice(0, 22)) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: 120_000 }, material, 256);
  return { salt, hash: toBase64Url(new Uint8Array(bits)) };
}

export async function verifyPin(pin: string, salt: string, expected: string) {
  const actual = (await hashPin(pin, salt)).hash;
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
