// lib/kysely/schema.ts
import type {
  ColumnType,
  Generated,
  Selectable,
  Insertable,
  Updateable,
} from "kysely";

type Timestamp = ColumnType<Date, Date | string, Date | string>;

/** diseases (PK: code) */
export interface DiseasesTable {
  code: string;
  name_th: string;
  name_en: string;
}

/** d01_influenza (โต๊ะเคสจริงของโรค D01) */
export interface D01Influenza {
  id: number;
  disease_code: string;
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
  onset_date_parsed: Date;
  treated_date_parsed: Date | null;
  diagnosis_date_parsed: Date | null;
  death_date_parsed: Date | null;
}

/** disease_details (PK/FK: disease_code -> diseases.code)
 *  *** ไม่มี icon_url / updated_at แล้ว ***
 */
export interface DiseaseDetailsTable {
  disease_code: string;
  description_th: string;
  description_en: string | null;
}

/** symptoms (PK: id identity) */
export interface SymptomsTable {
  id: Generated<number>;
  name_th: string;
  name_en: string | null;
}

/** disease_symptoms (composite PK: disease_code + symptom_id) */
export interface DiseaseSymptomsTable {
  disease_code: string;
  symptom_id: number;
  typicality: number | null; // 1–5 (optional)
  severity: number | null; // 1–5 (optional)
}

/** preventions (PK: id identity) */
export interface PreventionsTable {
  id: Generated<number>;
  name_th: string;
  name_en: string | null;
}

/** disease_preventions (composite PK: disease_code + prevention_id) */
export interface DiseasePreventionsTable {
  disease_code: string;
  prevention_id: number;
  priority: number | null; // 1 = สำคัญสุด (optional)
}

export interface DB {
  diseases: DiseasesTable;
  d01_influenza: D01Influenza;
  disease_details: DiseaseDetailsTable;
  symptoms: SymptomsTable;
  disease_symptoms: DiseaseSymptomsTable;
  preventions: PreventionsTable;
  disease_preventions: DiseasePreventionsTable;
}

export type Disease = Selectable<DiseasesTable>;
export type NewDisease = Insertable<DiseasesTable>;
export type DiseaseUpdate = Updateable<DiseasesTable>;

export type DiseaseDetail = Selectable<DiseaseDetailsTable>;
export type NewDiseaseDetail = Insertable<DiseaseDetailsTable>;
export type DiseaseDetailUpdate = Updateable<DiseaseDetailsTable>;

export type Symptom = Selectable<SymptomsTable>;
export type NewSymptom = Insertable<SymptomsTable>;
export type SymptomUpdate = Updateable<SymptomsTable>;

export type DiseaseSymptom = Selectable<DiseaseSymptomsTable>;
export type NewDiseaseSymptom = Insertable<DiseaseSymptomsTable>;

export type Prevention = Selectable<PreventionsTable>;
export type NewPrevention = Insertable<PreventionsTable>;
export type PreventionUpdate = Updateable<PreventionsTable>;

export type DiseasePrevention = Selectable<DiseasePreventionsTable>;
export type NewDiseasePrevention = Insertable<DiseasePreventionsTable>;
