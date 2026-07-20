import { Injectable, Logger } from '@nestjs/common';
import { asNumber, asString } from '@hansapi/application';
import { Prisma, PrismaService } from '@hansapi/data';
import { hospitalTier, IGNORED_SOURCE_CODES } from '@hansapi/data/seed';

import { CodeMapper } from './code-mapper';
import { HospitalLocks } from './hospital-lock';
import { normalizeTel, hiraAreaCode, nmcAreaCode } from './phone';

/** 한 병원의 통합 결과 */
interface BuiltHospital {
  ykiho: string | null;
  hpid: string | null;
  source: 'hira_nmc' | 'hira' | 'nmc';
  name: string;
  addr: string | null;
  tel: string | null;
  homepage: string | null;
  class_cd: string | null;

  /// 종별에서 유도한다. 조회 시점에 종별을 IN 절로 나열하지 않기 위해 미리 계산해 둔다.
  tier: string | null;

  region_cd: string | null;
  emdong_nm: string | null;
  post_no: string | null;
  lat: number | null;
  lon: number | null;
  estb_dd: string | null;
  emergency_yn: boolean;
  baby_yn: boolean;
  asm_cancer_yn: boolean;
  asm_cardio_yn: boolean;
  asm_nicu_yn: boolean;
  intro: string | null;
  notice: string | null;
  directions: string | null;
  park_qty: number | null;
  park_paid: boolean | null;
  park_note: string | null;
  transport: HospitalTransport | null;
}

/** 교통편 하나. 원본에 코드가 없어 전부 원문 그대로다. */
interface TransportRoute {
  /** 원본 trafNm. "지하철", "마을버스" — 분류는 kind 로 하되 표기는 이걸 쓴다. */
  kindName: string | null;
  /** lineNo. "2호선", "21A", "용인경전철" — 숫자만 오지 않는다. */
  line: string | null;
  /** arivPlc. "동백역 3번출구" */
  arrival: string | null;
  /** dir. 이름은 방향이지만 실제로는 목적지가 온다. "용인세브란스병원" */
  dir: string | null;
  /** dist. "500m" — 단위가 붙은 문자열이다. */
  distance: string | null;
  /** rmk. "병원 셔틀버스 이용" */
  note: string | null;
}

/** 수단별로 묶는다. 화면도 수단별 섹션으로 그린다. */
interface HospitalTransport {
  subway: TransportRoute[];
  bus: TransportRoute[];
  etc: TransportRoute[];
}

export interface BuildResult {
  hospitals: number;
  fromBoth: number;
  hiraOnly: number;
  nmcOnly: number;

  /** 병원이 아니라서 건너뛴 것 (NMC 의 소방서·구급차·이송단체 등) */
  skippedNonHospital: number;

  unmappedClass: number;
  unmappedRegion: number;
  elapsedMs: number;
}

const CHUNK = 500;

/** 한 병원의 적정성평가 우수(1등급) 여부. ykiho 로 붙인다. */
interface AsmFlags {
  cancer: boolean;
  cardio: boolean;
  nicu: boolean;
}

/**
 * 분야별 "우수"의 정의. **여기가 유일한 출처다** — 스키마 주석(asm_*_yn)도 이걸 가리킨다.
 *
 * 등급은 1(최상)~5 라 '1' 이면 우수다. 분야마다 대표 항목을 OR 로 묶는다. 컬럼명은
 * hira_hospital_asm 의 generated column(asm_01…)이고 원본 asmGrd 번호와 1:1 이다.
 *
 * 천식(16)은 안 쓴다 — 그 항목만 인코딩이 달라('양호'·0) '1' 비교가 안 통하는데, 어차피
 * 우리 세 분야(암·심뇌혈관·NICU)에 안 들어간다. 여기 항목은 전부 일반 1~5 인코딩이다.
 */
const ASM_EXCELLENT: Record<keyof AsmFlags, readonly string[]> = {
  // 대장암·위암·유방암·폐암
  cancer: ['asm_12', 'asm_13', 'asm_14', 'asm_15'],
  // 급성기뇌졸중·관상동맥우회술
  cardio: ['asm_01', 'asm_06'],
  // 신생아중환자실
  nicu: ['asm_20'],
};

