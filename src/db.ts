import { readFileSync } from "node:fs";
import pg from "pg";

// Credentials come from .env (shared with docker-compose.yml).
try {
  process.loadEnvFile(new URL("../.env", import.meta.url));
} catch {
  // No .env file: rely on variables already set in the environment.
}

export const db = new pg.Pool({
  host: process.env.POSTGRES_HOST || "localhost",
  port: Number(process.env.POSTGRES_PORT) || 5434,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
});

// Return DATE columns as plain 'YYYY-MM-DD' strings instead of JS Dates (no timezone surprises).
pg.types.setTypeParser(1082, (v) => v);

export async function ensureSchema() {
  await db.query(readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));
}
