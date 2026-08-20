import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@hansapp/data';

import { CodeMapper } from './code-mapper';
import { HospitalLocks } from './hospital-lock';
import type { BuiltValues, HospitalKey } from './healthcare-detail-build.service';

const CHUNK = 1_000;

/**
 * 통합 병원 하위 테이블 빌드 저장소. 원본·미러 읽기와 하위 테이블 갈아엎기(DELETE/INSERT)를 담당한다.
 *
 * replace() 의 삭제·삽입 raw SQL 이 전부 여기 있다. **잠금 판정은 서비스 몫이다** — 어느 행/키를
 * 남길지는 서비스가 정해 이미 결정된 값(keepIds·lockedKeys·insertable)만 넘긴다. 저장소는 받은 대로
 * SQL 만 친다. `DELETE FROM <table>` 을 WHERE 없이 치는 자리라, 서비스가 assertRebuildable 로
 * 테이블을 먼저 검증한 뒤에만 부른다.
 */
@Injectable()
export class HealthcareDetailBuildRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 원본 코드 → 우리 코드 변환기를 메모리에 올린다. */
  loadCodeMapper(): Promise<CodeMapper> {
    return CodeMapper.load(this.prisma);
  }

  /** 동기화 예외(잠금)를 메모리에 올린다. */
  loadLocks(): Promise<HospitalLocks> {
    return HospitalLocks.load(this.prisma);
  }

  /** 활성 통합 병원의 id ↔ 출처 키. */
  loadActiveHospitals(): Promise<HospitalKey[]> {
    return this.prisma.$queryRaw<HospitalKey[]>(Prisma.sql`
      SELECT id, ykiho, hpid FROM healthcare_hospital WHERE status = 'active'
    `);
  }

  // --- buildSubjects ---

  /** HIRA 신고 과목(역조회). */
  loadHiraSubjects(): Promise<{ ykiho: string; dgsbjtCd: string; sdrCnt: number | null }[]> {
    return this.prisma.hiraHospitalSubject.findMany({
      select: { ykiho: true, dgsbjtCd: true, sdrCnt: true },
    });
  }

  /** NMC 신고 과목(역조회). */
  loadNmcSubjects(): Promise<{ hpid: string; subjectCd: string }[]> {
    return this.prisma.nmcHospitalSubject.findMany({
      select: { hpid: true, subjectCd: true },
    });
  }

  /** HIRA 상세: 과목별 전문의수. */
  loadSpecialistDetails(): Promise<{ ykiho: string; data: unknown }[]> {
    return this.prisma.hiraHospitalDetail.findMany({
      where: { op: 'specialist' },
      select: { ykiho: true, data: true },
    });
  }

  /** 통합 병원 메타(종별·출처 키). 계열 불일치 대조에 쓴다. */
  loadHospitalMeta(): Promise<
    {
      id: number;
      classCd: string | null;
      ykiho: string | null;
      hpid: string | null;
    }[]
  > {
    return this.prisma.healthcareHospital.findMany({
      select: { id: true, classCd: true, ykiho: true, hpid: true },
    });
  }

  /**
   * 계열 불일치를 기록한다. **status·memo 는 덮어쓰지 않는다** — 사람이 확인해 둔 값이라
   * 매 빌드마다 지우면 안 된다. 갱신하는 건 last_seen_at 뿐이다.
   * 행은 서비스가 이미 통합 테이블에 넣었다 — 여기 있다고 빠진 게 아니다.
   */
  async insertMismatches(
    rows: {
      id: number;
      cd: string;
      classCd: string;
      ykiho: string | null;
      hpid: string | null;
    }[],
  ): Promise<void> {
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);

      const values = Prisma.join(
        chunk.map(
          (r) =>
            Prisma.sql`(${r.id}, ${r.cd}, ${r.classCd}, ${r.ykiho}, ${r.hpid}, 'open', NOW(), NOW())`,
        ),
      );

      await this.prisma.$executeRaw(Prisma.sql`
        INSERT INTO healthcare_subject_mismatch
          (hospital_id, subject_cd, class_cd, ykiho, hpid, status, first_seen_at, last_seen_at)
        VALUES ${values} AS new
        ON DUPLICATE KEY UPDATE
          class_cd     = new.class_cd,
          ykiho        = new.ykiho,
          hpid         = new.hpid,
          last_seen_at = NOW()
      `);
    }
  }

  // --- buildHours ---

  /** HIRA 세부정보(info). 점심·접수시간이 여기 있다. */
  loadInfoDetails(): Promise<{ ykiho: string; data: unknown }[]> {
    return this.prisma.hiraHospitalDetail.findMany({
      where: { op: 'info' },
      select: { ykiho: true, data: true },
    });
  }

  /** NMC 병원 원문. 요일별 진료시간이 담겨 있다. */
  loadNmcHospitals(): Promise<{ hpid: string; data: unknown }[]> {
    return this.prisma.nmcHospital.findMany({
      select: { hpid: true, data: true },
    });
  }

  /** 달빛어린이병원 원문. 야간 소아 진료시간이 담겨 있다. */
  loadBabyHospitals(): Promise<{ hpid: string; data: unknown }[]> {
    return this.prisma.nmcBabyHospital.findMany({
      select: { hpid: true, data: true },
    });
  }

  // --- buildStaff ---

  /** HIRA 병원 목록의 인력 필드를 펼친 원시 행. **총원**이다(겸직 포함). */
  loadStaffRows(): Promise<Record<string, unknown>[]> {
    return this.prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT ykiho,
             JSON_EXTRACT(data, '$.drTotCnt')       total,
             JSON_EXTRACT(data, '$.mdeptSdrCnt')    specialist,
             JSON_EXTRACT(data, '$.mdeptResdntCnt') resident,
             JSON_EXTRACT(data, '$.mdeptIntnCnt')   intern,
             JSON_EXTRACT(data, '$.mdeptGdrCnt')    general,
             JSON_EXTRACT(data, '$.detySdrCnt')     dentist,
             JSON_EXTRACT(data, '$.cmdcSdrCnt')     oriental,
             JSON_EXTRACT(data, '$.pnursCnt')       midwife
        FROM hira_hospital
    `);
  }

  // --- buildBeds ---

  /** HIRA 상세(facility). 병상 정보. 규모기관만 있다. */
  loadFacilityDetails(): Promise<{ ykiho: string; data: unknown }[]> {
    return this.prisma.hiraHospitalDetail.findMany({
      where: { op: 'facility' },
      select: { ykiho: true, data: true },
    });
  }

  // --- buildEquipments ---

  /** HIRA 상세(equipment). 장비 보유. */
  loadEquipments(): Promise<{ ykiho: string; oftCd: string; oftCnt: number | null }[]> {
    return this.prisma.hiraHospitalEquipment.findMany({
      select: { ykiho: true, oftCd: true, oftCnt: true },
    });
  }

  // --- buildCapabilities ---

  /** basic 을 받은 NMC 병원의 basic 원문. 중증처치(MKioskTy*)가 여기 있다. */
  loadNmcBasics(): Promise<{ hpid: string; basic: unknown }[]> {
    return this.prisma.nmcHospital.findMany({
      where: { basicSyncedAt: { not: null } },
      select: { hpid: true, basic: true },
    });
  }

  /** HIRA 전문병원·특수진료 검색결과. */
  loadHiraSrch(): Promise<{ ykiho: string; tp: string; srchCd: string; srchNm: string | null }[]> {
    return this.prisma.hiraHospitalSrch.findMany({
      select: { ykiho: true, tp: true, srchCd: true, srchNm: true },
    });
  }

  // --- upsert + 스윕 (하위 테이블 갱신) ---
  //
  // table·columns 는 서비스가 assertRebuildable 로 이미 검증한 값이다. Prisma.raw() 로
  // 그대로 박히므로 검증되지 않은 값을 넘기면 안 된다.
  //
  // **갈아엎지 않는다.** 예전에는 `DELETE FROM <table>` 로 비우고 다시 채웠는데,
  // 비운 뒤 채우는 사이에 데이터가 사라져 보이고(트랜잭션도 없다) 중간에 죽으면 빈 채로
  // 남았다. 하위 테이블이 전부 자연키라 upsert 가 그대로 먹어서, 있으면 고치고 없으면
  // 넣은 뒤 **이번에 안 나온 행만** 지운다.

  /**
   * 전량 upsert. built_at 은 늘 이번 회차 시각으로 찍는다.
   *
   * **built_at 을 상수로 박는 것이 중요하다.** NOW() 로 두면 청크마다 시각이 달라져
   * 뒤따르는 스윕이 앞 청크를 낡은 것으로 오해하고 지운다.
   */
  async upsertRows(
    table: string,
    columns: string[],
    updatable: string[],
    rows: { value: unknown[] }[],
    builtAt: Date,
  ): Promise<void> {
    const cols = Prisma.raw([...columns, 'built_at'].join(', '));
    // 키만으로 이뤄진 표(capability 등)는 고칠 것이 없다. 그래도 built_at 은 새로 찍어야
    // 스윕에 안 걸리므로 ON DUPLICATE KEY UPDATE 절 자체는 있어야 한다.
    const sets = Prisma.join([
      ...updatable.map((c) => Prisma.sql`${Prisma.raw(c)} = new.${Prisma.raw(c)}`),
      Prisma.sql`built_at = new.built_at`,
    ]);

    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      await this.prisma.$executeRaw(Prisma.sql`
        INSERT INTO ${Prisma.raw(table)} (${cols})
        VALUES ${Prisma.join(chunk.map((r) => Prisma.sql`(${Prisma.join([...r.value, builtAt])})`))} AS new
        ON DUPLICATE KEY UPDATE ${sets}
      `);
    }
  }

  /**
   * 잠긴 행의 built_at 만 새로 찍는다. **값은 건드리지 않는다.**
   *
   * 잠긴 행은 upsert 대상에서 빠지므로 built_at 이 낡은 채로 남고, 그대로 두면 뒤따르는
   * 스윕이 지워 버린다 — 사람이 고친 값을 배치가 지우는 최악의 경우다.
   * "이번 회차도 이 행을 봤다" 만 표시하는 것이다.
   */
  async touchRows(
    table: string,
    rows: { hospitalId: number; key: Record<string, unknown> }[],
    builtAt: Date,
  ): Promise<void> {
    for (const row of rows) {
      const where = Prisma.join(
        [
          Prisma.sql`hospital_id = ${row.hospitalId}`,
          ...Object.entries(row.key).map(
            ([col, val]) => Prisma.sql`${Prisma.raw(col)} = ${val as string | number}`,
          ),
        ],
        ' AND ',
      );
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE ${Prisma.raw(table)} SET built_at = ${builtAt} WHERE ${where}
      `);
    }
  }

  /**
   * 이번 회차에 안 나온 행을 지운다. **삭제 감지가 여기 한 곳으로 모인다.**
   *
   * 원본에서 진료과목이 빠지거나 진료시간이 줄면 그 행은 upsert 되지 않아 built_at 이
   * 낡은 채로 남는다. 그것만 지운다 — 나머지는 손대지 않으므로 빈 창이 없다.
   */
  async sweepStale(table: string, builtAt: Date): Promise<number> {
    const result = await this.prisma.$executeRaw(Prisma.sql`
      DELETE FROM ${Prisma.raw(table)} WHERE built_at < ${builtAt}
    `);
    return result;
  }

  // --- buildSections ---

  /** 1단계(전수 역조회) 성공 상태. */
  loadBulkSyncState(): Promise<{ job: string; status: string; lastSuccessAt: Date | null }[]> {
    return this.prisma.syncState.findMany({
      where: { stage: 1, job: { in: ['hira.1', 'nmc.1'] } },
      select: { job: true, status: true, lastSuccessAt: true },
    });
  }

  /** 개별 조회를 받은 병원(op 별). */
  loadDetailOps(): Promise<{ ykiho: string; op: string }[]> {
    return this.prisma.hiraHospitalDetail.findMany({
      select: { ykiho: true, op: true },
    });
  }

  /** basic 을 받은 NMC 병원 hpid. */
  loadBasicHpids(): Promise<{ hpid: string }[]> {
    return this.prisma.nmcHospital.findMany({
      where: { basicSyncedAt: { not: null } },
      select: { hpid: true },
    });
  }

  /** HIRA 역조회 미러의 병원 ykiho(중복 제거). */
  loadHiraSubjectYkihos(): Promise<{ ykiho: string }[]> {
    return this.prisma.hiraHospitalSubject.findMany({
      select: { ykiho: true },
      distinct: ['ykiho'],
    });
  }

  /** NMC 역조회 미러의 병원 hpid(중복 제거). */
  loadNmcSubjectHpids(): Promise<{ hpid: string }[]> {
    return this.prisma.nmcHospitalSubject.findMany({
      select: { hpid: true },
      distinct: ['hpid'],
    });
  }

  /**
   * 각 섹션의 값이 실제로 들어간 병원 id.
   *
   * **원본이 아니라 healthcare_* 에 묻는다.** buildX 가 이미 판단해 쓴 결과라, 여기서 다시
   * 파싱하면 규칙이 두 벌이 되고 언젠가 어긋난다.
   */
  async loadBuiltValues(): Promise<BuiltValues> {
    const ids = async (sql: Prisma.Sql): Promise<Set<number>> => {
      const rows = await this.prisma.$queryRaw<{ id: number }[]>(sql);
      return new Set(rows.map((r) => r.id));
    };

    const [
      description,
      directionsNmc,
      directions,
      parking,
      transport,
      emergency,
      hours,
      hoursBreak,
      baby,
      subject,
      specialist,
      bed,
      staff,
      equipment,
      severe,
      specialty,
    ] = await Promise.all([
      ids(
        Prisma.sql`SELECT id FROM healthcare_hospital WHERE intro IS NOT NULL OR notice IS NOT NULL`,
      ),
      // 찾아오는 길의 출처를 가리려면 NMC 원본을 봐야 한다 — 우리 테이블은 합쳐진 뒤라
      // 어느 쪽이 이겼는지 모른다. 여기만 예외적으로 미러를 본다.
      ids(Prisma.sql`
        SELECT h.id FROM healthcare_hospital h
          JOIN nmc_hospital n ON n.hpid = h.hpid
         WHERE JSON_UNQUOTE(JSON_EXTRACT(n.data, '$.dutyMapimg')) > ''
      `),
      ids(Prisma.sql`SELECT id FROM healthcare_hospital WHERE directions IS NOT NULL`),
      ids(Prisma.sql`
        SELECT id FROM healthcare_hospital
         WHERE park_qty IS NOT NULL OR park_paid IS NOT NULL OR park_note IS NOT NULL
      `),
      ids(Prisma.sql`SELECT id FROM healthcare_hospital WHERE transport IS NOT NULL`),
      ids(Prisma.sql`SELECT id FROM healthcare_hospital WHERE emergency_yn = 1`),
      ids(
        Prisma.sql`SELECT DISTINCT hospital_id AS id FROM healthcare_hospital_hours WHERE kind = 'general' AND open_time IS NOT NULL`,
      ),
      ids(
        Prisma.sql`SELECT DISTINCT hospital_id AS id FROM healthcare_hospital_hours WHERE kind = 'general' AND (break_start IS NOT NULL OR reception_end IS NOT NULL)`,
      ),
      ids(
        Prisma.sql`SELECT DISTINCT hospital_id AS id FROM healthcare_hospital_hours WHERE kind = 'baby'`,
      ),
      ids(
        Prisma.sql`SELECT DISTINCT hospital_id AS id FROM healthcare_hospital_subject WHERE declared = 1`,
      ),
      ids(
        Prisma.sql`SELECT DISTINCT hospital_id AS id FROM healthcare_hospital_subject WHERE specialist_cnt > 0`,
      ),
      ids(Prisma.sql`SELECT hospital_id AS id FROM healthcare_hospital_bed`),
      ids(Prisma.sql`SELECT hospital_id AS id FROM healthcare_hospital_staff`),
      ids(Prisma.sql`SELECT DISTINCT hospital_id AS id FROM healthcare_hospital_equipment`),
      ids(
        Prisma.sql`SELECT DISTINCT hospital_id AS id FROM healthcare_hospital_capability WHERE tp = 'severe'`,
      ),
      ids(
        Prisma.sql`SELECT DISTINCT hospital_id AS id FROM healthcare_hospital_capability WHERE tp IN ('specialty','special')`,
      ),
    ]);

    return {
      description,
      directionsNmc,
      directions,
      parking,
      transport,
      emergency,
      hours,
      hoursBreak,
      baby,
      subject,
      specialist,
      bed,
      staff,
      equipment,
      severe,
      specialty,
    };
  }
}
