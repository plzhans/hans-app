import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { Page } from '@hansapp/common';
import { TIER_NAMES } from '@hansapp/data/seed';
import type {
  HealthcareHospital as HospitalModel,
  HealthcareHospitalI18n as HospitalI18n,
} from '@hansapp/data';
import {
  FALLBACK_LANG,
  pickLangName,
  type SupportedLang,
} from '@hansapp/common';

import {
  HealthcareHospitalRepository,
  DEFAULT_SEARCH_ORDER,
  type HospitalScrollSource,
  type HospitalSearchFilter,
  type HospitalSearchOrder,
  type HospitalListRow,
  type HospitalDetailModel,
} from './healthcare-hospital.repository';
import {
  HealthcareHospitalSearchRepository,
  type HospitalNearbyRow,
  type HospitalNearbyRows,
} from './healthcare-hospital-search.repository';
import {
  HealthcareCodeCache,
  codeName,
  type CodeEntry,
} from './healthcare-code.cache';
import {
  HiraAsmCodeCache,
  asmGroupName,
  asmItemName,
} from './hira-asm-code.cache';
import { RegionCache, regionName } from '../region/region.cache';
import { annotateKo, pickText } from './hospital-text';

import { asString } from '../common/coerce';
import { CachePrefix } from '../common/cache-keys';
import { stationName } from './station';

import {
  HospitalAssessment,
  HospitalAssessmentGroup,
  HospitalAssessmentItem,
  HospitalDetail,
  HospitalFilterCommand,
  HospitalMatchedSubject,
  HospitalNearbyCommand,
  HospitalNearbyResult,
  HospitalScrollCommand,
  HospitalScrollResult,
  HospitalSearchCommand,
  HospitalSummary,
  HospitalTransport,
} from './dto/hospital.result';

/**
 * 요약(HospitalSummary) 매핑의 정규화된 입력.
 *
 * search 는 raw SQL flat row 를, get 은 Prisma 모델을 주므로 원천 모양이 다르다.
 * 두 경로가 각자 이 형태로 맞춘 뒤 toSummary 하나로 매핑한다. 코드값은 asString 을 거친 뒤,
 * 좌표·불리언은 이미 강제된 값으로 담는다.
 */
interface SummarySource {
  id: number;
  /** 한국어 원문 이름 */
  name: string;
  /** 번역명(없으면 null) */
  i18nName: string | null;
  classCd: string | null;
  tierCd: string | null;
  specialtyCd: string | null;
  /** 지하철 하차지점 원문. 목록만 채우고 상세는 null(원래 동작). */
  station: string | null;
  stationLine: string | null;
  regionCd: string | null;
  tel: string | null;
  emergency: boolean;
  baby: boolean;
  addr: string | null;
  postNo: string | null;
  emdongNm: string | null;
  lat: number | undefined;
  lon: number | undefined;
  /** 기준 좌표로부터의 직선거리(m). 거리순 조회일 때만 있다. */
  distance?: number;
}

/**
 * 캐시에 담는 언어무관 base. Prisma 원본 그대로지만, 매핑이 값을 방어적으로 강제(this.num 등)하므로
 * lat/lon(Decimal)·날짜(DateTime)가 JSON round-trip 에서 문자열이 돼도 안전하다. BigInt 는 스키마에 없다.
 */
interface HospitalBase {
  detail: HospitalDetailModel;
  /** 병원평가 등급 원본(HIRA 미러). 릴레이션이 없어 loadBase 가 따로 읽어 담는다. */
  assessment: Awaited<
    ReturnType<HealthcareHospitalRepository['findAssessment']>
  >;
}

/**
 * i18n 캐시 래퍼. 번역이 없는 언어(null)도 담아 헛조회를 막되, cache miss(undefined)와 구분하려고
 * 값을 v 로 감싼다(저장된 null 과 미조회를 확실히 가른다).
 */
interface HospitalI18nCache {
  v: HospitalI18n | null;
}

/**
 * 통합 병원 조회.
 *
 * **healthcare 계열 테이블만 읽는다.** 원본 미러(nmc, hira)를 보지 않는다 — 통째로 지워도
 * 이 서비스는 동작한다. 코드도 우리 코드(healthcare_code, region_code)만 쓴다.
 *
 * **예외가 하나 있다: 병원평가(assessment).** 상세 조회만 hira_hospital_asm·hira_code 를 읽는다.
 * 병원평가는 심평원이 직접 평가·부여하는 HIRA 전용 개념이라 통합할 상대(NMC)가 없고,
 * 그래서 healthcare_* 로 올리지 않기로 했다. 통합 레이어를 통과시켜도 추상화되는 게 없다.
 * 대신 **읽기에서만 미러를 본다.** 위 원칙은 그대로 성립한다 —
 *   · assessment 는 optional 이라 hira_* 를 지우면 섹션만 사라지고 서비스는 동작한다
 *   · 검색(search)은 여전히 healthcare_* 만 읽는다. 미러는 상세에서만 본다
 *   · 응답의 섹션 이름부터 출처(HIRA)를 밝힌다 — 우리가 만든 값이 아니라는 뜻이다
 *
 * 예전에는 `?source=hira|nmc` 로 어느 원본을 볼지 골랐다. 그러면
 *   - 같은 병원이 두 번 나오고
 *   - source=hira 면 진료시간·응급실이 없고, source=nmc 면 병상·장비가 없었다.
 * 이제 한 병원이 한 행이고, 어느 원본에서 왔는지는 sources 블록에만 남는다.
 */
