import { Injectable } from '@nestjs/common';
import { FALLBACK_LANG, type SupportedLang } from '@hansapp/common';

import { HealthcareHospitalSearchRepository } from '../healthcare/healthcare-hospital-search.repository';
import { RegionCache, regionName, type RegionEntry } from './region.cache';

/**
 * 지역(주소) 항목.
 *
 * **헬스케어 소속이 아니다.** region_code 는 도메인 무관이라 —
 * 병원·학교·약국이 같이 쓴다. (region-code.seed.ts 참고)
 * 그래서 /healthcare/meta 밑이 아니라 주소 그룹(/address/regions)으로 낸다.
 */
export interface Region {
  code: string;

  /** 정식 명칭. "서울특별시" — **검색·매칭은 이걸 쓴다.** */
  name: string;

  /** 화면 표시용 짧은 이름. "서울" — 시군구는 이미 짧아서 없다. */
  shortName?: string;

  /** 시도면 없다 */
  parentCode?: string;

  /** sido | sggu */
  level: string;
}

/**
 * 좌표가 속한 지역. 시도는 늘 있고, **시군구는 없을 수 있다** —
 * 세종처럼 시군구가 없는 시도가 있다.
 */
export interface RegionPoint {
  sido: Region;
  region?: Region;
}

/** 지역 코드 조회. 시도 → 시군구 2단계다. */
@Injectable()
export class RegionService {
  constructor(
    private readonly cache: RegionCache,
    /*
      **역지오코딩 때문에 빌려 쓰는 의존이다.** 지역표에는 좌표가 없어서 "이 좌표가 어느
      시군구냐" 에 스스로 답하지 못한다. 병원 색인에는 좌표와 지역 코드가 같이 들어 있어
      가장 가까운 병원의 지역을 답으로 쓴다.

      지역별 기준점(healthcare_region_stat)이 들어오면 **이 의존은 끊는다** — region_code 는
      도메인 무관이어야 하는데(병원·학교·약국이 같이 쓴다) 지금은 병원 데이터에 기대고 있다.
    */
    private readonly hospitals: HealthcareHospitalSearchRepository,
  ) {}

  /**
   * 좌표 → 시도·시군구. 사용자가 "내 위치" 를 눌렀을 때 지역 필터를 채우는 데 쓴다.
   *
   * **좌표를 그대로 검색에 싣지 않고 지역 코드로 바꾸는 이유**는, 그래야 사용자가 결과를 보고
   * 고칠 수 있기 때문이다 — 콤보박스에 "경기도 / 하남시" 가 찍히면 틀렸을 때 직접 바꾸면 된다.
   *
   * 한국 밖이거나 반경 안에 병원이 없으면 **null** 이다(호출자가 404 로 옮긴다).
   */
  async reverse(
    lat: number,
    lon: number,
    lang: SupportedLang = FALLBACK_LANG,
  ): Promise<RegionPoint | null> {
    const code = await this.hospitals.findRegionCdAt(lat, lon);
    if (!code) {
      return null;
    }

    const entry = this.cache.get(code);
    // 지역표에 없는 코드. 폐지된 코드를 단 병원이 남아 있을 수 있다.
    if (!entry) {
      return null;
    }

    // 시도 코드가 바로 나온 경우(세종, 또는 매핑이 시도까지만 된 병원). 시군구는 없다.
    if (entry.level === 'sido') {
      return { sido: toRegion(entry, lang) };
    }

    const parent = entry.parentCode
      ? this.cache.get(entry.parentCode)
      : undefined;
    // 시군구인데 시도를 못 찾으면 지역표가 깨진 것이다. 반쪽 답을 주느니 못 찾은 것으로 낸다.
    if (!parent) {
      return null;
    }

    return { sido: toRegion(parent, lang), region: toRegion(entry, lang) };
  }

  /**
   * level 로 시도/시군구를 고르고, 시군구는 parentCode 로 시도를 좁힌다.
   *
   * **동기다.** 부팅 때 올려둔 지역표 캐시에서 읽어 DB 왕복이 없다.
   */
  list(
    options: {
      level?: string;
      parentCode?: string;
    },
    lang: SupportedLang = FALLBACK_LANG,
  ): Region[] {
    return this.cache.list(options).map((entry) => toRegion(entry, lang));
  }
}

/** RegionEntry → 응답용 Region. 목록과 역지오코딩이 같은 모양을 내도록 한 곳에 모은다. */
function toRegion(entry: RegionEntry, lang: SupportedLang): Region {
  return {
    code: entry.code,
    name: regionName(entry, lang),
    // 짧은 이름은 한국어만 있다. 영어·일본어는 이미 짧아서(Seoul) 따로 둘 이유가 없다 —
    // 번역된 이름이 있으면 그걸 그대로 쓴다.
    shortName:
      lang === FALLBACK_LANG
        ? (entry.shortNm ?? undefined)
        : (regionName(entry, lang) ?? undefined),
    level: entry.level,
    parentCode: entry.parentCode ?? undefined,
  };
}
