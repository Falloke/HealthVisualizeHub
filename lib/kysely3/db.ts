// D:\HealtRiskHub\lib\kysely3\db.ts
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type { DBMethod } from "./schema";

const DATABASE_URL = process.env.DATABASE_URL;
const SCHEMA = (process.env.DB_METHOD_SCHEMA ?? "public").trim();

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const pool = new Pool({ connectionString: DATABASE_URL });

// ทุกครั้งที่มี connection ใหม่ ให้สั่งใช้ schema ตาม DB_METHOD_SCHEMA
pool.on("connect", (client) => {
  // ✅ method schema มาก่อน แล้วตามด้วย ref/public (dimension มักอยู่ public)
  const searchPath = [SCHEMA, "ref", "public"].filter(Boolean);

  // ใช้ quote_ident กันชื่อ schema แปลก ๆ
  const setPathSql = `SET search_path TO ${searchPath.map((s) => `"${s.replace(/"/g, '""')}"`).join(", ")}`;

  client.query(setPathSql).catch((err) => {
    console.error("[kysely3] Failed to set search_path", err);
  });

  console.log(`[kysely3] use schema: ${searchPath.join(", ")}`);
});

export const dbMethod = new Kysely<DBMethod>({
  dialect: new PostgresDialect({ pool }),
});

export default dbMethod;
