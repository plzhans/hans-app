import { Injectable, Logger } from '@nestjs/common';
import { asNumber, asString } from '@hansapp/application';
import { hospitalTier, splitHospitalName, IGNORED_SOURCE_CODES } from '@hansapp/data/seed';

import { HealthcareBuildRepository } from './healthcare-build.repository';
import { normalizeTel, hiraAreaCode, nmcAreaCode } from './phone';

/** 한 병원의 통합 결과 */
export interface BuiltHospital {
  ykiho: string | null;
  hpid: string | null;
  source: 'hira_nmc' | 'hira' | 'nmc';

  /// 표시용 짧은 이름. 원문에서 법인 표기를 뗀 파생값이다(splitHospitalName).
  name: string;
  /// 원문 그대로. 법인 표기가 없으면 name 과 같은 값이다.
  legal_name: string;
  /// 법인격 + 법인명. 못 가르면 null.
  corp_name: string | null;

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
  intro: string | null;
  notice: string | null;
  directions: string | null;
  park_qty: number | null;
  park_paid: boolean | null;
  park_note: string | null;
  transport: HospitalTransport | null;
}

/** 교통편 하나. 원본에 코드가 없어 전부 원문 그대로다. */
export interface TransportRoute {
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
export interface HospitalTransport {
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

  /**
   * 매칭이 붙어 두 행에서 한 행으로 합친 병원 수.
   *
   * 매칭이 새로 붙은 만큼 나오고, 한 번 합쳐지면 다시 나오지 않는다 —
   * 매일 큰 수가 찍히면 매칭 규칙이 흔들리고 있다는 뜻이다.
   */
  merged: number;
  elapsedMs: number;
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

  constructor(private readonly repo: HealthcareBuildRepository) {}

