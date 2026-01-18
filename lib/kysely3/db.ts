// lib/kysely3/db.ts
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { DBMethod } from "./schema";

const DATABASE_URL = process.env.DATABASE_URL;
const SCHEMA = process.env.DB_METHOD_SCHEMA || "public";

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

// ✅ quote schema ให้ปลอดภัย และกันกรณีมีเครื่องหมาย "
const quotedSchema = `"${String(SCHEMA).replace(/"/g, '""')}"`;

const pool = new Pool({
  connectionString: DATABASE_URL,
  // ✅ ตั้ง search_path ตั้งแต่เริ่มต่อ connection (ไม่มี race)
  options: `-c search_path=${quotedSchema},public`,
});

pool.on("connect", () => {
  console.log(`[kysely3] use schema: ${SCHEMA}`);
});

pool.on("error", (err) => {
  console.error("[kysely3] pool error:", err);
});

export const dbMethod = new Kysely<DBMethod>({
  dialect: new PostgresDialect({ pool }),
});

export default dbMethod;
