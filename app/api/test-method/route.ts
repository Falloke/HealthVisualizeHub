// app/api/test-method/route.ts
import { NextResponse } from "next/server";
import db from "@/lib/kysely3/db";

export async function GET() {
  const rows = await db
    .selectFrom("provinces")
    .select(["province_id", "province_name_th"])
    .limit(5)
    .execute();

  return NextResponse.json({
    schema: process.env.DB_METHOD_SCHEMA,
    rows,
  });
}
