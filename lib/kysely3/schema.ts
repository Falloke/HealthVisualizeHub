// D:\HealtRiskHub\lib\kysely3\schema.ts
import type { ColumnType, Generated, Selectable } from "kysely";

type DateCol = ColumnType<Date, Date | string, Date | string>;

/** ---------- dimension tables (อยู่ใน schema ที่อยู่ใน search_path เช่น public/ref) ---------- */
/**
 * ✅ หมายเหตุ:
 * ของจริงใน DB คุณ "ไม่มี ref.diseases"
 * และคอลัมน์ id อาจชื่อ id หรือ disease_id / code หรือ disease_code
 * เลยทำให้กำหนดแบบ optional เพื่อไม่ล็อกชื่อเดียว
 */
export interface DiseasesTable {
  // รองรับทั้ง id หรือ disease_id (อย่างใดอย่างหนึ่ง)
  id?: Generated<number>;
  disease_id?: Generated<number>;

  // รองรับทั้ง code หรือ disease_code
  code?: string;
  disease_code?: string;

  // เผื่อมีชื่อไทย/อังกฤษ (บางโปรเจกต์มี)
  name_th?: string | null;
  name_en?: string | null;
}

export interface ProvincesTable {
  province_id: Generated<number>;
  province_name_th: string;
  province_no: number | null;
  region_id: number | null;
}

export interface DistrictsTable {
  district_id: Generated<number>;
  province_id: number;
  district_name_th: string;
}

export interface OccupationsTable {
  occupation_id: Generated<number>;
  occupation_name_th: string;
}

/** ---------- Materialized Views ของ method_e ---------- */
export interface MvDailyProvinceTable {
  disease_id: number;
  province_id: number;
  onset_date: DateCol;
  daily_patients: number;
  daily_deaths: number;
}

export interface MvDailyRegionTable {
  disease_id: number;
  region_id: number;
  onset_date: DateCol;
  daily_patients: number;
  daily_deaths: number;
}

export interface MvDailyGenderProvinceTable {
  disease_id: number;
  province_id: number;
  gender: string;
  onset_date: DateCol;
  daily_patients: number;
  daily_deaths: number;
}

export interface MvDailyAgeProvinceTable {
  disease_id: number;
  province_id: number;
  age_group: string;
  onset_date: DateCol;
  daily_patients: number;
  daily_deaths: number;
}

export interface MvMonthlyGenderPatientsTable {
  disease_id: number;
  province_id: number;
  month_start: DateCol;
  gender: string;
  monthly_patients: number;
}

/** ---------- Kysely DB ---------- */
export interface DBMethod {
  // dimension (อยู่ใน schema ใด schema หนึ่งใน search_path)
  diseases: DiseasesTable;
  provinces: ProvincesTable;
  districts: DistrictsTable;
  occupations: OccupationsTable;

  // method_e MV
  mv_daily_province: MvDailyProvinceTable;
  mv_daily_region: MvDailyRegionTable;
  mv_daily_gender_province: MvDailyGenderProvinceTable;
  mv_daily_age_province: MvDailyAgeProvinceTable;
  mv_monthly_gender_patients: MvMonthlyGenderPatientsTable;
}

/** ---------- helper types ---------- */
export type DiseaseRow = Selectable<DiseasesTable>;
export type ProvinceRow = Selectable<ProvincesTable>;
export type DistrictRow = Selectable<DistrictsTable>;
export type OccupationRow = Selectable<OccupationsTable>;

export type MvDailyProvinceRow = Selectable<MvDailyProvinceTable>;
export type MvDailyRegionRow = Selectable<MvDailyRegionTable>;
export type MvDailyGenderProvinceRow = Selectable<MvDailyGenderProvinceTable>;
export type MvDailyAgeProvinceRow = Selectable<MvDailyAgeProvinceTable>;
export type MvMonthlyGenderPatientsRow = Selectable<MvMonthlyGenderPatientsTable>;
