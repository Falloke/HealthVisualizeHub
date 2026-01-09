// lib/kysely3/db.ts
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { DBMethod } from "./schema";

const DATABASE_URL = process.env.DATABASE_URL;
const SCHEMA = process.env.DB_METHOD_SCHEMA || "public";

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
});

// ทุกครั้งที่มี connection ใหม่ ให้สั่งใช้ schema ที่เลือก
pool.on("connect", (client) => {    
  client
    .query(`SET search_path TO ${SCHEMA}, public`)
    .catch((err) => {
      console.error("Failed to set search_path", err);
    });
  console.log(`[kysely3] use schema: ${SCHEMA}`);
});

export const dbMethod = new Kysely<DBMethod>({
  dialect: new PostgresDialect({ pool }),
});

export default dbMethod;
