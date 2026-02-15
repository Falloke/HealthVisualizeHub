// D:\HealtRiskHub\lib\kysely4\db.ts
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { Database } from "./schema";

// กัน hot-reload สร้าง connection ซ้ำใน dev
declare global {
  // eslint-disable-next-line no-var
  var __kysely4__: Kysely<Database> | undefined;
}

function makeDb() {
  const connectionString =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL;

  if (!connectionString) {
    throw new Error(
      "Missing DATABASE_URL (or POSTGRES_URL / POSTGRES_PRISMA_URL) in environment."
    );
  }

  const pool = new Pool({
    connectionString,
    // ปรับได้ตามต้องการ
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30_000),
    connectionTimeoutMillis: Number(process.env.PG_CONN_TIMEOUT_MS || 10_000),
  });

  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
  });
}

const db = globalThis.__kysely4__ ?? makeDb();

if (process.env.NODE_ENV !== "production") {
  globalThis.__kysely4__ = db;
}

export default db;
