import { Injectable, Logger } from '@nestjs/common';
import { asNumber, asString } from '@hansapi/application';
import { parseTimeRange } from '@hansapi/common';
import { Prisma, PrismaService } from '@hansapi/data';

import { isSubjectAllowed } from '@hansapi/data/seed';

import { CodeMapper } from './code-mapper';
import { HospitalLocks } from './hospital-lock';

/**
 * replace() 가 통째로 비울 수 있는 테이블. **이 목록은 함부로 늘리지 마라.**
 *
 * replace() 는 `DELETE FROM <table>` 을 WHERE 없이 친다. 여기 적힌 테이블은 전부
 * 원본에서 파생된 집계라, 지워도 다음 빌드가 똑같이 다시 만든다.
 *
 * **healthcare_hospital_i18n 은 여기 들어오면 안 된다.** 이름이 형제처럼 생겼지만
 * 성질이 정반대다 — 원본에서 파생되지 않고, 돈과 시간을 들여 LLM 으로 얻은 값이라
 * 지우면 **다시 만들 수 없다**(같은 비용을 또 내야 한다). 사람이 손으로 고친 번역까지
 * 함께 날아간다. 그래서 규율이 아니라 타입으로 막는다.
 */
const REBUILD_TABLES = [
  'healthcare_hospital_subject',
  'healthcare_hospital_hours',
  'healthcare_hospital_staff',
  'healthcare_hospital_bed',
  'healthcare_hospital_equipment',
  'healthcare_hospital_capability',
  'healthcare_hospital_section',
] as const;

/**
 * 섹션 목록. **우리 어휘다** — 미러의 op 이름(hira.info)을 쓰지 마라.
 * 가르는 기준과 각 섹션의 출처는 schema.prisma 의 healthcare_hospital_section 주석에 있다.
 */
const SECTIONS = [
  'basic',
  'description',
  'directions',
  'parking',
  'transport',
  'hours',
  'hours_break',
  'baby',
  'subject',
  'specialist',
  'bed',
  'staff',
  'equipment',
  'severe',
  'specialty',
  'emergency',
] as const;

type SectionName = (typeof SECTIONS)[number];

/**
 * 섹션이 어느 원본에 딸렸나. **그 원본에 링크되지 않은 병원은 행을 만들지 않는다** —
 * ykiho 가 없는 NMC 전용 병원에 bed 행을 깔아 봐야 영원히 NULL 이고, 그건 "아직 안 받음"
 * 이 아니라 "해당 없음" 이라 뜻이 다르다. 'both' 는 양쪽 중 하나만 있어도 대상이다.
 */
const SECTION_SIDE: Record<SectionName, 'hira' | 'nmc' | 'both'> = {
  basic: 'both',
  description: 'nmc',
  directions: 'both',
  parking: 'hira',
  transport: 'hira',
  hours: 'nmc',
  hours_break: 'hira',
  baby: 'nmc',
  subject: 'both',
  specialist: 'hira',
  bed: 'hira',
  staff: 'hira',
  equipment: 'hira',
  severe: 'nmc',
  specialty: 'hira',
  emergency: 'nmc',
};

type RebuildTable = (typeof REBUILD_TABLES)[number];

export interface DetailBuildResult {
  subjects: number;
  hours: number;
  staff: number;
  beds: number;
  equipments: number;
  capabilities: number;
  sections: number;
  elapsedMs: number;
}

/** 섹션별로 값이 실제로 들어간 병원 id 집합. */
interface BuiltValues {
  description: Set<number>;
  /** NMC 원본에 dutyMapimg 가 있는 병원. 찾아오는 길의 출처를 가리는 데만 쓴다. */
  directionsNmc: Set<number>;
  directions: Set<number>;
  parking: Set<number>;
  transport: Set<number>;
  emergency: Set<number>;
  hours: Set<number>;
  hoursBreak: Set<number>;
  baby: Set<number>;
  subject: Set<number>;
  specialist: Set<number>;
  bed: Set<number>;
  staff: Set<number>;
  equipment: Set<number>;
  severe: Set<number>;
  specialty: Set<number>;
}

/** judgeSection 이 판정에 쓰는 재료. 병원마다 도는 자리라 미리 만들어 넘긴다. */
interface SectionContext {
  id: number;
  ykiho: string | null;
  hpid: string | null;
  now: Date;
  /** 1단계(전수 역조회)가 성공한 시각. null 이면 아직이다. */
  hiraBulk: Date | null;
  nmcBulk: Date | null;
  gotOp: (op: string, ykiho: string | null) => boolean;
  gotBasic: Set<string>;
  hiraSubject: Set<string>;
  nmcSubject: Set<string>;
  has: BuiltValues;
}

const CHUNK = 1_000;

/**
 * 적재할 행 하나.
 *
 * key 가 필요한 이유: 하위 테이블은 통째로 갈아엎는데(DELETE + INSERT), **잠긴 행은 빼야** 한다.
 * 어느 행이 잠겼는지 알려면 PK 의 나머지 부분(kind, day, subject_cd …)이 있어야 한다.
 */
interface BuildRow {
  hospitalId: number;
  key: Record<string, unknown>;
  value: Prisma.Sql;
}