/** map 조회 결과(있을 수도, 없을 수도)를 세 컬럼으로 편다. 평가대상이 아니면 전부 false. */
function asmFlagsOf(flags: AsmFlags | undefined): {
  asm_cancer_yn: boolean;
  asm_cardio_yn: boolean;
  asm_nicu_yn: boolean;
} {
  return {
    asm_cancer_yn: flags?.cancer ?? false,
    asm_cardio_yn: flags?.cardio ?? false,
    asm_nicu_yn: flags?.nicu ?? false,
  };
}

/**
 * 통합 병원 빌드.
 *
 * HIRA + NMC + 매칭(hira_nmc_link) → 우리 코드로 변환 → healthcare_hospital.
 * API 콜이 0이다. DB 안에서 계산으로 끝난다.
 *
 * [병합 정책]
 * 필드마다 어느 원본을 믿을지 다르다. 근거는 실측이다.
 *
 *   식별·종별·지역·주소·좌표·개설일  HIRA 우선
 *     HIRA 는 요양급여 청구 기반이라 실존성이 확실하고 코드 정합성이 낫다.
 *     NMC 코드마스터에는 2010년 폐지된 마산시가 아직 있고, 시군구는 32% 가 미커버다.
 *
 *   진료시간·응급실·달빛                NMC 만 있거나 NMC 가 낫다
 *     HIRA info 에도 진료시간이 있지만 공휴일·달빛을 못 준다.
 *
 *   병상·장비·인력·전문병원·간호등급    HIRA 만 있다 (수가 연동이라 정확하다)
 *
 *   좌표                              둘 다 정확하다 (매칭된 쌍의 거리 중앙값 2m)
 */
@Injectable()
export class HealthcareBuildService {
  private readonly logger = new Logger(HealthcareBuildService.name);

  constructor(private readonly prisma: PrismaService) {}

