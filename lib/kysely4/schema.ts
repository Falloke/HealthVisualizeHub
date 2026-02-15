// D:\HealtRiskHub\lib\kysely4\schema.ts
import type { Generated } from "kysely";

/**
 * ตาราง denormalized: method_f.d01_influenza / method_g.d01_influenza
 * (โครงสร้างตามที่คุณส่งมา)
 */
export interface D01InfluenzaRow {
  id: Generated<number>;

  disease_code: string | null;

  gender: string | null;
  age_y: number | null;

  nationality: string | null;
  occupation: string | null;

  province: string | null;
  district: string | null;

  onset_date: string | null;
  treated_date: string | null;
  diagnosis_date: string | null;
  death_date: string | null;

  onset_date_parsed: Date | null;
  treated_date_parsed: Date | null;
  diagnosis_date_parsed: Date | null;
  death_date_parsed: Date | null;
}

/**
 * (เผื่อใช้) ตาราง provinces ใน schema public
 * ถ้าคุณทำ route ที่ยังต้อง map ภาค/region/top5
 */
export interface PublicProvincesRow {
  province_id: Generated<number>;
  province_name_th: string | null;
  province_name_en: string | null;
  region_id: number | null;
}

/**
 * Database typings:
 * - รองรับชื่อ table แบบมี schema ด้วย key ที่เป็น string literal
 */
export interface Database {
  // method_f
  "method_f.d01_influenza": D01InfluenzaRow;

  // method_g
  "method_g.d01_influenza": D01InfluenzaRow;

  // optional (เผื่อใช้)
  "public.provinces": PublicProvincesRow;
}
