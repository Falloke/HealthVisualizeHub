// lib/kysely/db.ts
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { DB } from "./schema";

// ใช้ globalThis ป้องกันการสร้าง Kysely/Pool ซ้ำใน dev (hot reload)
const globalForDb = globalThis as unknown as {
  _kyselyDb?: Kysely<DB>;
};

if (!globalForDb._kyselyDb) {
  globalForDb._kyselyDb = new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString: process.env.DATABASE_URL,
        // ปรับได้ตามต้องการ
        max: 10,              // จำนวน connection สูงสุดใน pool
        idleTimeoutMillis: 0, // ปล่อย idle ได้ (ให้ Postgres จัดการ)
      }),
    }),
  });
}

// ✅ export แบบเดียวให้ใช้ได้ทั้ง named และ default import
export const db = globalForDb._kyselyDb!;
export default db;