  async build(): Promise<BuildResult> {
    const startedAt = Date.now();
    const mapper = await CodeMapper.load(this.prisma);
    const locks = await HospitalLocks.load(this.prisma);

    const [hira, nmc, links, baby, infos, transports, asmByYkiho] =
      await Promise.all([
        this.loadHira(),
        this.loadNmc(),
        this.prisma.hira_nmc_link.findMany({
          select: { ykiho: true, hpid: true },
        }),
        this.prisma.nmc_baby_hospital.findMany({ select: { hpid: true } }),
        // HIRA 세부정보. 주차·찾아오는 길이 여기 있다.
        this.prisma.hira_hospital_detail.findMany({
          where: { op: 'info' },
          select: { ykiho: true, data: true },
        }),
        // HIRA 교통정보. 병원당 N행이라 배열로 들어 있다.
        this.prisma.hira_hospital_detail.findMany({
          where: { op: 'transport' },
          select: { ykiho: true, data: true },
        }),
        // 적정성평가 1등급 파생 플래그. ykiho 로 붙인다.
        this.loadAsmFlags(),
      ]);

    const transportByYkiho = new Map(
      transports.map((row) => [row.ykiho, this.toTransport(row.data)]),
    );

    const infoByYkiho = new Map(
      infos.map((row) => {
        const data = (Array.isArray(row.data) ? row.data[0] : row.data) as
          Record<string, unknown> | undefined;
        return [row.ykiho, data ?? {}];
      }),
    );

    const nmcByHpid = new Map(nmc.map((row) => [row.hpid, row]));
    const linkedHpid = new Map(links.map((l) => [l.ykiho, l.hpid]));
    const usedHpid = new Set(links.map((l) => l.hpid));
    const babySet = new Set(baby.map((b) => b.hpid));

    const built: BuiltHospital[] = [];
    let unmappedClass = 0;
    let unmappedRegion = 0;
    let skippedNonHospital = 0;

    // 1) HIRA 기준. 매칭된 NMC 가 있으면 합친다.
    for (const h of hira) {
      const hpid = linkedHpid.get(h.ykiho);
      const n = hpid ? nmcByHpid.get(hpid) : undefined;

      const classCd = mapper.code('class', 'hira', h.clCd) ?? null;
      const regionCd = mapper.regionByHira(h.sgguCd) ?? null;
      if (!classCd && h.clCd) unmappedClass += 1;
      if (!regionCd && h.sgguCd) unmappedRegion += 1;

      built.push({
        ykiho: h.ykiho,
        hpid: n?.hpid ?? null,
        source: n ? 'hira_nmc' : 'hira',
        name: h.name,
        addr: h.addr,
        // 원본 HIRA sggu_cd 로 지역번호를 뽑는다 — tel 이 NMC 에서 왔어도 병원 위치는 같다.
        tel: normalizeTel(h.tel ?? n?.tel ?? null, hiraAreaCode(h.sgguCd)),
        homepage: h.homepage,
        class_cd: classCd,
        tier: hospitalTier(classCd),
        region_cd: regionCd,
        emdong_nm: h.emdongNm,
        post_no: h.postNo,
        lat: h.lat ?? n?.lat ?? null,
        lon: h.lon ?? n?.lon ?? null,
        estb_dd: h.estbDd,
        // 응급실·달빛은 NMC 만 안다.
        emergency_yn: n?.emergencyYn ?? false,
        baby_yn: n ? babySet.has(n.hpid) : false,
        // 적정성평가 우수는 HIRA(ykiho)에만 있다. 평가대상이 아니면 map 에 없어 전부 false.
        ...asmFlagsOf(asmByYkiho.get(h.ykiho)),

        // 소개·기타안내는 NMC 만 준다. 구조화된 진료시간이 못 담는 예외가 여기 자유 텍스트로 온다.
        intro: n?.intro ?? null,
        notice: n?.notice ?? null,
        // 찾아오는 길은 NMC 우선, 없으면 HIRA info 의 조각을 이어 붙인다.
        directions:
          n?.directions ?? this.hiraDirections(infoByYkiho.get(h.ykiho)),
        ...this.hiraParking(infoByYkiho.get(h.ykiho)),

        // 대중교통은 HIRA 만 준다. NMC 의 directions 와 겹쳐 보여도 별개다 —
        // 하나는 병원이 쓴 문장, 하나는 심평원이 준 표라서 서로 어긋나는 경우가 많다.
        transport: transportByYkiho.get(h.ykiho) ?? null,
      });
    }

    // 2) NMC 에만 있는 병원. 매칭에서 no_candidate 로 남은 것들이다.
    //
    // NMC 기관구분에는 **병원이 아닌 것**이 섞여 있다 — 소방서·경찰서·지자체·구급차·이송단체.
    // 응급의료 정보 시스템이라 신고·이송 기관까지 담기 때문이다. 통합 병원의 대상이 아니다.
    const ignoredDiv = new Set<string>(IGNORED_SOURCE_CODES.class.nmc);

    for (const n of nmc) {
      if (usedHpid.has(n.hpid)) {
        continue;
      }
      if (n.dutyDiv && ignoredDiv.has(n.dutyDiv)) {
        skippedNonHospital += 1;
        continue;
      }

      const classCd = mapper.code('class', 'nmc', n.dutyDiv) ?? null;
      const regionCd = mapper.regionByNmc(n.sidoNm, n.sgguNm) ?? null;
      if (!classCd && n.dutyDiv) unmappedClass += 1;
      if (!regionCd && n.sidoNm) unmappedRegion += 1;

      built.push({
        ykiho: null,
        hpid: n.hpid,
        source: 'nmc',
        name: n.name,
        addr: n.addr,
        tel: normalizeTel(n.tel, nmcAreaCode(n.sidoNm)),
        homepage: null,
        class_cd: classCd,
        tier: hospitalTier(classCd),
        region_cd: regionCd,
        emdong_nm: null,
        post_no: n.postNo,
        lat: n.lat,
        lon: n.lon,
        estb_dd: null,
        emergency_yn: n.emergencyYn,
        baby_yn: babySet.has(n.hpid),
        // NMC 전용 병원은 ykiho 가 없다 — 적정성평가(HIRA 개념)를 붙일 수 없어 전부 false.
        asm_cancer_yn: false,
        asm_cardio_yn: false,
        asm_nicu_yn: false,
        intro: n.intro,
        notice: n.notice,
        directions: n.directions,
        park_qty: null,
        park_paid: null,
        park_note: null,
        // NMC 전용 병원은 ykiho 가 없어 HIRA 교통정보를 붙일 방법이 없다.
        transport: null,
      });
    }

    await this.upsert(built, locks);

    const result: BuildResult = {
      hospitals: built.length,
      fromBoth: built.filter((b) => b.source === 'hira_nmc').length,
      hiraOnly: built.filter((b) => b.source === 'hira').length,
      nmcOnly: built.filter((b) => b.source === 'nmc').length,
      skippedNonHospital,
      unmappedClass,
      unmappedRegion,
      elapsedMs: Date.now() - startedAt,
    };

    if (unmappedClass > 0 || unmappedRegion > 0) {
      this.logger.warn(
        `매핑 실패 — 종별 ${unmappedClass}건 · 지역 ${unmappedRegion}건. 시드를 확인하라.`,
      );
    }

    return result;
  }

