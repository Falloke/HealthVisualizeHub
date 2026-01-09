// lib/kysely3/schema.ts
import type {
  ColumnType,
  Generated,
  Selectable,
  Insertable,
  Updateable,
} from "kysely";

type DateCol = ColumnType<Date, Date | string, Date | string>;

/** ---------- ตาราง dimension พื้นฐาน (อยู่ใน ref schema) ---------- */

/** ref.diseases */
export interface DiseasesTable {
  disease_id: Generated<number>;
  disease_code: string;
}

/** ref.provinces */
export interface ProvincesTable {
  province_id: Generated<number>;
  province_name_th: string;
  province_no: number | null;
  region_id: number | null;
}

/** ref.districts */
export interface DistrictsTable {
  district_id: Generated<number>;
  province_id: number;
  district_name_th: string;
}

/** ref.occupations */
export interface OccupationsTable {
  occupation_id: Generated<number>;
  occupation_name_th: string;
}

/** method_x.influenza_cases (กรณีอยากเทียบ method เดิม) */
export interface InfluenzaCasesTable {
  id: Generated<number>;
  disease_id: number;
  gender: string | null;
  age_y: number | null;
  nationality: string | null;
  occupation_id: number | null;
  province_id: number | null;
  district_id: number | null;
  onset_date_parsed: DateCol;
  treated_date_parsed: DateCol | null;
  diagnosis_date_parsed: DateCol | null;
  death_date_parsed: DateCol | null;
}

/** ---------- Materialized Views ของ method_e ---------- */

/** method_e.mv_daily_province : โรค-จังหวัด-วัน */
export interface MvDailyProvinceTable {
  disease_id: number;
  province_id: number;
  onset_date: DateCol;
  daily_patients: number;
  daily_deaths: number;
}

/** method_e.mv_daily_region : โรค-ภูมิภาค-วัน */
export interface MvDailyRegionTable {
  disease_id: number;
  region_id: number;
  onset_date: DateCol;
  daily_patients: number;
  daily_deaths: number;
}

/** method_e.mv_daily_gender_province : โรค-จังหวัด-วัน-เพศ */
export interface MvDailyGenderProvinceTable {
  disease_id: number;
  province_id: number;
  gender: string;
  onset_date: DateCol;
  daily_patients: number;
  daily_deaths: number;
}

/** method_e.mv_daily_age_province : โรค-จังหวัด-วัน-ช่วงอายุ */
export interface MvDailyAgeProvinceTable {
  disease_id: number;
  province_id: number;
  age_group: string;
  onset_date: DateCol;
  daily_patients: number;
  daily_deaths: number;
}

/** method_e.mv_monthly_gender_patients : โรค-จังหวัด-เดือน-เพศ */
export interface MvMonthlyGenderPatientsTable {
  disease_id: number;
  province_id: number;
  month_start: DateCol; // วันแรกของเดือน
  gender: string;
  monthly_patients: number;
}

/** ---------- รวมทั้งหมดใน schema ที่ Kysely มองเห็น ---------- */

export interface DBMethod {
  // dim/ref tables
  diseases: DiseasesTable;
  provinces: ProvincesTable;
  districts: DistrictsTable;
  occupations: OccupationsTable;

  // fact เดิม (ถ้ายังอยากใช้เทียบ / debug)
  influenza_cases: InfluenzaCasesTable;

  // materialized views (method_e)
  mv_daily_province: MvDailyProvinceTable;
  mv_daily_region: MvDailyRegionTable;
  mv_daily_gender_province: MvDailyGenderProvinceTable;
  mv_daily_age_province: MvDailyAgeProvinceTable;
  mv_monthly_gender_patients: MvMonthlyGenderPatientsTable;
}

/** ---------- type helper เวลาใช้ ---------- */

export type DiseaseRow = Selectable<DiseasesTable>;
export type ProvinceRow = Selectable<ProvincesTable>;
export type DistrictRow = Selectable<DistrictsTable>;
export type OccupationRow = Selectable<OccupationsTable>;
export type InfluenzaCaseRow = Selectable<InfluenzaCasesTable>;

export type MvDailyProvinceRow = Selectable<MvDailyProvinceTable>;
export type MvDailyRegionRow = Selectable<MvDailyRegionTable>;
export type MvDailyGenderProvinceRow = Selectable<MvDailyGenderProvinceTable>;
export type MvDailyAgeProvinceRow = Selectable<MvDailyAgeProvinceTable>;
export type MvMonthlyGenderPatientsRow =
  Selectable<MvMonthlyGenderPatientsTable>;

export type NewInfluenzaCase = Insertable<InfluenzaCasesTable>;
export type UpdateInfluenzaCase = Updateable<InfluenzaCasesTable>;