  async build(): Promise<BuildResult> {
    const startedAt = Date.now();
    const mapper = await this.repo.loadCodeMapper();
    const locks = await this.repo.loadLocks();

    const [hira, nmc, links, baby, infos, transports] = await Promise.all([
      this.loadHira(),
      this.loadNmc(),
      this.repo.loadLinks(),
      this.repo.loadBabyHospitals(),
      // HIRA 세부정보. 주차·찾아오는 길이 여기 있다.
      this.repo.loadInfoDetails(),
      // HIRA 교통정보. 병원당 N행이라 배열로 들어 있다.
      this.repo.loadTransportDetails(),
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

    /*
      **두 배열로 나눠 담는다. 합칠 때의 순서가 곧 SQL 실행 순서다.**

      매칭이 풀린 병원은 한 행이 두 행으로 갈라지는데, 그때 HIRA 행이 먼저 처리돼야
      기존 id 가 HIRA 병원에 남는다. NMC 행이 먼저 들어가면 그 id 를 NMC 병원이 가져가고
      HIRA 병원이 새 번호를 받는다 — 죽지는 않고 **조용히 주인이 뒤바뀐다.**

      한 배열에 순서대로 밀어 넣으면 그 순서가 우연처럼 보여서, 누가 루프를 옮기거나
      정렬을 넣으면 소리 없이 깨진다. 배열을 갈라 두면 합치는 자리에서 순서가 드러난다.
    */
    const hiraRows: BuiltHospital[] = [];
    const nmcRows: BuiltHospital[] = [];
    let unmappedClass = 0;
    let unmappedRegion = 0;
    let skippedNonHospital = 0;

    // 1) HIRA 기준. 매칭된 NMC 가 있으면 합친다.
    //
    // 종별이 무시 대상이면(약국 등) 아예 만들지 않는다. 시드에서 매핑을 지우는 것만으로는
    // 부족하다 — 매핑이 없으면 class_cd 가 NULL 인 채로 들어와 "기타" 처럼 남는다.
    const ignoredClCd = new Set<string>(IGNORED_SOURCE_CODES.class.hira);

    for (const h of hira) {
      if (h.clCd && ignoredClCd.has(h.clCd)) {
        skippedNonHospital += 1;
        continue;
      }

      const hpid = linkedHpid.get(h.ykiho);
      const n = hpid ? nmcByHpid.get(hpid) : undefined;

      const classCd = mapper.code('class', 'hira', h.clCd) ?? null;
      const regionCd = mapper.regionByHira(h.sgguCd) ?? null;
      if (!classCd && h.clCd) unmappedClass += 1;
      if (!regionCd && h.sgguCd) unmappedRegion += 1;

      // 이름은 HIRA 를 쓴다. NMC 와 매칭됐어도 마찬가지다 — 요양기호 기준 표기가 원본이다.
      const hiraName = splitHospitalName(h.name);

      hiraRows.push({
        ykiho: h.ykiho,
        hpid: n?.hpid ?? null,
        source: n ? 'hira_nmc' : 'hira',
        name: hiraName.name,
        legal_name: h.name,
        corp_name: hiraName.corpName,
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

        // 소개·기타안내는 NMC 만 준다. 구조화된 진료시간이 못 담는 예외가 여기 자유 텍스트로 온다.
        intro: n?.intro ?? null,
        notice: n?.notice ?? null,
        // 찾아오는 길은 NMC 우선, 없으면 HIRA info 의 조각을 이어 붙인다.
        directions: n?.directions ?? this.hiraDirections(infoByYkiho.get(h.ykiho)),
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

      const nmcName = splitHospitalName(n.name);

      nmcRows.push({
        ykiho: null,
        hpid: n.hpid,
        source: 'nmc',
        name: nmcName.name,
        legal_name: n.name,
        corp_name: nmcName.corpName,
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

    /*
      **갈라진 두 행을 먼저 합친다. upsert 앞이어야 한다.**

      매칭이 붙으면 한 병원이 ykiho·hpid 를 둘 다 갖는 한 행이어야 하는데, 매칭 전에 만들어진
      병원은 HIRA 행과 NMC 행으로 갈라져 있다. 그 상태로 upsert 하면 ykiho 로 찾은 행에
      hpid 를 넣으려다 **다른 행이 쥔 hpid 와 부딪혀 1062 로 죽는다** — 유니크 키가 둘이라
      ON DUPLICATE KEY UPDATE 가 구해 주지 못하는 자리다. 실제로 이것 때문에 빌드가
      보름 넘게 완주하지 못했다.
    */
    const merged = await this.mergeSplitPairs();

    /*
      **HIRA 가 먼저다.** 위 주석 참고 — 매칭이 풀릴 때 기존 id 를 누가 지키는지가
      이 순서로 정해진다. upsert 는 배열 순서대로 SQL 을 친다.
    */
    const built = [...hiraRows, ...nmcRows];

    await this.repo.upsertHospitals(built, locks);

    const result: BuildResult = {
      hospitals: built.length,
      fromBoth: built.filter((b) => b.source === 'hira_nmc').length,
      hiraOnly: built.filter((b) => b.source === 'hira').length,
      nmcOnly: built.filter((b) => b.source === 'nmc').length,
      skippedNonHospital,
      unmappedClass,
      unmappedRegion,
      merged,
      elapsedMs: Date.now() - startedAt,
    };

    if (unmappedClass > 0 || unmappedRegion > 0) {
      this.logger.warn(
        `Unmapped rows: ${unmappedClass} by class, ${unmappedRegion} by region. Check the seed.`,
      );
    }

    return result;
  }

  /**
   * 매칭이 붙었는데 두 행으로 갈라져 있는 병원을 한 행으로 합친다. 합친 수를 돌려준다.
   *
   * **지는 행을 지우기만 한다.** 남은 행이 두 키를 갖는 것은 뒤따르는 upsert 가 하고,
   * 자식은 상세 빌드가 원본에서 다시 만든다 — 옮길 것이 없다.
   *
   * [어느 행을 남기나]
   * 1. **잠긴 행이 있으면 그쪽.** 사람이 손으로 고친 값이라 지우면 되돌릴 수 없다.
   * 2. 없으면 **id 가 작은 쪽.** 먼저 만들어진 번호라 밖에 알려졌을 시간이 길다
   *    — 사라진 id 로 들어오는 링크·색인이 깨지는 쪽을 줄인다.
   *    (자식 데이터가 많은 쪽을 고르는 것은 뜻이 없다. 어차피 다시 만들어진다)
   *
   *    **어느 쪽을 남겨도 두 키가 다 채워진다.** ykiho·hpid 가 모두 upsert 갱신 대상이라
   *    남은 행이 어느 키로 찾히든 나머지 키를 받는다. 예전에는 hpid 만 갱신 대상이라
   *    NMC 행을 남기면 ykiho 가 영영 NULL 로 남았다(실측 15건).
   * 3. **양쪽 다 잠겨 있으면 건드리지 않는다.** 어느 쪽을 지워도 수작업이 사라지므로
   *    사람이 판단해야 한다. 그 병원은 이번에도 upsert 에서 걸리지만, 조용히 값을
   *    잃는 것보다 낫다.
   */
  private async mergeSplitPairs(): Promise<number> {
    const pairs = await this.repo.findSplitPairs();
    if (pairs.length === 0) {
      return 0;
    }

    const losers: number[] = [];
    let blocked = 0;

    for (const pair of pairs) {
      const hiraLocked = Number(pair.hiraLocked) > 0;
      const nmcLocked = Number(pair.nmcLocked) > 0;

      if (hiraLocked && nmcLocked) {
        blocked += 1;
        continue;
      }
      if (hiraLocked) {
        losers.push(pair.nmcId);
      } else if (nmcLocked) {
        losers.push(pair.hiraId);
      } else {
        losers.push(Math.max(pair.hiraId, pair.nmcId));
      }
    }

    if (blocked > 0) {
      this.logger.error(
        `${blocked} split pair(s) are locked on both sides — merge them by hand.` +
          ' The build will keep failing on these.',
      );
    }

    await this.repo.deleteHospitals(losers);
    this.logger.log(`Merged ${losers.length} split hospital(s) into one row each`);
    return losers.length;
  }

  /** HIRA info 의 찾아오는 길. 공공건물 이름 + 방향 + 거리 조각을 이어 붙인다. */
  private hiraDirections(info: Record<string, unknown> | undefined): string | null {
    if (!info) {
      return null;
    }
    const parts = [asString(info.plcNm), asString(info.plcDir), asString(info.plcDist)].filter(
      Boolean,
    );
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
  private toTransport(data: unknown): HospitalTransport | null {
    const items = (Array.isArray(data) ? data : [data]) as Record<string, unknown>[];

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

  private async loadHira() {
    const rows = await this.repo.loadHiraRows();

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
    const rows = await this.repo.loadNmcRows();

    return rows.map((r) => ({
      hpid: String(r.hpid),
      dutyDiv: asString(r.duty_div),
      sidoNm: asString(r.sido_nm),
      sgguNm: asString(r.sggu_nm),
      name: asString(r.nm) ?? '',
      addr: asString(r.addr),
      tel: asString(r.tel),
      // 우편번호는 앞자리·뒷자리로 쪼개져 있다.
      postNo: `${asString(r.post1) ?? ''}${asString(r.post2) ?? ''}`.trim() || null,
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