  /** HIRA info 의 찾아오는 길. 공공건물 이름 + 방향 + 거리 조각을 이어 붙인다. */
  private hiraDirections(
    info: Record<string, unknown> | undefined,
  ): string | null {
    if (!info) {
      return null;
    }
    const parts = [
      asString(info.plcNm),
      asString(info.plcDir),
      asString(info.plcDist),
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : null;
  }

  /** HIRA info 의 주차 정보. */
  private hiraParking(info: Record<string, unknown> | undefined): {
    park_qty: number | null;
    park_paid: boolean | null;
    park_note: string | null;
  } {
    if (!info) {
      return { park_qty: null, park_paid: null, park_note: null };
    }
    const paid = asString(info.parkXpnsYn);
    return {
      park_qty: asNumber(info.parkQty),
      park_paid: paid === null ? null : paid === 'Y',
      park_note: asString(info.parkEtc),
    };
  }

  /**
   * 값이 없는 것과 마찬가지인 표기를 지운다.
   *
   * **병원이 빈 칸을 채우려고 기호를 찍어 넣는다.** 입력 폼이 필수값을 요구했거나 습관이다.
   * 실측(2026-07) 11,634건 중 48건 — dir 22 · rmk 12 · dist 11 · lineNo 2 · arivPlc 1.
   *   "-" "." "·" "없음" "해당없음" "N/A"
   * 그대로 두면 "○○정류장 - → 50m" 처럼 하이픈이 덩그러니 남는다. 강북삼성병원이 그랬다.
   *
   * **화면이 아니라 여기서 지운다.** 화면에서만 거르면 API 를 쓰는 다른 클라이언트가
   * 같은 문제를 다시 겪는다. 원본(hira_hospital_detail)에는 그대로 남으므로 미러링은 안 깨진다.
   */
  private clean(value: string | null): string | null {
    if (value === null) {
      return null;
    }
    const trimmed = value.trim();
    if (trimmed === '' || /^[-.·_]+$/.test(trimmed)) {
      return null;
    }
    return /^(없음|무|해당\s*없음|N\/?A)$/i.test(trimmed) ? null : trimmed;
  }

  /**
   * HIRA 교통정보를 수단별로 묶는다.
   *
   * trafNm 은 열거형이 아니다 — 매뉴얼 예제에도 "지하철" 옆에 "마을버스" 가 나오고,
   * 스펙상 100자 자유 문자열이다. 그래서 값을 그대로 믿고 분기하지 않고 포함 여부로 분류한다.
   * 이러면 시내버스·광역버스·마을버스가 전부 bus 로 흡수된다. 원문(kindName)은 버리지 않는다 —
   * 화면에 "마을버스 5" 로 정확히 적으려면 필요하다.
   */
  private toTransport(data: Prisma.JsonValue): HospitalTransport | null {
    const items = (Array.isArray(data) ? data : [data]) as Record<
      string,
      unknown
    >[];

    const result: HospitalTransport = { subway: [], bus: [], etc: [] };

    for (const item of items) {
      if (!item || typeof item !== 'object') {
        continue;
      }

      const kindName = this.clean(asString(item.trafNm));
      const route: TransportRoute = {
        kindName,
        line: this.clean(asString(item.lineNo)),
        arrival: this.clean(asString(item.arivPlc)),
        dir: this.clean(asString(item.dir)),
        distance: this.clean(asString(item.dist)),
        note: this.clean(asString(item.rmk)),
      };

      // 노선도 하차지점도 없으면 남길 게 없다.
      if (!route.line && !route.arrival) {
        continue;
      }

      const bucket = kindName?.includes('지하철')
        ? result.subway
        : kindName?.includes('버스')
          ? result.bus
          : result.etc;

      bucket.push(route);
    }

    const total = result.subway.length + result.bus.length + result.etc.length;
    return total > 0 ? result : null;
  }

  /**
   * upsert. **id 를 재사용한다** — 대외 API 가 노출하는 값이라 재생성마다 바뀌면 안 된다.
   * ykiho 나 hpid 가 UNIQUE 라 ON DUPLICATE KEY 가 기존 행을 찾아 준다.
   *
   * source='manual'(직접 등록)은 건드리지 않는다.
   */
  private async upsert(
    rows: BuiltHospital[],
    locks: HospitalLocks,
  ): Promise<void> {
    // 잠긴 컬럼은 기존 값을 유지한다. 병원이 요청해서 사람이 고친 값이다.
    // 컬럼 단위라 전화번호만 잠가도 주소·종별은 계속 최신을 따라간다.
    const lockedIds = (field: string): Set<number> =>
      locks.lockedHospitalsFor('healthcare_hospital', field);

    const keep = (field: string): Prisma.Sql => {
      const ids = lockedIds(field);
      const self = Prisma.raw(`healthcare_hospital.${field}`);
      const fresh = Prisma.raw(`new.${field}`);

      // source='manual'(직접 등록)은 통째로 보존한다. 잠긴 컬럼도 보존한다.
      const locked =
        ids.size === 0
          ? Prisma.sql`healthcare_hospital.source = 'manual'`
          : Prisma.sql`healthcare_hospital.source = 'manual'
              OR healthcare_hospital.id IN (${Prisma.join([...ids])})`;

      return Prisma.sql`${Prisma.raw(field)} = IF(${locked}, ${self}, ${fresh})`;
    };

    const FIELDS = [
      'hpid',
      'source',
      'name',
      'addr',
      'tel',
      'homepage',
      'class_cd',
      'tier',
      'region_cd',
      'emdong_nm',
      'post_no',
      'lat',
      'lon',
      'estb_dd',
      'emergency_yn',
      'baby_yn',
      'asm_cancer_yn',
      'asm_cardio_yn',
      'asm_nicu_yn',
      'intro',
      'notice',
      'directions',
      'park_qty',
      'park_paid',
      'park_note',
      'transport',
    ];
    const updates = Prisma.join(FIELDS.map(keep));

    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);

      const values = Prisma.join(
        chunk.map(
          (r) => Prisma.sql`(
            ${r.ykiho}, ${r.hpid}, ${r.source}, ${r.name}, ${r.addr}, ${r.tel}, ${r.homepage},
            ${r.class_cd}, ${r.tier}, ${r.region_cd}, ${r.emdong_nm}, ${r.post_no},
            ${r.lat}, ${r.lon}, ${r.estb_dd}, ${r.emergency_yn}, ${r.baby_yn},
            ${r.asm_cancer_yn}, ${r.asm_cardio_yn}, ${r.asm_nicu_yn},
            ${r.intro}, ${r.notice}, ${r.directions},
            ${r.park_qty}, ${r.park_paid}, ${r.park_note},
            ${r.transport === null ? null : Prisma.sql`CAST(${JSON.stringify(r.transport)} AS JSON)`},
            'active', NOW(), NOW(), NOW()
          )`,
        ),
      );

      await this.prisma.$executeRaw(Prisma.sql`
        INSERT INTO healthcare_hospital
          (ykiho, hpid, source, name, addr, tel, homepage,
           class_cd, tier, region_cd, emdong_nm, post_no,
           lat, lon, estb_dd, emergency_yn, baby_yn,
           asm_cancer_yn, asm_cardio_yn, asm_nicu_yn,
           intro, notice, directions, park_qty, park_paid, park_note,
           transport,
           status, built_at, created_at, updated_at)
        VALUES ${values} AS new
        ON DUPLICATE KEY UPDATE
          ${updates},
          status = 'active',
          built_at = NOW()
      `);
    }
  }

  /**
   * 적정성평가 1등급을 분야별로 접어 ykiho→플래그 맵으로 만든다.
   *
   * asm_* 은 hira_hospital_asm 의 generated column(VIRTUAL)이라 SQL 에서 바로 '1' 비교가 된다.
   * 한 분야라도 우수인 병원만 돌려준다 — 나머지는 map 에 없어 빌드에서 false 가 된다.
   */
  private async loadAsmFlags(): Promise<Map<string, AsmFlags>> {
    const col = (field: keyof AsmFlags): Prisma.Sql =>
      Prisma.join(
        ASM_EXCELLENT[field].map((c) => Prisma.sql`${Prisma.raw(c)} = '1'`),
        ' OR ',
      );

    const rows = await this.prisma.$queryRaw<
      { ykiho: string; cancer: number; cardio: number; nicu: number }[]
    >(Prisma.sql`
      SELECT ykiho,
             (${col('cancer')}) AS cancer,
             (${col('cardio')}) AS cardio,
             (${col('nicu')})   AS nicu
        FROM hira_hospital_asm
       WHERE (${col('cancer')}) OR (${col('cardio')}) OR (${col('nicu')})
    `);

    return new Map(
      rows.map((r) => [
        r.ykiho,
        { cancer: !!r.cancer, cardio: !!r.cardio, nicu: !!r.nicu },
      ]),
    );
  }

  private async loadHira() {
    const rows = await this.prisma.$queryRaw<
      Record<string, unknown>[]
    >(Prisma.sql`
      SELECT ykiho, cl_cd, sggu_cd, emdong_nm,
             JSON_UNQUOTE(JSON_EXTRACT(data, '$.yadmNm'))  nm,
             JSON_UNQUOTE(JSON_EXTRACT(data, '$.addr'))    addr,
             JSON_UNQUOTE(JSON_EXTRACT(data, '$.telno'))   tel,
             JSON_UNQUOTE(JSON_EXTRACT(data, '$.hospUrl')) url,
             JSON_UNQUOTE(JSON_EXTRACT(data, '$.postNo'))  post_no,
             JSON_UNQUOTE(JSON_EXTRACT(data, '$.estbDd'))  estb_dd,
             JSON_EXTRACT(data, '$.YPos') lat,
             JSON_EXTRACT(data, '$.XPos') lon
        FROM hira_hospital
    `);

    return rows.map((r) => ({
      ykiho: String(r.ykiho),
      clCd: asString(r.cl_cd),
      sgguCd: asString(r.sggu_cd),
      emdongNm: asString(r.emdong_nm),
      name: asString(r.nm) ?? '',
      addr: asString(r.addr),
      tel: asString(r.tel),
      homepage: asString(r.url),
      postNo: asString(r.post_no),
      estbDd: asString(r.estb_dd),
      lat: asNumber(r.lat),
      lon: asNumber(r.lon),
    }));
  }

  private async loadNmc() {
    const rows = await this.prisma.$queryRaw<
      Record<string, unknown>[]
    >(Prisma.sql`
      SELECT hpid, duty_div, sido_nm, sggu_nm,
             JSON_UNQUOTE(JSON_EXTRACT(data, '$.dutyName')) nm,
             JSON_UNQUOTE(JSON_EXTRACT(data, '$.dutyAddr')) addr,
             JSON_UNQUOTE(JSON_EXTRACT(data, '$.dutyTel1')) tel,
             JSON_UNQUOTE(JSON_EXTRACT(data, '$.postCdn1')) post1,
             JSON_UNQUOTE(JSON_EXTRACT(data, '$.postCdn2')) post2,
             JSON_UNQUOTE(JSON_EXTRACT(data, '$.dutyEryn')) eryn,
             JSON_UNQUOTE(JSON_EXTRACT(data, '$.dutyInf')) intro,
             JSON_UNQUOTE(JSON_EXTRACT(data, '$.dutyEtc')) notice,
             JSON_UNQUOTE(JSON_EXTRACT(data, '$.dutyMapimg')) directions,
             JSON_EXTRACT(data, '$.wgs84Lat') lat,
             JSON_EXTRACT(data, '$.wgs84Lon') lon
        FROM nmc_hospital
    `);

    return rows.map((r) => ({
      hpid: String(r.hpid),
      dutyDiv: asString(r.duty_div),
      sidoNm: asString(r.sido_nm),
      sgguNm: asString(r.sggu_nm),
      name: asString(r.nm) ?? '',
      addr: asString(r.addr),
      tel: asString(r.tel),
      // 우편번호는 앞자리·뒷자리로 쪼개져 있다.
      postNo:
        `${asString(r.post1) ?? ''}${asString(r.post2) ?? ''}`.trim() || null,
      // dutyEryn 은 1=운영, 2=미운영이다. (Y/N 이 아니다)
      emergencyYn: asString(r.eryn) === '1',
      intro: asString(r.intro),
      notice: asString(r.notice),
      directions: asString(r.directions),
      lat: asNumber(r.lat),
      lon: asNumber(r.lon),
    }));
  }
}
