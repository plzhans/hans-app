import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '@hansapp/data';
import { FALLBACK_LANG, type SupportedLang } from '@hansapp/common';

import { pickName } from '../healthcare/code-name';

/** 캐시에 담는 지역 한 건(region_code). region_code 엔 nm_zh 가 없어 중국어는 nm 폴백. */
export interface RegionEntry {
  code: string;
  /** 정식 명칭(한국어). 매칭·폴백 기준. */
  nm: string;
  nmEn: string | null;
  nmJa: string | null;
  /** 화면용 짧은 이름(한국어). 시군구는 이미 짧아 대개 없다. */
  shortNm: string | null;
  /** sido | sggu */
  level: string;
  /** 시군구면 시도 코드, 시도면 null. */
  parentCode: string | null;
  sort: number;
}

/**
 * 지역표(region_code) 인메모리 캐시.
 *
 * **부팅 때 통째로 읽어 메모리에 둔다.** 코드표와 같은 이유다(정적 참조 데이터). 병원 조회 SQL 의
 * region_code 조인(시군구·시도)을 걷어내고, 시도 검색의 하위 시군구 확장도 서브쿼리 대신
 * 여기서(parent→children 인덱스) 편다. 표는 ~300행이라 부담이 없다.
 *
 * **바뀌면 재부팅(또는 reload()).**
 */
@Injectable()
export class RegionCache implements OnApplicationBootstrap {
  private readonly logger = new Logger(RegionCache.name);
  /** cd → 지역 한 건. */
  private byCode = new Map<string, RegionEntry>();
  /** 전체(sort 순). list() 필터의 원본. */
  private all: RegionEntry[] = [];
  /** 시도 코드 → 그 시도의 시군구들. 시도 검색 확장용. */
  private childrenByParent = new Map<string, RegionEntry[]>();

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.reload();
  }

  /** 지역표를 다시 읽어 캐시를 통째로 교체한다. 부팅 시 자동 호출. */
  async reload(): Promise<void> {
    const rows = await this.prisma.regionCode.findMany({
      orderBy: [{ sort: 'asc' }, { cd: 'asc' }],
    });

    const byCode = new Map<string, RegionEntry>();
    const all: RegionEntry[] = [];
    const childrenByParent = new Map<string, RegionEntry[]>();
    for (const r of rows) {
      const entry: RegionEntry = {
        code: r.cd,
        nm: r.nm,
        nmEn: r.nmEn,
        nmJa: r.nmJa,
        shortNm: r.shortNm,
        level: r.level,
        parentCode: r.parentCd,
        sort: r.sort,
      };
      byCode.set(r.cd, entry);
      all.push(entry);
      if (r.parentCd) {
        const kids = childrenByParent.get(r.parentCd);
        if (kids) kids.push(entry);
        else childrenByParent.set(r.parentCd, [entry]);
      }
    }

    this.byCode = byCode;
    this.all = all;
    this.childrenByParent = childrenByParent;
    this.logger.log(`region_code ${rows.length}건 메모리 로드`);
  }

  /** cd 한 건. 없으면 undefined. */
  get(code: string): RegionEntry | undefined {
    return this.byCode.get(code);
  }

  /** level 로 시도/시군구를 고르고, 시군구는 parentCode 로 시도를 좁힌다(sort 순). */
  list(options: { level?: string; parentCode?: string }): RegionEntry[] {
    return this.all.filter(
      (r) =>
        (!options.level || r.level === options.level) &&
        (!options.parentCode || r.parentCode === options.parentCode),
    );
  }

  /**
   * 이 코드 + 하위 시군구 코드들.
   * 시도면 [자신, ...시군구 전체], 시군구·미상이면 [자신]뿐.
   *
   * 병원 지역 검색용이다. 병원은 시군구 코드만 가지므로 시도 코드가 들어오면 그 시도의 시군구로
   * 펴서 IN 절에 넘긴다(예전엔 SQL 서브쿼리로 했다).
   */
  selfAndChildren(code: string): string[] {
    const kids = this.childrenByParent.get(code);
    return kids ? [code, ...kids.map((k) => k.code)] : [code];
  }

  /** cd 표시명. 언어 폴백은 pickName 규칙. 모르는 코드면 undefined. */
  name(code: string, lang: SupportedLang = FALLBACK_LANG): string | undefined {
    const entry = this.byCode.get(code);
    return entry ? regionName(entry, lang) : undefined;
  }
}

/** RegionEntry → 표시명. */
export function regionName(entry: RegionEntry, lang: SupportedLang): string {
  return pickName({ nm: entry.nm, nm_en: entry.nmEn, nm_ja: entry.nmJa }, lang);
}
