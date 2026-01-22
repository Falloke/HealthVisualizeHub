import type { Kysely } from "kysely";
import type { DB } from "@/lib/kysely/schema";

export async function resolveDiseaseCode(db: Kysely<DB>, diseaseParam: string) {
  const raw = (diseaseParam || "").trim();
  if (!raw) return null;

  const candidates = new Set<string>();

  // 1) raw ตรง ๆ
  candidates.add(raw);
  candidates.add(raw.toUpperCase());
  candidates.add(raw.toLowerCase());

  // 2) ถ้าเป็นเลขล้วน "01" -> "D01"
  if (/^\d+$/.test(raw)) {
    const pad2 = raw.padStart(2, "0");
    candidates.add(`D${pad2}`);
    candidates.add(`d${pad2}`);
  }

  // 3) ถ้าเป็น d01 / D01 → normalize เป็น D01
  const m = raw.match(/^d(\d+)$/i);
  if (m?.[1]) {
    const pad2 = String(Number(m[1])).padStart(2, "0");
    candidates.add(`D${pad2}`);
    candidates.add(`d${pad2}`);
  }

  const arr = Array.from(candidates).filter(Boolean);

  // ✅ 1) match ตาม code ก่อน
  const byCode = await db
    .selectFrom("diseases")
    .select(["code"])
    .where("code", "in", arr)
    .executeTakeFirst();

  if (byCode?.code) return String(byCode.code);

  // ✅ 2) fallback: match ตามชื่อโรค (TH/EN)
  const byName = await db
    .selectFrom("diseases")
    .select(["code"])
    .where((eb) =>
      eb.or([
        eb("name_th", "in", arr),
        eb("name_en", "in", arr),
      ])
    )
    .executeTakeFirst();

  if (byName?.code) return String(byName.code);

  // ✅ 3) ไม่เจอจริง ๆ คืน raw (บางทีข้อมูลจริงเก็บเป็น code ที่ไม่อยู่ใน diseases)
  return raw;
}
