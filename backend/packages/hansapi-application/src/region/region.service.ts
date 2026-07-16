import { Injectable } from '@nestjs/common';
import { PrismaService } from '@hansapi/data';
import { FALLBACK_LANG, type SupportedLang } from '@hansapi/common';

import { pickName } from '../healthcare/code-name';

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
  constructor(private readonly prisma: PrismaService) {}

  /** level 로 시도/시군구를 고르고, 시군구는 parentCode 로 시도를 좁힌다. */
  async list(
    options: {
      level?: string;
      parentCode?: string;
    },
    lang: SupportedLang = FALLBACK_LANG,
  ): Promise<Region[]> {
    const rows = await this.prisma.region_code.findMany({
      where: {
        ...(options.level ? { level: options.level } : {}),
        ...(options.parentCode ? { parent_cd: options.parentCode } : {}),
      },
      orderBy: [{ sort: 'asc' }, { cd: 'asc' }],
    });

    return rows.map((row) => ({
      code: row.cd,
      name: pickName(row, lang),
      // 짧은 이름은 한국어만 있다. 영어·일본어는 이미 짧아서(Seoul) 따로 둘 이유가 없다 —
      // 번역된 이름이 있으면 그걸 그대로 쓴다.
      shortName:
        lang === FALLBACK_LANG
          ? (row.short_nm ?? undefined)
          : (pickName(row, lang) ?? undefined),
      level: row.level,
      parentCode: row.parent_cd ?? undefined,
    }));
  }
}
