// app/api/ref/regions-moph/route.ts
import { NextResponse } from "next/server";
import db from "@/lib/kysely/db";
import { sql } from "kysely";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type RegionRow = {
  region_id: number;
  region_name_th: string;
  display_order: number;
};

export async function GET() {
  try {
    const { rows } = await sql<RegionRow>`
      select region_id, region_name_th, display_order
      from ref.regions_moph
      order by display_order asc
    `.execute(db);

    return NextResponse.json(
      { ok: true, rows },
      {
        status: 200,
        headers: {
          // ✅ กัน cache ตอน build / ตอน deploy
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (e: any) {
    console.error("❌ regions-moph GET error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "failed to load regions_moph" },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
