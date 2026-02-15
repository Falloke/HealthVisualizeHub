// app/api/_utils/refLookups.ts
import { sql } from "kysely";
import db from "@/lib/kysely3/db";

export type RefProvince = {
  provinceNo: number;
  provinceNameTh: string;
  regionMoph: string;
  regionId: number | null;
};

export async function resolveProvinceFromRef(provinceNameThRaw: string | null) {
  const provinceNameTh = (provinceNameThRaw ?? "").trim();
  if (!provinceNameTh) return null;

  // ✅ ใช้ ref.provinces_moph (มี UNIQUE province_name_th อยู่แล้วตามรูป)
  const row = await db
    .selectFrom(sql`ref.provinces_moph`.as("p"))
    .select([
      sql<number>`p.province_no`.as("provinceNo"),
      sql<string>`p.province_name_th`.as("provinceNameTh"),
      sql<string>`p.region_moph`.as("regionMoph"),
      sql<number | null>`p.region_id`.as("regionId"),
    ])
    .where(sql`p.province_name_th`, "=", provinceNameTh)
    .executeTakeFirst();

  return (row ?? null) as RefProvince | null;
}

export type RefRegion = {
  regionId: number;
  regionNameTh: string;
  displayOrder: number | null;
};

export async function resolveRegionFromRef(regionNameThRaw: string | null) {
  const regionNameTh = (regionNameThRaw ?? "").trim();
  if (!regionNameTh) return null;

  const row = await db
    .selectFrom(sql`ref.regions_moph`.as("r"))
    .select([
      sql<number>`r.region_id`.as("regionId"),
      sql<string>`r.region_name_th`.as("regionNameTh"),
      sql<number | null>`r.display_order`.as("displayOrder"),
    ])
    .where(sql`r.region_name_th`, "=", regionNameTh)
    .executeTakeFirst();

  return (row ?? null) as RefRegion | null;
}