@Injectable()
export class HealthcareHospitalService {
  constructor(
    private readonly repo: HealthcareHospitalRepository,
    // 무한 스크롤의 ES 원천. repo 와 같은 계약(HospitalScrollSource)이라 scroll 이 골라 쓴다.
    private readonly searchRepo: HealthcareHospitalSearchRepository,
    // 코드 이름은 조인하지 않고 부팅 때 올려둔 캐시에서 붙인다.
    private readonly codes: HealthcareCodeCache,
    // 병원평가 항목 이름·그룹. healthcare_code 가 아니라 hira_code 라 캐시가 따로다.
    private readonly asmCodes: HiraAsmCodeCache,
    private readonly regions: RegionCache,
    // 병원 상세 캐시(Redis). 무거운 매핑 결과를 통째로 담는다. best-effort 라 죽어도 DB 로 살아난다.
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  /**
   * 페이지네이션 검색. 첫 화면의 추천 목록(응급실·달빛어린이 등)과 얕은 페이지네이션이 쓴다.
   *
   * **스크롤과 같은 ES 를 본다.** 예전엔 여기만 DB(Prisma)였는데, 그러면 정렬 규칙이 갈라진다 —
   * 검색 목록은 서울부터 나오는데 첫 화면 응급실은 id 순이라 지방부터 나왔다. 같은 서비스로
   * 안 읽히는 상태였다. 이제 정렬(SEARCH_SORT)도 질의도 저장소 한 곳에서 공유한다.
   *
   * 행과 총건수를 **한 번에** 받는다(searchPage). ES 는 같은 질의에서 둘 다 주기 때문에
   * 예전처럼 두 번 조회(search + countSearch)할 이유가 없다.
   */
  async search(
    command: HospitalSearchCommand,
    lang: SupportedLang = FALLBACK_LANG,
  ): Promise<Page<HospitalSummary>> {
    const filter = this.buildFilter(command);
    const order = this.buildOrder(command);

    const { rows, total } = await this.searchRepo.searchPage(
      filter,
      lang,
      command.page,
      command.size,
      order,
    );

    return new Page(
      rows.map((row) => this.toSummary(this.listRowToSource(row), lang)),
      command.page,
      command.size,
      total,
    );
  }

  /**
   * 무한 스크롤. 검색과 필터는 같고 **커서만 다르다** — page/size(offset) 대신 nextToken 으로 잇는다.
   *
   * **원천을 db 플래그로 고른다.** 기본은 ES(searchRepo), `db=true` 면 DB(repo) — ES 장애 때
   * 우회하려고 심은 테스트 스위치다. 둘 다 같은 계약(HospitalScrollSource)이라 이 아래는 동일하다:
   * 저장소가 size+1 로 다음 페이지 유무를 판정해 size 개 행 + 다음 nextToken 을 주고, 서비스는 요약으로
   * 매핑만 한다. nextToken 이 없으면 다음 페이지가 없다는 뜻이다(총건수는 세지 않는다 — 스크롤엔 불필요).
   */
  async scroll(
    command: HospitalScrollCommand,
    lang: SupportedLang = FALLBACK_LANG,
  ): Promise<HospitalScrollResult> {
    const filter = this.buildFilter(command);
    const order = this.buildOrder(command);

    /*
      **DB 우회로는 좌표 조건을 못 받는다.** 저장소도 거절하지만 거기서 나면 500 이다 —
      서버가 고장난 게 아니라 조합이 잘못 온 것이라 여기서 400 으로 돌려준다.

      DB 에 옮겨 구현하지 않는 이유는 저장소(assertNoGeoQuery) 주석에 있다.
    */
    if (command.db && (order.by === 'distance' || filter.bbox)) {
      throw new BadRequestException(
        'db=true does not support coordinate-based queries (sort=distance, map bounds).',
      );
    }

    const source: HospitalScrollSource = command.db
      ? this.repo
      : this.searchRepo;

    const { rows, nextToken } = await source.searchScroll(
      filter,
      lang,
      command.nextToken,
      command.size,
      order,
    );

    return {
      items: rows.map((row) => this.toSummary(this.listRowToSource(row), lang)),
      nextToken,
    };
  }

  /**
   * 근처의 유사한 병원. 상세 화면 하단 "이 병원 말고 근처 다른 곳" 섹션용이다.
   *
   * **유사도의 정의는 "대신 갈 수 있는가" 다.** 그래서 진료과목 겹침이 가장 크고, 거리는
   * 순위 결정자가 아니라 가중치로 들어간다 — 바로 옆 치과가 1km 밖 같은 정형외과를 이기면 안 된다.
   * 점수 조립은 ES 저장소가 하고(NEARBY_WEIGHT), 여기서는 코드에 이름을 붙이는 일만 한다.
   *
   * **반경은 기준 병원의 등급이 정한다**(저장소의 NEARBY_TIER_POLICY). 의원은 걸어갈 곳을
   * 찾는 자리라 1km, 상급종합은 권역에서 찾는 자리라 80km 다 — 전국에 47곳뿐이라 그보다
   * 좁게 잡으면 서로를 아예 못 찾는다. command.radius 가 오면 그 값이 이긴다.
   *
   * **결과는 캐싱한다.** 색인은 배치가 다시 만들 때만 바뀌는데 상세를 열 때마다 ES 를 두 번
   * 치기 때문이다. 담는 건 저장소 행(코드값)이라, 코드표 번역을 고치면 캐시를 비우지 않아도
   * 다음 조회에 바로 반영된다 — 상세 캐시(base/i18n 분리)와 같은 태도다.
   *
   * 없는 병원이면 null(호출자가 404 로 옮긴다). 좌표가 없거나 반경 안에 후보가 없으면 빈 items 다.
   */
  async nearby(
    command: HospitalNearbyCommand,
    lang: SupportedLang = FALLBACK_LANG,
  ): Promise<HospitalNearbyResult | null> {
    const key = this.nearbyKey(command, lang);

    let found: HospitalNearbyRows | undefined;
    try {
      found = await this.cache.get<HospitalNearbyRows>(key);
    } catch {
      // 캐시 조회 실패는 무시하고 ES 로 진행한다.
    }

    if (found === undefined) {
      const fetched = await this.searchRepo.findNearby(
        command.id,
        { radius: command.radius, size: command.size },
        lang,
      );
      // 없는 병원은 캐싱하지 않는다(상세 캐시와 같은 규칙).
      if (fetched === null) {
        return null;
      }
      found = fetched;
      await this.trySet(key, found);
    }

    return {
      radius: found.radius,
      items: found.rows.map((row) => ({
        // 요약 매핑은 검색·스크롤과 같은 한 벌을 쓴다(행 모양을 맞춰둔 이유다).
        ...this.toSummary(this.listRowToSource(row), lang),
        distance: row.distance_m,
        matchedSubjects: this.buildMatchedSubjects(row, lang),
      })),
    };
  }

  /**
   * 근처 병원 캐시 키.
   *
   * **반경·개수·언어가 다 키에 들어간다** — 셋 중 하나만 달라도 결과가 다르다. 반경은 안 왔을 때
   * 서버가 등급으로 정하므로 그때는 auto 로 적는다(등급은 병원 id 가 이미 결정한다).
   * 언어가 키에 있는 이유는 저장하는 행에 **병원 이름 번역**이 박혀 있어서다(코드표 이름은 안 박힌다).
   *
   * {id} 를 해시태그로 감싸 상세 캐시와 같은 슬롯에 묶는다.
   */
  private nearbyKey(
    command: HospitalNearbyCommand,
    lang: SupportedLang,
  ): string {
    const radius = command.radius ?? 'auto';
    return `${CachePrefix.hospital}:{${command.id}}:nearby:${radius}:${command.size}:${lang}`;
  }

  /**
   * 겹친 과목 코드에 이름을 붙인다. **코드표에 없는 코드는 버리고 코드표 sort 순으로 낸다** —
   * 상세의 buildSubjects 와 같은 규칙이라, 같은 병원의 과목 순서가 화면마다 달라지지 않는다.
   */
  private buildMatchedSubjects(
    row: HospitalNearbyRow,
    lang: SupportedLang,
  ): HospitalMatchedSubject[] {
    const specialists = new Set(row.matched_specialist_cds);
    return row.matched_subject_cds
      .map((cd) => this.codes.get('subject', cd))
      .filter((entry): entry is CodeEntry => entry !== undefined)
      .sort((a, b) => a.sort - b.sort)
      .map((entry) => ({
        code: entry.code,
        name: codeName(entry, lang),
        specialist: specialists.has(entry.code),
      }));
  }

  /**
   * 검색 명령을 저장소가 받을 원시 필터로 푼다. **캐시에 의존하는 결정은 여기서 끝낸다** —
   * 지역 코드를 시군구로 펴고(RegionCache), 적정성평가 항목을 검증된 컬럼명으로 바꾼다(asmCodes).
   * 저장소는 캐시를 모른 채 SQL 만 조립한다. 페이지·스크롤이 필터를 공유하므로 커서 무관한
   * 공통 필터 타입만 받는다.
   */
  private buildFilter(command: HospitalFilterCommand): HospitalSearchFilter {
    // 키워드가 `id:{id}` / `hira:{ykiho}` / `nmc:{hpid}` 면 **id 단건 조회**다 — 다른 필터를
    // 통째로 버리고 그 id 로만 건다. 저장소가 이 필드를 보고 조기 반환한다.
    const idLookup = parseIdLookup(command.name);
    if (idLookup) {
      return idLookup;
    }
    return {
      // 시도 코드가 오면 그 시도의 시군구 전체로 편다(시군구 코드면 자신뿐이라 등가).
      regionCds: command.regionCd
        ? this.regions.selfAndChildren(command.regionCd)
        : undefined,
      classCds: command.classCds,
      tiers: command.tiers,
      name: command.name,
      emergency: command.emergency,
      baby: command.baby,
      // 아는 코드만 통과시킨다 — 저장소가 이 코드로 컬럼명(DB)이나 텀(ES)을 만들므로
      // 검증이 인젝션을 막는다. 1등급 값·컬럼 조립은 저장소가 자기 방식으로 한다.
      asmExcellentCds: command.asmItemCds?.filter((code) =>
        this.asmCodes.get(code),
      ),
      specialtyCds: command.specialtyCds,
      specialCds: command.specialCds,
      equipmentCds: command.equipmentCds,
      subjectCds: command.subjectCds,
      specialistCds: command.specialistCds,
      // 지도 영역("이 지역에서 검색"). 지역 코드와 함께 오면 둘 다 걸린다(교집합).
      bbox: command.bbox,
    };
  }

  /**
   * 정렬 지시를 만든다.
   *
   * **거리순인데 기준 좌표가 없으면 막는다.** 조용히 기본 정렬로 돌리면 사용자는 "가까운 순"
   * 을 눌렀는데 먼 병원이 위에 있는 목록을 보게 된다 — 틀린 답을 맞는 척 주는 셈이라,
   * 아무것도 안 주는 편이 낫다.
   */
  private buildOrder(command: HospitalFilterCommand): HospitalSearchOrder {
    if (command.sort !== 'distance') return DEFAULT_SEARCH_ORDER;
    if (!command.origin) {
      throw new BadRequestException(
        'sort=distance requires origin coordinates (lat, lon).',
      );
    }
    return { by: 'distance', origin: command.origin };
  }

  /**
   * 상세 조회 — base(언어무관 구조+평가)와 요청 언어 i18n 을 각각 캐싱하는 A-lazy 구조.
   *   · hospital:{id}:base        — 무거운 join, 병원당 1번만 (모든 언어가 공유)
   *   · hospital:{id}:i18n:{lang} — 요청 온 언어만 lazy 캐싱 (안 쓰는 언어는 안 담긴다)
   * 코드명·지역명 현지화는 캐시에 넣지 않는다 — 부팅 때 올린 인메모리 캐시에서 읽을 때 붙이므로,
   * 코드표 번역을 고쳐도 캐시 무효화 없이 즉시 반영된다.
   *
   * {id} 를 해시태그 {}로 감싸 클러스터에서도 base·i18n 이 같은 슬롯에 묶이게 한다(멀티키 mget/mdel 안전).
   * 캐시는 best-effort — Redis 가 죽어도 DB 로 살아난다. 없는 병원은 캐싱하지 않는다.
   */
  async get(
    id: number,
    lang: SupportedLang = FALLBACK_LANG,
  ): Promise<HospitalDetail | null> {
    const baseKey = this.baseKey(id);
    const i18nKey = this.i18nKey(id, lang);

    // base + 요청 언어 i18n 을 한 왕복(mget)으로 가져온다.
    let base: HospitalBase | undefined;
    let i18n: HospitalI18nCache | undefined;
    try {
      const [rawBase, rawI18n] = await this.cache.mget([baseKey, i18nKey]);
      base = rawBase as HospitalBase | undefined;
      i18n = rawI18n as HospitalI18nCache | undefined;
    } catch {
      // 캐시 조회 실패는 무시하고 DB 로 진행한다.
    }

    // base 미스 → DB 로드 후 저장. 병원이 없으면 여기서 끝(존재하지 않는 id 는 캐싱하지 않는다).
    if (base === undefined) {
      const loaded = await this.loadBase(id);
      if (!loaded) {
        return null;
      }
      base = loaded;
      await this.trySet(baseKey, base);
    }

    // i18n 미스 → DB 로드 후 저장. 번역이 없어도(null) 캐싱해 헛조회를 막는다.
    if (i18n === undefined) {
      i18n = { v: await this.repo.findI18n(id, lang) };
      await this.trySet(i18nKey, i18n);
    }

    return this.assembleDetail(base, i18n.v, lang);
  }

  /** base 키. {id} 를 해시태그로 감싼다(클러스터 동일 슬롯 보장). */
  private baseKey(id: number): string {
    return `${CachePrefix.hospital}:{${id}}:base`;
  }

  /** 언어별 i18n 키. base 와 같은 해시태그라 mget/mdel 이 한 슬롯에서 처리된다. */
  private i18nKey(id: number, lang: SupportedLang): string {
    return `${CachePrefix.hospital}:{${id}}:i18n:${lang}`;
  }

  /** 캐시 저장(best-effort). 실패해도 응답은 이미 준비됐으니 삼킨다. */
  private async trySet(key: string, value: unknown): Promise<void> {
    try {
      await this.cache.set(key, value, DETAIL_CACHE_TTL_MS);
    } catch {
      // 저장 실패는 무시한다.
    }
  }

  /**
   * 언어무관 base 를 DB 에서 읽는다(캐시 미스 때만). findDetail(구조) + findAssessment(평가 등급).
   * 병원평가는 릴레이션이 없어(HIRA 미러) 따로 읽고, ykiho 없으면(NMC 전용) 평가가 없다.
   */
  private async loadBase(id: number): Promise<HospitalBase | null> {
    const detail = await this.repo.findDetail(id);
    if (!detail) {
      return null;
    }
    const assessment = detail.ykiho
      ? await this.repo.findAssessment(detail.ykiho)
      : null;
    return { detail, assessment };
  }

  /**
   * base + 선택된 언어 i18n 을 최종 DTO 로 조합한다(캐시 미스든 히트든 매번 실행).
   * 코드명·지역명·평가항목명 현지화는 여기서 인메모리 캐시로 붙인다 — 캐시에 담지 않는 이유다.
   */
  private assembleDetail(
    base: HospitalBase,
    i18n: HospitalI18n | null,
    lang: SupportedLang,
  ): HospitalDetail {
    const row = base.detail;
    const assessment = this.buildAssessment(base.assessment, lang);

    const subjects = this.buildSubjects(row.subjects, lang);
    const equipments = this.buildEquipments(row.equipments, lang);
    const capabilities = this.buildCapabilities(row.capabilities, lang);

    const parkNote = this.text(row.parkNote, i18n?.parkNote ?? null);

    // 전문병원 지정분야는 capabilities(tp='specialty')에서 뽑는다 — 어차피 전량 딸려왔다.
    const specialtyCd =
      row.capabilities.find((c) => c.tp === 'specialty')?.cd ?? null;

    return {
      ...this.toSummary(this.detailToSource(row, i18n, specialtyCd), lang),

      // 번역된 이름 옆에 붙일 한국어 원문. 번역이 실제로 있을 때만 온다.
      // 외국인이 영문 링크를 한국인에게 보냈을 때 언어를 안 바꿔도 알아보게 하려는 것이다.
      //
      // **짧은 이름(name) 기준이다.** 간판에는 법인명이 없으므로, 대조용으로 붙이는 값에
      // 법인명이 들어가면 오히려 현실 세계와 안 맞는다.
      nameKo: annotateKo(row.name, i18n?.name ?? null),

      // 법인명·원문은 **다를 때만** 내린다. 98.7% 는 법인 표기가 없어 두 필드가 다 빠진다.
      // 프론트는 `{corpName && …}` 한 줄이면 된다 — nameKo 와 같은 규약이다.
      corpName: row.corpName ?? undefined,
      legalName: row.legalName === row.name ? undefined : row.legalName,

      sources: {
        ykiho: row.ykiho ?? undefined,
        hpid: row.hpid ?? undefined,
      },
      homepage: row.homepage ?? undefined,
      establishedAt: row.estbDd ?? undefined,
      intro: this.text(row.intro, i18n?.intro ?? null),
      notice: this.text(row.notice, i18n?.notice ?? null),
      directions: this.text(row.directions, i18n?.directions ?? null),
      transport: this.transport(
        pickText(row.transport, i18n?.transport ?? null),
      ),
      parking:
        row.parkQty !== null || parkNote !== undefined
          ? {
              capacity: this.num(row.parkQty),
              paid:
                row.parkPaid === null || row.parkPaid === undefined
                  ? undefined
                  : Boolean(row.parkPaid),
              note: parkNote,
            }
          : undefined,

      subjects,

      hours: row.hours.map((h) => ({
        kind: h.kind,
        day: h.day,
        open: h.openTime ?? undefined,
        close: h.closeTime ?? undefined,
        breakStart: h.breakStart ?? undefined,
        breakEnd: h.breakEnd ?? undefined,
      })),

      staff: row.staff
        ? {
            doctorTotal: row.staff.doctorTotal ?? undefined,
            specialist: row.staff.specialist ?? undefined,
            resident: row.staff.resident ?? undefined,
            intern: row.staff.intern ?? undefined,
            generalDoctor: row.staff.generalDoctor ?? undefined,
            dentist: row.staff.dentist ?? undefined,
            oriental: row.staff.oriental ?? undefined,
            midwife: row.staff.midwife ?? undefined,
          }
        : undefined,

      beds: row.beds
        ? {
            total: row.beds.total ?? undefined,
            standard: row.beds.standard ?? undefined,
            higher: row.beds.higher ?? undefined,
            icu: row.beds.icu ?? undefined,
            emergency: row.beds.emergency ?? undefined,
            operatingRoom: row.beds.operatingRoom ?? undefined,
            delivery: row.beds.delivery ?? undefined,
            neonatal: row.beds.neonatal ?? undefined,
            isolation: row.beds.isolation ?? undefined,
            psyOpen: row.beds.psyOpen ?? undefined,
            psyClosed: row.beds.psyClosed ?? undefined,
          }
        : undefined,

      assessment,
      equipments,

      capabilities,
    };
  }

  /**
   * 진료과목 목록을 만든다. 이름·정렬은 코드 캐시가 준다.
   *
   * 예전엔 healthcare_code 를 INNER JOIN 해서, 코드표에 없는 과목은 빠지고 정렬도 코드 sort 였다.
   * 그 의미를 유지한다 — 캐시에 없는 코드는 버리고(과목은 이름이 반드시 있어야 한다), sort 순으로 낸다.
   */
  private buildSubjects(
    rows: HospitalDetailModel['subjects'],
    lang: SupportedLang,
  ): HospitalDetail['subjects'] {
    return rows
      .map((s) => ({
        row: s,
        entry: this.codes.get('subject', String(s.subjectCd)),
      }))
      .filter((x) => x.entry !== undefined)
      .sort((a, b) => a.entry!.sort - b.entry!.sort)
      .map(({ row, entry }) => ({
        code: entry!.code,
        name: codeName(entry!, lang),
        declared: Boolean(row.declared),
        doctorCount: this.num(row.doctorCnt),
        specialistCount: this.num(row.specialistCnt),
      }));
  }

  /** 장비 목록. 과목과 같은 방식(코드표에 없는 장비는 버리고 sort 순). */
  private buildEquipments(
    rows: HospitalDetailModel['equipments'],
    lang: SupportedLang,
  ): HospitalDetail['equipments'] {
    return rows
      .map((e) => ({
        row: e,
        entry: this.codes.get('equipment', String(e.equipmentCd)),
      }))
      .filter((x) => x.entry !== undefined)
      .sort((a, b) => a.entry!.sort - b.entry!.sort)
      .map(({ row, entry }) => ({
        code: entry!.code,
        name: codeName(entry!, lang),
        count: this.num(row.cnt),
      }));
  }

  /**
   * capability 목록. **코드표에 없는 코드도 남긴다**(예전 LEFT JOIN 의미) — 이름이 비면 code 만 낸다.
   * 정렬은 tp → 코드 sort → cd. sort 는 캐시에서, 미상 코드는 뒤로 민다.
   */
  /**
   * 심평원 병원평가를 최종 형태로 조합한다. **등급 원본(HIRA 미러)은 loadBase 가 읽어 base 에 담아두고**,
   * 여기서는 그 행을 받아 항목명만 인메모리로 현지화한다 — DB 접근이 없다.
   *
   * row 가 null 이면(ykiho 없는 NMC 전용 병원이거나 평가대상이 아님) undefined 다
   * — 79,739개 중 36,599개만 평가대상이다.
   *
   * 등급은 asm_01~asm_24 컬럼에 원본 그대로 들어 있다(generated column). 평가대상이 아닌
   * 항목은 NULL 이라 목록에서 빠진다. **NULL 과 '등급제외' 는 다르다** —
   * 전자는 평가를 안 한 것이고 후자는 평가하고 등급을 안 매긴 것이다.
   */
  private buildAssessment(
    row: HospitalBase['assessment'],
    lang: SupportedLang,
  ): HospitalAssessment | undefined {
    if (!row) {
      return undefined;
    }

    // 그룹 순서는 캐시가 tp 오름차순으로 들고 있다(= 심평원 홈페이지 순서).
    const byGroup = new Map<string, HospitalAssessmentGroup>();

    for (const code of this.asmCodes.codes()) {
      const grade = (row as unknown as Record<string, string | null>)[
        `asm_${code}`
      ];
      // NULL = 평가대상이 아니다. 목록에 넣지 않는다.
      if (grade === null || grade === undefined) {
        continue;
      }

      const item = this.asmCodes.get(code);
      if (!item) {
        continue;
      }

      const entry: HospitalAssessmentItem = {
        code,
        name: asmItemName(item, lang),
        grade,
        normalized: normalizeGrade(code, grade),
      };

      const group = byGroup.get(item.groupCode);
      if (group) {
        group.items.push(entry);
      } else {
        byGroup.set(item.groupCode, {
          code: item.groupCode,
          name: asmGroupName(item, lang),
          items: [entry],
        });
      }
    }

    // 항목이 하나도 없으면(전부 NULL) 섹션 자체를 만들지 않는다.
    return byGroup.size > 0 ? { groups: [...byGroup.values()] } : undefined;
  }

  private buildCapabilities(
    rows: HospitalDetailModel['capabilities'],
    lang: SupportedLang,
  ): HospitalDetail['capabilities'] {
    return rows
      .map((c) => {
        const tp = String(c.tp);
        const cd = String(c.cd);
        return { tp, cd, entry: this.codes.get(tp, cd) };
      })
      .sort(
        (a, b) =>
          a.tp.localeCompare(b.tp) ||
          (a.entry?.sort ?? Number.MAX_SAFE_INTEGER) -
            (b.entry?.sort ?? Number.MAX_SAFE_INTEGER) ||
          a.cd.localeCompare(b.cd),
      )
      .map(({ tp, cd, entry }) => ({
        type: tp,
        code: cd,
        name: entry ? codeName(entry, lang) || undefined : undefined,
      }));
  }

  /**
   * 요약(summary) 매핑의 입력. **search(raw SQL flat row)와 get(Prisma 모델)이 모양이 달라서**,
   * 각 경로가 자기 원천에서 이 공통 형태로 먼저 정규화하고(listRowToSource·detailToSource),
   * toSummary 는 이 하나만 받는다 — 매퍼를 한 벌로 유지한다.
   */
  private toSummary(src: SummarySource, lang: SupportedLang): HospitalSummary {
    // 지역·시도 이름은 조인이 아니라 캐시에서 붙인다. 시도 코드도 SQL 이 아니라
    // 지역 캐시가 아는 parent 다. 모르는 코드는 이름 대신 코드를 그대로 보여준다(빈칸보다 낫다).
    const regionEntry = src.regionCd
      ? this.regions.get(src.regionCd)
      : undefined;
    const sidoCd = regionEntry?.parentCode ?? undefined;

    // 역 이름을 못 뽑으면("2번출구" 처럼 역이 안 적힌 하차지점) 노선도 같이 버린다.
    // 노선만 남으면 화면엔 붙을 역이 없는 노선 배지가 뜬다.
    const station = stationName(src.station) ?? undefined;

    return {
      id: src.id,
      // 번역이 있으면 번역, 없으면 한국어 원문. 목록도 번역된 이름으로 나가야
      // (lang, name) 인덱스가 의미를 갖는다 — 영어 사용자는 영문명으로 찾는다.
      name: String(pickText(src.name, src.i18nName)),
      category: src.classCd
        ? {
            code: src.classCd,
            name: this.codes.name('class', src.classCd, lang) ?? src.classCd,
          }
        : undefined,
      // 등급 이름은 시드가 갖는다. DB 에는 코드만 넣어 두 곳에 이름이 생기지 않게 한다.
      tier: src.tierCd ? this.tier(src.tierCd, lang) : undefined,
      specialty: src.specialtyCd
        ? {
            code: src.specialtyCd,
            name:
              this.codes.name('specialty', src.specialtyCd, lang) ??
              src.specialtyCd,
          }
        : undefined,
      tel: src.tel ?? undefined,
      emergency: src.emergency,
      baby: src.baby,
      // 거리순으로 조회했을 때만 값이 있다. 화면은 없으면 거리 표시를 그리지 않는다.
      distance: src.distance,
      location: {
        address: src.addr ?? undefined,
        postNo: src.postNo ?? undefined,
        lat: src.lat,
        lon: src.lon,
        station,
        stationLine: station ? (src.stationLine ?? undefined) : undefined,
        region: src.regionCd
          ? {
              code: src.regionCd,
              name: regionEntry ? regionName(regionEntry, lang) : src.regionCd,
              sido: sidoCd
                ? {
                    code: sidoCd,
                    name: this.regions.name(sidoCd, lang) ?? sidoCd,
                  }
                : undefined,
              emdong: src.emdongNm ?? undefined,
            }
          : undefined,
      },
    };
  }

  /** 검색 결과 한 행(raw SQL 프로젝션) → 요약 입력. 드라이버가 섞어 준 타입을 여기서 강제한다. */
  private listRowToSource(row: HospitalListRow): SummarySource {
    return {
      id: Number(row.id),
      name: String(row.name),
      i18nName: row.i18n_name,
      classCd: asString(row.class_cd),
      tierCd: asString(row.tier),
      specialtyCd: asString(row.specialty_cd),
      station: asString(row.station),
      stationLine: asString(row.station_line),
      regionCd: row.region_cd,
      tel: row.tel,
      emergency: Boolean(row.emergency_yn),
      baby: Boolean(row.baby_yn),
      addr: row.addr,
      postNo: row.post_no,
      emdongNm: row.emdong_nm,
      lat: this.num(row.lat),
      lon: this.num(row.lon),
      distance: row.distance_m,
    };
  }

  /**
   * 상세 병원 모델(+번역+전문분야) → 요약 입력.
   *
   * **상세는 목록과 달리 지하철역을 location 에 싣지 않는다** — 예전 상세 SQL 도 station 을
   * 뽑지 않았다(역 정보는 응답의 transport 블록에 있다). 그 동작을 그대로 둔다(station: null).
   */
  private detailToSource(
    row: HospitalModel,
    i18n: HospitalI18n | null,
    specialtyCd: string | null,
  ): SummarySource {
    return {
      id: row.id,
      name: row.name,
      i18nName: i18n?.name ?? null,
      classCd: row.classCd,
      tierCd: row.tier,
      specialtyCd,
      station: null,
      stationLine: null,
      regionCd: row.regionCd,
      tel: row.tel,
      emergency: row.emergencyYn,
      baby: row.babyYn,
      addr: row.addr,
      postNo: row.postNo,
      emdongNm: row.emdongNm,
      lat: this.num(row.lat),
      lon: this.num(row.lon),
    };
  }

  /**
   * 대중교통. 빌드가 이미 수단별로 묶어 넣어둬서 그대로 내보낸다.
   * 없는 병원이 많으므로(NMC 전용·의원급 미수집) 빈 목록으로 채워 프론트의 분기를 줄인다.
   */
  private transport(value: unknown): HospitalTransport {
    const empty: HospitalTransport = { subway: [], bus: [], etc: [] };
    if (!value || typeof value !== 'object') {
      return empty;
    }
    const t = value as Partial<HospitalTransport>;
    return {
      subway: t.subway ?? [],
      bus: t.bus ?? [],
      etc: t.etc ?? [],
    };
  }

  /**
   * 등급 코드 → 이름.
   *
   * 이름은 **시드(TIER_NAMES)가 유일한 출처다.** 예전엔 요양·정신 이름을 이 서비스가
   * 하드코딩했는데, 이름이 두 곳에 있으면 반드시 어긋난다.
   * 모르는 코드면 코드를 그대로 보여준다 — 빈칸보다 낫다.
   */
  private tier(
    code: string,
    lang: SupportedLang,
  ): { code: string; name: string } {
    const name = TIER_NAMES[code as keyof typeof TIER_NAMES];
    return { code, name: name ? pickLangName(name, lang) : code };
  }

  /**
   * 자유 텍스트 한 필드를 언어에 맞춰 고른다.
   *
   * SQL 이 원문(h.intro)과 번역(i.intro AS i18n_intro)을 **둘 다 그냥 SELECT** 하고,
   * 고르는 건 여기서 한다. COALESCE 를 SQL 에 넣지 않는 이유가 둘이다:
   *   1. 원문이 지워졌는데 번역이 남으면 COALESCE 는 좀비를 내놓는다 (pickText 주석 참고)
   *   2. Prisma.sql 에 컬럼식을 동적으로 끼워 넣으면 평탄화가 안 돼 바인딩 값으로 들어간다
   *      — 예전에 응답에 SQL 객체가 그대로 나간 적이 있다. 다시 밟지 않는다.
   */
  private text(ko: string | null, i18n: string | null): string | undefined {
    const picked = pickText(ko, i18n);
    return picked ?? undefined;
  }

  private num(value: unknown): number | undefined {
    if (value === null || value === undefined) {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
}

/**
 * 검색 키워드의 **id 단건 조회 문법**을 뽑는다.
 *   `id:{통합병원id}` → { id }   `hira:{ykiho}` → { hira }   `nmc:{hpid}` → { nmc }
 *
 * 접두사는 대소문자 무관, 값(id·요양기호·기관ID)은 원문 그대로 둔다(대소문자 유지). 그 외에는 null
 * (일반 키워드 검색). `id:` 는 양의 정수만 인정한다 — 아니면 null 로 흘려 일반 검색이 되게 한다.
 * 필터 필드명은 원본 이름(hira/nmc)으로 둔다 — 저장소가 컬럼(ykiho/hpid)으로 옮긴다.
 */
function parseIdLookup(raw?: string): HospitalSearchFilter | null {
  const match = /^(id|hira|nmc):(.+)$/i.exec(raw?.trim() ?? '');
  if (!match) {
    return null;
  }
  const kind = match[1].toLowerCase();
  const value = match[2].trim();
  if (!value) {
    return null;
  }
  if (kind === 'hira') {
    return { hira: value };
  }
  if (kind === 'nmc') {
    return { nmc: value };
  }
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? { id } : null;
}

/**
 * 등급을 항목 간 비교 가능한 값으로 옮긴다. 1~5 또는 'X'(등급대상 제외).
 *
 * **천식(16)만 인코딩이 다르다.** 나머지 21개가 1~5·'등급제외' 를 쓰는데 천식만
 * '양호'·2~5·0 을 쓴다 — 1등급을 '양호' 로, 등급제외를 0 으로 준다(2026-07 심평원 홈페이지 대조).
 * 등급 체계 자체는 같아서 여기서 옮기면 다른 항목과 나란히 비교된다.
 *
 * **그래서 grade 를 Number() 로 파싱하면 안 된다** — 천식의 '0' 이 최상위(1등급보다 좋은 값)로
 * 올라간다. 정렬·비교는 반드시 이 함수를 거친 값으로 하라.
 */
function normalizeGrade(code: string, grade: string): number | 'X' {
  if (code === ASTHMA_CODE) {
    if (grade === '양호') return 1;
    if (grade === '0') return 'X';
  } else if (grade === '등급제외') {
    return 'X';
  }

  const parsed = Number(grade);
  // 아는 값이 아니면 등급으로 취급하지 않는다. 원본이 새 값을 주기 시작해도
  // 숫자로 둔갑해 순위를 흔들지 않는다 — 원본은 grade 에 그대로 남아 있다.
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 5 ? parsed : 'X';
}

/** 천식. 이 항목만 등급 인코딩이 다르다. */
const ASTHMA_CODE = '16';

/** 병원 상세 캐시 TTL(ms). 상세는 admin 배치 재빌드 때만 바뀌어 자주 안 변한다. */
const DETAIL_CACHE_TTL_MS = 5 * 60_000;
