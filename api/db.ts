import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DATABASE_URL } from "./config.js";

const { Pool } = pg;

let pool: InstanceType<typeof Pool> | null = null;

export function resolveSsl(connectionString: string): { rejectUnauthorized: boolean } | undefined {
  let sslmode: string | null;
  try {
    sslmode = new URL(connectionString).searchParams.get("sslmode");
  } catch {
    return undefined;
  }
  if (!sslmode || sslmode === "disable") return undefined;
  return { rejectUnauthorized: false };
}

export function resolveConnectionString(connectionString: string): string {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    return connectionString;
  }
  const sslmode = url.searchParams.get("sslmode");
  if (sslmode && sslmode !== "disable" && !url.searchParams.has("uselibpqcompat")) {
    url.searchParams.set("uselibpqcompat", "true");
  }
  return url.toString();
}

export function getPool(): InstanceType<typeof Pool> {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is not set — cannot use PostgresStore");
  }
  if (!pool) {
    pool = new Pool({
      connectionString: resolveConnectionString(DATABASE_URL),
      ssl: resolveSsl(DATABASE_URL),
    });
  }
  return pool;
}

export async function applySchema(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const sql = readFileSync(join(here, "schema.sql"), "utf8");
  await getPool().query(sql);
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
