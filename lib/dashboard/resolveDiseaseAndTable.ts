import db from "@/lib/kysely/db";
import { resolveDiseaseCode } from "@/lib/dashboard/dbExpr";
import { resolveFactTableByDisease } from "@/lib/kysely/resolveFactTable";

export async function resolveDiseaseAndTable(diseaseParam: string) {
  const code = await resolveDiseaseCode(db as any, diseaseParam);
  if (!code) throw new Error("ไม่พบ disease");

  const factTable = await resolveFactTableByDisease(code);
  return { diseaseCode: code, factTable };
}