/** 통합 병원의 id ↔ 출처 키 */
interface HospitalKey {
  id: number;
  ykiho: string | null;
  hpid: string | null;
}

/**
 * 통합 병원의 하위 테이블 빌드.
 *
 * 본체(healthcare_hospital)가 만들어진 뒤에 돈다. API 콜이 0이다.
 *
 * 어느 원본을 쓰는지가 테이블마다 다르다.
 *   subject     양쪽 (역조회 매핑 86만쌍 + HIRA 상세의 전문의수)
 *   hours       NMC 만 (HIRA info 는 공휴일·달빛을 못 준다)
 *   staff       HIRA 만 (병원 목록에 이미 있다)
 *   bed         HIRA 상세 facility
 *   equipment   HIRA 상세 equipment
 *   capability  NMC basic(중증처치) + HIRA 상세(전문병원·특수진료)
 */
@Injectable()
export class HealthcareDetailBuildService {
  private readonly logger = new Logger(HealthcareDetailBuildService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 동기화 예외. 병원 요청으로 사람이 고친 행은 배치가 건드리지 않는다.
   * 하위 테이블은 통째로 갈아엎기 때문에(DELETE + INSERT), 잠긴 행을 지우지 않도록
   * DELETE 와 INSERT 양쪽에서 빼야 한다.
   */
  private locks!: HospitalLocks;

  async build(): Promise<DetailBuildResult> {
    const startedAt = Date.now();
    const mapper = await CodeMapper.load(this.prisma);
    this.locks = await HospitalLocks.load(this.prisma);

    const hospitals = await this.prisma.$queryRaw<HospitalKey[]>(Prisma.sql`
      SELECT id, ykiho, hpid FROM healthcare_hospital WHERE status = 'active'
    `);
    const byYkiho = new Map<string, number>();
    const byHpid = new Map<string, number>();
    for (const h of hospitals) {
      if (h.ykiho) byYkiho.set(h.ykiho, h.id);
      if (h.hpid) byHpid.set(h.hpid, h.id);
    }

    const result: DetailBuildResult = {
      subjects: await this.buildSubjects(mapper, byYkiho, byHpid),
      hours: await this.buildHours(byHpid, byYkiho),
      staff: await this.buildStaff(byYkiho),
      beds: await this.buildBeds(byYkiho),
      equipments: await this.buildEquipments(mapper, byYkiho),
      capabilities: await this.buildCapabilities(mapper, byYkiho, byHpid),
      // **맨 뒤여야 한다.** 위에서 만든 healthcare_* 를 읽어 "값이 있나" 를 판단한다.
      sections: await this.buildSections(byYkiho, byHpid),
      elapsedMs: 0,
    };

    result.elapsedMs = Date.now() - startedAt;
    return result;
  }

  /**
   * 진료과목.
   *
   * declared(신고 과목)는 역조회 매핑에서 온다 — 8만 병원 전부 있다.
   * specialist_cnt(전문의수)는 HIRA 상세(병원당 1콜)라 받은 만큼만 채워진다.
   *   진료과목 = declared = true
   *   표시과목 = specialist_cnt > 0
   */
  private async buildSubjects(
    mapper: CodeMapper,
    byYkiho: Map<string, number>,
    byHpid: Map<string, number>,
  ): Promise<number> {
    // (hospital_id, subject_cd) → 행.
    // fromHira 를 따로 든다 — 계열이 안 맞을 때 **HIRA 가 뒷받침하는지**로 진위를 가른다.
    const rows = new Map<
      string,
      {
        id: number;
        cd: string;
        declared: boolean;
        doctor: number | null;
        spec: number | null;
        fromHira: boolean;
      }
    >();

    const upsert = (
      id: number,
      cd: string,
      patch: Partial<{
        declared: boolean;
        doctor: number | null;
        spec: number | null;
        fromHira: boolean;
      }>,
    ): void => {
      const key = `${id}|${cd}`;
      const cur = rows.get(key) ?? {
        id,
        cd,
        declared: false,
        doctor: null,
        spec: null,
        fromHira: false,
      };
      rows.set(key, { ...cur, ...patch });
    };

    // HIRA 신고 과목 (역조회 43만쌍)
    for (const r of await this.prisma.hira_hospital_subject.findMany({
      select: { ykiho: true, dgsbjt_cd: true, sdr_cnt: true },
    })) {
      const id = byYkiho.get(r.ykiho);
      const cd = mapper.code('subject', 'hira', r.dgsbjt_cd);
      if (id && cd) {
        upsert(id, cd, { declared: true, doctor: r.sdr_cnt, fromHira: true });
      }
    }

    // NMC 신고 과목 (역조회 42만쌍). HIRA 에 없는 병원을 채운다.
    for (const r of await this.prisma.nmc_hospital_subject.findMany({
      select: { hpid: true, subject_cd: true },
    })) {
      const id = byHpid.get(r.hpid);
      const cd = mapper.code('subject', 'nmc', r.subject_cd);
      if (id && cd) {
        upsert(id, cd, { declared: true });
      }
    }

    // HIRA 상세: 과목별 전문의수 → 표시과목 판정
    for (const r of await this.prisma.hira_hospital_detail.findMany({
      where: { op: 'specialist' },
      select: { ykiho: true, data: true },
    })) {
      const id = byYkiho.get(r.ykiho);
      if (!id) continue;
      for (const item of this.items(r.data)) {
        const cd = mapper.code('subject', 'hira', asString(item.dgsbjtCd));
        if (cd) {
          upsert(id, cd, { spec: asNumber(item.dtlSdrCnt) });
        }
      }
    }

    /**
     * 계열 검사. **거르지 않는다. 기록만 한다.**
     *
     * 계열이 안 맞는 조합이 원본에 온다 — 한의원에 치과, 치과의원에 예방의학과.
     * 오류처럼 보이지만 **지우면 안 된다.** 두 이유 때문이다.
     *
     *   1. 복수면허(의사+한의사)가 실재한다. 성모힐링척의원·한의원은 종별이 한의원인데
     *      정형외과·신경외과를 진료하고 HIRA·NMC 가 둘 다 그렇게 말한다. 진짜다.
     *   2. **두 기관의 갱신 시차가 있다.** 한의원이 이번 달에 의과 진료과를 추가했다면
     *      NMC 는 반영하고 HIRA 는 아직 안 했을 수 있다. 한 시점의 스냅샷만 보고
     *      "불일치 = 오류" 라고 단정할 수 없다.
     *
     * 그래서 통합 테이블에는 다 넣고, healthcare_subject_mismatch 에 표시만 해둔다.
     * **시간이 판단해 준다** — first_seen_at/last_seen_at 이 그걸 위해 있다.
     *   몇 주간 계속 나오고 HIRA 가 끝내 안 준다  → 진짜 오류. 그때 거르면 된다.
     *   다음 동기화에서 사라진다                  → 시차였다. 안 지우길 잘했다.
     * 지금 지우면 이 관찰 자체가 불가능하다.
     */
    const hospitals = await this.prisma.healthcare_hospital.findMany({
      select: { id: true, class_cd: true, ykiho: true, hpid: true },
    });
    const byId = new Map(hospitals.map((h) => [h.id, h]));

    const list = [...rows.values()];

    // 의심스러운 것을 골라 기록한다. list 에서 빼지 않는다 — 위 주석 참고.
    const mismatched = list.filter((row) => {
      const hospital = byId.get(row.id);

      // HIRA 가 없는 병원(NMC 전용)은 대조할 방법이 없다 → 의심하지 않는다.
      // HIRA 가 있는데 이 과목을 안 줬다면 NMC 단독 주장이다 → 계열이 안 맞으면 의심한다.
      const hiraDeclared = hospital?.ykiho ? row.fromHira : undefined;

      return !isSubjectAllowed(
        hospital?.class_cd ?? null,
        row.cd,
        hiraDeclared,
      );
    });

    await this.replace(
      'healthcare_hospital_subject',
      '(hospital_id, subject_cd, declared, doctor_cnt, specialist_cnt)',
      list.map((r) => ({
        hospitalId: r.id,
        key: { subject_cd: r.cd },
        value: Prisma.sql`(${r.id}, ${r.cd}, ${r.declared}, ${r.doctor}, ${r.spec})`,
      })),
    );

    await this.recordMismatches(mismatched, byId);
    return list.length;
  }

  /**
   * 계열 불일치를 기록한다. **통합 테이블에는 이미 들어가 있다** — 여기 있다고 빠진 게 아니다.
   *
   * **status 와 memo 는 덮어쓰지 않는다.** 사람이 "확인했다 / 우리 규칙이 틀렸다" 고 적어둔 것을
   * 매 빌드마다 지우면 확인 작업이 무의미해진다. 갱신하는 건 last_seen_at 뿐이다.
   * 원본이 고치면 이 행이 더 이상 안 나오고 last_seen_at 이 낡은 채로 남는다 — 그게 신호다.
   */
  private async recordMismatches(
    rows: { id: number; cd: string }[],
    byId: Map<
      number,
      { class_cd: string | null; ykiho: string | null; hpid: string | null }
    >,
  ): Promise<void> {
    if (rows.length === 0) {
      return;
    }

    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);

      const values = Prisma.join(
        chunk.map((r) => {
          const h = byId.get(r.id);
          return Prisma.sql`(${r.id}, ${r.cd}, ${h?.class_cd ?? ''}, ${h?.ykiho ?? null}, ${h?.hpid ?? null}, 'open', NOW(), NOW())`;
        }),
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

    this.logger.warn(
      `계열 불일치 ${rows.length.toLocaleString()}건을 기록했다(제외하지 않았다). ` +
        `healthcare_subject_mismatch 에서 확인하라.`,
    );
  }

  /**
   * 진료시간.
   *
   * **두 원본을 합친다.**
   *   NMC   요일별 시작·종료 시각 (월~일 + 공휴일). 달빛 시간도 여기서 온다.
   *   HIRA  점심시간·접수시간 (info). 자유 텍스트라 파싱해야 한다("12시30분~13시30분").
   *
   * 달빛(kind='baby')과 일반(kind='general')은 **나눠서 담는다.** 시간대가 다르기 때문이다 —
   * 연세의원은 일반 09~19시인데 달빛으로 18~23시에 소아를 받는다.
   * 합집합으로 뭉치면 성인이 21시에 갔다가 헛걸음한다.
   *
   * HIRA 는 요일별 진료시간도 주지만(trmtMonStart 등) 쓰지 않는다 —
   * 일요일·공휴일을 안 주고, 달빛도 모른다. NMC 가 요일 커버리지가 넓다.
   */
  private async buildHours(
    byHpid: Map<string, number>,
    byYkiho: Map<string, number>,
  ): Promise<number> {
    // HIRA info 에서 점심·접수시간을 뽑아 (병원 id, 요일) 별로 담아 둔다.
    // 평일(1~5)과 토요일(6)의 값이 다르므로 요일별로 나눠 저장한다.
    const extras = new Map<
      string,
      { breakStart?: string; breakEnd?: string; reception?: string }
    >();

    for (const r of await this.prisma.hira_hospital_detail.findMany({
      where: { op: 'info' },
      select: { ykiho: true, data: true },
    })) {
      const id = byYkiho.get(r.ykiho);
      if (!id) continue;
      const d = this.items(r.data)[0];
      if (!d) continue;

      const week = parseTimeRange(asString(d.lunchWeek));
      const sat = parseTimeRange(asString(d.lunchSat));
      const rcvWeek = parseTimeRange(asString(d.rcvWeek));
      const rcvSat = parseTimeRange(asString(d.rcvSat));

      for (const day of [1, 2, 3, 4, 5]) {
        extras.set(`${id}|${day}`, {
          breakStart: this.compact(week.start),
          breakEnd: this.compact(week.end),
          reception: this.compact(rcvWeek.end),
        });
      }
      extras.set(`${id}|6`, {
        breakStart: this.compact(sat.start),
        breakEnd: this.compact(sat.end),
        reception: this.compact(rcvSat.end),
      });
    }

    const values: BuildRow[] = [];

    const push = (
      id: number,
      kind: 'general' | 'baby',
      data: Record<string, unknown>,
    ): void => {
      for (let day = 1; day <= 8; day++) {
        const open = asString(data[`dutyTime${day}s`]);
        const close = asString(data[`dutyTime${day}c`]);
        if (!open && !close) continue;

        // 점심·접수는 일반 진료에만 붙인다. 달빛은 야간 소아진료라 점심시간이 없다.
        const extra =
          kind === 'general' ? extras.get(`${id}|${day}`) : undefined;

        values.push({
          hospitalId: id,
          key: { kind, day },
          value: Prisma.sql`(${id}, ${kind}, ${day}, ${this.hhmm(open)}, ${this.hhmm(close)},
            ${extra?.breakStart ?? null}, ${extra?.breakEnd ?? null}, ${extra?.reception ?? null})`,
        });
      }
    };

    for (const r of await this.prisma.nmc_hospital.findMany({
      select: { hpid: true, data: true },
    })) {
      const id = byHpid.get(r.hpid);
      if (id) push(id, 'general', r.data as Record<string, unknown>);
    }

    for (const r of await this.prisma.nmc_baby_hospital.findMany({
      select: { hpid: true, data: true },
    })) {
      const id = byHpid.get(r.hpid);
      if (id) push(id, 'baby', r.data as Record<string, unknown>);
    }

    await this.replace(
      'healthcare_hospital_hours',
      '(hospital_id, kind, day, open_time, close_time, break_start, break_end, reception_end)',
      values,
    );
    return values.length;
  }

  /** 'HH:MM' → 'HHMM'. 파서가 콜론 형식으로 주는데 우리는 HHMM 으로 저장한다. */
  private compact(value: string | null): string | undefined {
    return value ? value.replace(':', '') : undefined;
  }

  /** 인력. HIRA 병원 목록에 이미 있다. **총원**이라 과목별 합계와 다르다(겸직). */
  private async buildStaff(byYkiho: Map<string, number>): Promise<number> {
    const rows = await this.prisma.$queryRaw<
      Record<string, unknown>[]
    >(Prisma.sql`
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

    const values: BuildRow[] = [];
    for (const r of rows) {
      const id = byYkiho.get(String(r.ykiho));
      if (!id) continue;
      values.push({
        hospitalId: id,
        key: {},
        value: Prisma.sql`(${id}, ${asNumber(r.total)}, ${asNumber(r.specialist)},
          ${asNumber(r.resident)}, ${asNumber(r.intern)}, ${asNumber(r.general)},
          ${asNumber(r.dentist)}, ${asNumber(r.oriental)}, ${asNumber(r.midwife)})`,
      });
    }

    await this.replace(
      'healthcare_hospital_staff',
      '(hospital_id, doctor_total, specialist, resident, intern, general_doctor, dentist, oriental, midwife)',
      values,
    );
    return values.length;
  }

  /** 병상. HIRA 상세 facility. 규모기관만 있다. */
  private async buildBeds(byYkiho: Map<string, number>): Promise<number> {
    const values: BuildRow[] = [];

    for (const r of await this.prisma.hira_hospital_detail.findMany({
      where: { op: 'facility' },
      select: { ykiho: true, data: true },
    })) {
      const id = byYkiho.get(r.ykiho);
      if (!id) continue;
      const d = this.items(r.data)[0];
      if (!d) continue;

      values.push({
        hospitalId: id,
        key: {},
        value: Prisma.sql`(${id},
          ${asNumber(d.permSbdCnt)}, ${asNumber(d.stdSickbdCnt)}, ${asNumber(d.hghrSickbdCnt)},
          ${asNumber(d.isnrSbdCnt)}, ${asNumber(d.emymCnt)}, ${asNumber(d.soprmCnt)},
          ${asNumber(d.partumCnt)}, ${asNumber(d.nbySprmCnt)}, ${asNumber(d.anvirTrrmSbdCnt)},
          ${asNumber(d.psydeptOpenGnlSbdCnt)}, ${asNumber(d.psydeptClsGnlSbdCnt)})`,
      });
    }

    await this.replace(
      'healthcare_hospital_bed',
      '(hospital_id, total, standard, higher, icu, emergency, operating_room, delivery, neonatal, isolation, psy_open, psy_closed)',
      values,
    );
    return values.length;
  }

  /** 장비. HIRA 상세 equipment. */
  private async buildEquipments(
    mapper: CodeMapper,
    byYkiho: Map<string, number>,
  ): Promise<number> {
    const values: BuildRow[] = [];
    const seen = new Set<string>();

    for (const r of await this.prisma.hira_hospital_equipment.findMany({
      select: { ykiho: true, oft_cd: true, oft_cnt: true },
    })) {
      const id = byYkiho.get(r.ykiho);
      const cd = mapper.code('equipment', 'hira', r.oft_cd);
      if (!id || !cd) continue;

      // 우리 코드로 합쳐지면서 중복이 생길 수 있다 (원본이 쪼개 놓은 코드).
      const key = `${id}|${cd}`;
      if (seen.has(key)) continue;
      seen.add(key);

      values.push({
        hospitalId: id,
        key: { equipment_cd: cd },
        value: Prisma.sql`(${id}, ${cd}, ${r.oft_cnt})`,
      });
    }

    await this.replace(
      'healthcare_hospital_equipment',
      '(hospital_id, equipment_cd, cnt)',
      values,
    );
    return values.length;
  }

  /**
   * 역량. 셋을 한 테이블에 담는다 — "이 병원이 무엇을 할 수 있나"를 코드로 말하는 같은 구조다.
   *   severe    중증질환 처치가능 (NMC basic 의 MKioskTy*)
   *   specialty 전문병원 지정분야 (HIRA)
   *   special   특수진료 (HIRA — 방문진료·치매주치의 등 시범사업)
   */
  private async buildCapabilities(
    mapper: CodeMapper,
    byYkiho: Map<string, number>,
    byHpid: Map<string, number>,
  ): Promise<number> {
    const values: BuildRow[] = [];
    const seen = new Set<string>();

    const push = (id: number, tp: string, cd: string): void => {
      const key = `${id}|${tp}|${cd}`;
      if (seen.has(key)) return;
      seen.add(key);
      values.push({
        hospitalId: id,
        key: { tp, cd },
        value: Prisma.sql`(${id}, ${tp}, ${cd})`,
      });
    };

    // NMC 중증처치. basic 의 MKioskTy1~25 가 'Y' 면 가능하다는 뜻이다.
    // basic 을 받은 병원만. JSON 컬럼의 NULL 필터는 Prisma 가 까다로워서
    // 같은 뜻인 basic_synced_at 으로 거른다.
    for (const r of await this.prisma.nmc_hospital.findMany({
      where: { basic_synced_at: { not: null } },
      select: { hpid: true, basic: true },
    })) {
      const id = byHpid.get(r.hpid);
      if (!id) continue;
      const basic = r.basic as Record<string, unknown>;

      for (const [key, value] of Object.entries(basic)) {
        if (!key.startsWith('MKioskTy')) continue;
        if (asString(value) !== 'Y') continue;
        const cd = mapper.code('severe', 'nmc', key);
        if (cd) push(id, 'severe', cd);
      }
    }

    // HIRA 전문병원(specialty)·특수진료(special) 둘 다 우리 코드로 매핑한다(severe 와 같은 방식).
    // 이름은 healthcare_code 가 가지므로 nm 은 null 로 둔다 — 읽기 경로가 코드로 이름을 찾는다.
    // 아직 시드에 없는 코드면 값을 버리지 않고 원본으로라도 남긴다.
    //   시드(findUnmapped)가 경고로 알려주므로 사람이 매핑을 추가하면 다음 빌드에서 통일된다.
    for (const r of await this.prisma.hira_hospital_srch.findMany({
      select: { ykiho: true, tp: true, srch_cd: true, srch_nm: true },
    })) {
      const id = byYkiho.get(r.ykiho);
      if (!id) continue;
      if (r.tp !== 'specialty' && r.tp !== 'special') continue;

      const cd = mapper.code(r.tp, 'hira', r.srch_cd);
      push(id, r.tp, cd ?? r.srch_cd);
    }

    await this.replace(
      'healthcare_hospital_capability',
      '(hospital_id, tp, cd)',
      values,
    );
    return values.length;
  }

  /**
   * 통째로 갈아엎는다.
   *
   * 하위 테이블은 원본에서 파생된 집계라 증분 upsert 를 할 이유가 없다.
   * 원본에서 사라진 행(병원이 과목을 뺐다)을 따로 지워야 하는 복잡도만 는다.
   *
   * **잠긴 행은 예외다.** 지우지도 않고 다시 만들지도 않는다 —
   * 병원 요청으로 사람이 고친 값이라 그대로 둬야 한다.
   */
  private assertRebuildable(table: string): asserts table is RebuildTable {
    // 타입이 이미 막는다. 그런데도 런타임에서 한 번 더 보는 이유는, 바로 아래에서
    // 이 값이 Prisma.raw() 로 SQL 에 그대로 박히기 때문이다 — 타입은 컴파일 때만 있고,
    // any 하나만 끼어들면 사라진다. `DELETE FROM <이거>` 를 WHERE 없이 치는 자리라
    // 방어를 두 겹으로 둔다.
    if (!(REBUILD_TABLES as readonly string[]).includes(table)) {
      throw new Error(
        `replace() 로 지울 수 있는 테이블이 아니다: ${table}. ` +
          `번역(healthcare_hospital_i18n)처럼 다시 만들 수 없는 것은 여기 오면 안 된다.`,
      );
    }
  }

  private async replace(
    table: RebuildTable,
    columns: string,
    rows: {
      key: Record<string, unknown>;
      hospitalId: number;
      value: Prisma.Sql;
    }[],
  ): Promise<void> {
    this.assertRebuildable(table);

    const locked = rows.filter((r) =>
      this.locks.isRowLocked(table, r.hospitalId, r.key),
    );

    if (locked.length === 0) {
      await this.prisma.$executeRaw(
        Prisma.sql`DELETE FROM ${Prisma.raw(table)}`,
      );
    } else {
      // 잠긴 행만 남기고 지운다. 행이 몇 개 안 되므로 id 목록으로 빼도 된다.
      const keepIds = [...new Set(locked.map((r) => r.hospitalId))];
      await this.prisma.$executeRaw(Prisma.sql`
        DELETE FROM ${Prisma.raw(table)}
         WHERE hospital_id NOT IN (${Prisma.join(keepIds)})
      `);
      // 잠긴 병원의 행 중 **잠기지 않은 것**은 지운다 (그 병원의 다른 요일 등).
      for (const hospitalId of keepIds) {
        const lockedKeys = rows
          .filter((r) => r.hospitalId === hospitalId)
          .filter((r) => this.locks.isRowLocked(table, hospitalId, r.key));

        await this.prisma.$executeRaw(Prisma.sql`
          DELETE FROM ${Prisma.raw(table)}
           WHERE hospital_id = ${hospitalId}
             AND NOT (${Prisma.join(
               lockedKeys.map(
                 (r) =>
                   Prisma.sql`(${Prisma.join(
                     Object.entries(r.key).map(
                       ([col, val]) =>
                         Prisma.sql`${Prisma.raw(col)} = ${val as string | number}`,
                     ),
                     ' AND ',
                   )})`,
               ),
               ' OR ',
             )})
        `);
      }
    }

    const lockedSet = new Set(
      locked.map((r) => `${r.hospitalId}|${JSON.stringify(r.key)}`),
    );
    const insertable = rows.filter(
      (r) => !lockedSet.has(`${r.hospitalId}|${JSON.stringify(r.key)}`),
    );

    for (let i = 0; i < insertable.length; i += CHUNK) {
      const chunk = insertable.slice(i, i + CHUNK);
      await this.prisma.$executeRaw(Prisma.sql`
        INSERT INTO ${Prisma.raw(table)} ${Prisma.raw(columns)}
        VALUES ${Prisma.join(chunk.map((r) => r.value))}
      `);
    }

    this.logger.log(
      `${table}: ${insertable.length.toLocaleString()}행` +
        (locked.length > 0 ? ` (잠금 ${locked.length}행 보존)` : ''),
    );
  }

  /**
   * 섹션별 원본 확인 상태.
   *
   * **반드시 다른 buildX 가 전부 끝난 뒤에 돈다.** "값이 있나" 를 원본에서 다시 파싱하지 않고
   * 이미 만들어진 healthcare_* 에 직접 물어보기 때문이다. 다시 파싱하면 규칙이 buildX 와
   * 조용히 어긋난다 — 같은 걸 두 군데서 판단하게 되므로.
   *
   * "확인했나" 의 판정 근거가 출처마다 다르다.
   *   전수 벌크(hira.list·nmc.fulldown)  병원이 healthcare 에 있다는 것 자체가 증거다.
   *                                      미러에 없으면 애초에 빌드되지 않았다.
   *   개별 조회(detail op·nmc basic)      그 병원의 미러 행이 있냐로 본다.
   *   전수 역조회(subject·srch·baby)      **해당하는 병원만 행이 생겨서 미러로는 못 가린다.**
   *                                      과목 행이 없는 게 미신고인지 1단계 미실행인지
   *                                      모른다. 그래서 sync_state 를 본다.
   *
   * sync_state 를 읽는 건 빌드 시점 의존이라 괜찮다. 금지된 건 **런타임에** healthcare 가
   * 미러·sync 를 참조하는 것이지, 빌드가 읽는 게 아니다(빌드는 이미 미러를 읽는다).
   */
  private async buildSections(
    byYkiho: Map<string, number>,
    byHpid: Map<string, number>,
  ): Promise<number> {
    const now = new Date();

    // 전수 역조회가 성공했나. 1단계가 벌크와 역조회를 같이 돈다.
    const bulk = await this.prisma.sync_state.findMany({
      where: { stage: 1, job: { in: ['hira.1', 'nmc.1'] } },
      select: { job: true, status: true, last_success_at: true },
    });
    const bulkDone = (provider: 'hira' | 'nmc'): Date | null => {
      const row = bulk.find((b) => b.job === `${provider}.1`);
      // isFresh 와 같은 규칙이다 — last_success_at 만 보면 안 된다.
      // 실패한 실행 뒤에도 옛 성공 시각이 남아 있어서다.
      return row?.status === 'done' ? (row.last_success_at ?? null) : null;
    };
    const hiraBulk = bulkDone('hira');
    const nmcBulk = bulkDone('nmc');

    // 개별 조회를 받은 병원. op 하나가 여러 섹션을 먹인다(info → parking·hours_break).
    const detail = new Map<string, Set<string>>();
    for (const r of await this.prisma.hira_hospital_detail.findMany({
      select: { ykiho: true, op: true },
    })) {
      let set = detail.get(r.op);
      if (!set) detail.set(r.op, (set = new Set()));
      set.add(r.ykiho);
    }
    const gotOp = (op: string, ykiho: string | null): boolean =>
      ykiho !== null && (detail.get(op)?.has(ykiho) ?? false);

    const gotBasic = new Set(
      (
        await this.prisma.nmc_hospital.findMany({
          where: { basic_synced_at: { not: null } },
          select: { hpid: true },
        })
      ).map((r) => r.hpid),
    );

    // 역조회 미러의 병원 집합. subject 는 출처가 합집합이라 양쪽을 따로 든다.
    const hiraSubject = new Set(
      (
        await this.prisma.hira_hospital_subject.findMany({
          select: { ykiho: true },
          distinct: ['ykiho'],
        })
      ).map((r) => r.ykiho),
    );
    const nmcSubject = new Set(
      (
        await this.prisma.nmc_hospital_subject.findMany({
          select: { hpid: true },
          distinct: ['hpid'],
        })
      ).map((r) => r.hpid),
    );

    // 값이 실제로 들어갔나. **원본이 아니라 우리 테이블에 묻는다.**
    const has = await this.builtValues();

    const values: BuildRow[] = [];
    const push = (
      id: number,
      section: SectionName,
      syncedAt: Date | null,
      source: string | null,
    ): void => {
      values.push({
        hospitalId: id,
        key: { section },
        // 확인 못 했으면 출처가 있을 수 없다. 둘이 어긋나면 읽는 쪽이 판단 불가라 여기서 막는다.
        value: Prisma.sql`(${id}, ${section}, ${syncedAt ? source : null}, ${syncedAt}, ${now})`,
      });
    };

    const ids = new Map<
      number,
      { ykiho: string | null; hpid: string | null }
    >();
    for (const [ykiho, id] of byYkiho) {
      ids.set(id, { ykiho, hpid: ids.get(id)?.hpid ?? null });
    }
    for (const [hpid, id] of byHpid) {
      ids.set(id, { ykiho: ids.get(id)?.ykiho ?? null, hpid });
    }

    for (const [id, { ykiho, hpid }] of ids) {
      for (const section of SECTIONS) {
        const side = SECTION_SIDE[section];
        // 해당 원본에 링크가 없으면 대상이 아니다 — 행을 만들지 않는다.
        if (side === 'hira' && !ykiho) continue;
        if (side === 'nmc' && !hpid) continue;

        const [syncedAt, source] = this.judgeSection(section, {
          id,
          ykiho,
          hpid,
          now,
          hiraBulk,
          nmcBulk,
          gotOp,
          gotBasic,
          hiraSubject,
          nmcSubject,
          has,
        });
        push(id, section, syncedAt, source);
      }
    }

    await this.replace(
      'healthcare_hospital_section',
      '(hospital_id, section, source, synced_at, built_at)',
      values,
    );
    return values.length;
  }

  /**
   * 섹션 하나의 (확인 시각, 출처) 판정.
   *
   * synced_at 은 **우리가 확인한 시각**이다(미러의 synced_at 복사가 아니다).
   * 그래서 확인된 섹션은 전부 now 다 — 값이 그대로여도 매번 갱신하는 게 규약이다.
   * 예외는 역조회 3종이다. 그건 1단계가 성공한 시각이 곧 확인 시각이라 그걸 쓴다.
   */
  private judgeSection(
    section: SectionName,
    c: SectionContext,
  ): [Date | null, string | null] {
    const { id, ykiho, hpid, now, has } = c;

    switch (section) {
      // 전수 벌크. 병원이 여기 있다는 것 자체가 받았다는 증거라 NULL 이 될 수 없다.
      case 'basic':
        return [now, ykiho ? 'hira' : 'nmc'];
      case 'staff':
        return [now, has.staff.has(id) ? 'hira' : null];
      case 'description':
        return [now, has.description.has(id) ? 'nmc' : null];
      case 'hours':
        return [now, has.hours.has(id) ? 'nmc' : null];
      case 'emergency':
        return [now, has.emergency.has(id) ? 'nmc' : null];

      // 찾아오는 길만 폴백 방향이 반대다 — NMC 우선, 없으면 HIRA info.
      // NMC 는 벌크라 늘 확인되지만 HIRA info 는 개별이라, NMC 에 값이 없고 info 도 아직이면
      // 확인이 안 끝난 것이다.
      case 'directions': {
        if (has.directionsNmc.has(id)) return [now, 'nmc'];
        if (!ykiho) return [now, null];
        if (!c.gotOp('info', ykiho)) return [null, null];
        return [now, has.directions.has(id) ? 'hira' : null];
      }

      // 개별 조회. 그 병원의 미러 행이 있냐로 본다.
      case 'parking':
        return c.gotOp('info', ykiho)
          ? [now, has.parking.has(id) ? 'hira' : null]
          : [null, null];
      case 'hours_break':
        return c.gotOp('info', ykiho)
          ? [now, has.hoursBreak.has(id) ? 'hira' : null]
          : [null, null];
      case 'transport':
        return c.gotOp('transport', ykiho)
          ? [now, has.transport.has(id) ? 'hira' : null]
          : [null, null];
      case 'bed':
        return c.gotOp('facility', ykiho)
          ? [now, has.bed.has(id) ? 'hira' : null]
          : [null, null];
      case 'specialist':
        return c.gotOp('specialist', ykiho)
          ? [now, has.specialist.has(id) ? 'hira' : null]
          : [null, null];
      case 'equipment':
        return c.gotOp('equipment', ykiho)
          ? [now, has.equipment.has(id) ? 'hira' : null]
          : [null, null];
      case 'severe':
        return hpid && c.gotBasic.has(hpid)
          ? [now, has.severe.has(id) ? 'nmc' : null]
          : [null, null];

      // 전수 역조회. 해당 병원만 행이 생기므로 미러 존재로는 못 가린다 — 1단계 성공을 본다.
      case 'subject': {
        const fromHira = ykiho !== null && c.hiraSubject.has(ykiho);
        const fromNmc = hpid !== null && c.nmcSubject.has(hpid);
        // 양쪽 다 확인돼야 합집합의 출처를 확정할 수 있다.
        const done = (ykiho ? c.hiraBulk : true) && (hpid ? c.nmcBulk : true);
        if (!done) return [null, null];
        const at = c.hiraBulk ?? c.nmcBulk ?? now;
        if (fromHira && fromNmc) return [at, 'hira_nmc'];
        if (fromHira) return [at, 'hira'];
        if (fromNmc) return [at, 'nmc'];
        return [at, null];
      }
      case 'specialty':
        return c.hiraBulk
          ? [c.hiraBulk, has.specialty.has(id) ? 'hira' : null]
          : [null, null];
      case 'baby':
        return c.nmcBulk
          ? [c.nmcBulk, has.baby.has(id) ? 'nmc' : null]
          : [null, null];
    }
  }

  /**
   * 각 섹션의 값이 실제로 들어간 병원 id.
   *
   * **원본이 아니라 healthcare_* 에 묻는다.** buildX 가 이미 판단해 쓴 결과라, 여기서 다시
   * 파싱하면 규칙이 두 벌이 되고 언젠가 어긋난다.
   */
  private async builtValues(): Promise<BuiltValues> {
    const ids = async (sql: Prisma.Sql): Promise<Set<number>> =>
      new Set(
        (await this.prisma.$queryRaw<{ id: number }[]>(sql)).map((r) => r.id),
      );

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
      ids(
        Prisma.sql`SELECT id FROM healthcare_hospital WHERE directions IS NOT NULL`,
      ),
      ids(Prisma.sql`
        SELECT id FROM healthcare_hospital
         WHERE park_qty IS NOT NULL OR park_paid IS NOT NULL OR park_note IS NOT NULL
      `),
      ids(
        Prisma.sql`SELECT id FROM healthcare_hospital WHERE transport IS NOT NULL`,
      ),
      ids(
        Prisma.sql`SELECT id FROM healthcare_hospital WHERE emergency_yn = 1`,
      ),
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
      ids(
        Prisma.sql`SELECT DISTINCT hospital_id AS id FROM healthcare_hospital_equipment`,
      ),
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

  /** 상세 JSON 은 1행짜리면 객체, 여러 행이면 배열이다. */
  private items(data: unknown): Record<string, unknown>[] {
    if (Array.isArray(data)) return data as Record<string, unknown>[];
    if (data && typeof data === 'object')
      return [data as Record<string, unknown>];
    return [];
  }

  /** 원본이 시간을 숫자로도 문자열로도 준다. '900' → '0900' */
  private hhmm(value: string | null): string | null {
    if (!value) return null;
    return value.padStart(4, '0').slice(0, 4);
  }
}
