import { Injectable } from '@nestjs/common';
import { FALLBACK_LANG, type SupportedLang } from '@hansapi/common';

import { RegionCache, regionName } from './region.cache';

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

/** 지역 코드 조회. 시도 → 시군구 2단계다. */
@Injectable()
export class RegionService {
  constructor(private readonly cache: RegionCache) {}

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
    return this.cache.list(options).map((entry) => ({
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
    }));
  }
}
