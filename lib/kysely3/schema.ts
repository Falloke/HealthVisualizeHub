// lib/kysely3/schema.ts
import type {
  ColumnType,
  Generated,
  Selectable,
  Insertable,
  Updateable,
} from "kysely";

type DateCol = ColumnType<Date, Date | string, Date | string>;

/** method_x.diseases */
export interface DiseasesTable {
  disease_id: Generated<number>;
  disease_code: string;
}

/** method_x.provinces */
export interface ProvincesTable {
  province_id: Generated<number>;
  province_name_th: string;
  province_no: number | null;
  region_id: number | null;
}

/** method_x.districts */
export interface DistrictsTable {
  district_id: Generated<number>;
  province_id: number;
  district_name_th: string;
}

/** method_x.occupations */
export interface OccupationsTable {
  occupation_id: Generated<number>;
  occupation_name_th: string;
}

/** method_x.influenza_cases (fact_influenza) */
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

/** รวมทั้งหมดใน schema */
export interface DBMethod {
  diseases: DiseasesTable;
  provinces: ProvincesTable;
  districts: DistrictsTable;
  occupations: OccupationsTable;
  influenza_cases: InfluenzaCasesTable;
}

/** type helper เวลาใช้ */
export type DiseaseRow = Selectable<DiseasesTable>;
export type ProvinceRow = Selectable<ProvincesTable>;
export type DistrictRow = Selectable<DistrictsTable>;
export type OccupationRow = Selectable<OccupationsTable>;
export type InfluenzaCaseRow = Selectable<InfluenzaCasesTable>;

export type NewInfluenzaCase = Insertable<InfluenzaCasesTable>;
export type UpdateInfluenzaCase = Updateable<InfluenzaCasesTable>;
