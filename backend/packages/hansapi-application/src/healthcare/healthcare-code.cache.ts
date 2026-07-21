import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { PrismaService } from '@hansapi/data';
import { FALLBACK_LANG, type SupportedLang } from '@hansapi/common';

import { pickName } from './code-name';

/** 캐시에 담는 코드 한 건(healthcare_code 의 표시에 필요한 칼럼만). */
export interface CodeEntry {
  code: string;
  /** 관리용 한국어 이름(최종 폴백). 표시에는 title 을 쓴다. */
  nm: string;
  /** 표시용 한국어 이름. */
  title: string;
  titleEn: string | null;
  titleJa: string | null;
  titleZh: string | null;
  cmt: string | null;
  sort: number;
}

/**
 * 코드표(healthcare_code) 인메모리 캐시.
 *
 * **부팅 때 한 번 통째로 읽어 메모리에 둔다.** 코드는 정적 참조 데이터라(운영이 시드로만 바꾼다)
 * 쿼리마다 조인/조회할 이유가 없다 — 지하철역·등급 이름이 이미 메모리(@hansapi/data 시드)인 것과
 * 같은 이유다. 병원 조회 SQL 에서 healthcare_code 조인을 걷어내고 이름은 여기서 붙인다.
 *
 * **바뀌면 재부팅(또는 reload()).** 시드 갱신은 배포/관리 작업이라 즉시 반영이 필요없다.
 * 표는 수백 행 규모라 메모리 부담이 없고, 조회는 Map 이라 O(1) 이다.
 */
@Injectable()
export class HealthcareCodeCache implements OnApplicationBootstrap {
  private readonly logger = new Logger(HealthcareCodeCache.name);
  /** tp → 코드 목록(sort 순). */
  private byType = new Map<string, CodeEntry[]>();
  /** `${tp}:${cd}` → 코드 한 건. */
  private byKey = new Map<string, CodeEntry>();

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.reload();
  }

  /**
   * 코드표를 다시 읽어 캐시를 통째로 교체한다. 부팅 시 자동 호출.
   * 교체는 새 맵을 만들어 마지막에 바꿔 끼우므로, 로딩 중에도 옛 맵이 온전하다.
   */
  async reload(): Promise<void> {
    const rows = await this.prisma.healthcareCode.findMany({
      orderBy: [{ tp: 'asc' }, { sort: 'asc' }, { cd: 'asc' }],
    });

    const byType = new Map<string, CodeEntry[]>();
    const byKey = new Map<string, CodeEntry>();
    for (const r of rows) {
      const entry: CodeEntry = {
        code: r.cd,
        nm: r.nm,
        title: r.title,
        titleEn: r.titleEn,
        titleJa: r.titleJa,
        titleZh: r.titleZh,
        cmt: r.cmt,
        sort: r.sort,
      };
      const list = byType.get(r.tp);
      if (list) list.push(entry);
      else byType.set(r.tp, [entry]);
      byKey.set(codeKey(r.tp, r.cd), entry);
    }

    this.byType = byType;
    this.byKey = byKey;
    this.logger.log(`healthcare_code ${rows.length}건 메모리 로드`);
  }

  /** tp 의 코드 목록(sort 순). 없으면 빈 배열. */
  list(tp: string): readonly CodeEntry[] {
    return this.byType.get(tp) ?? [];
  }

  /** (tp, cd) 한 건. 없으면 undefined. */
  get(tp: string, cd: string): CodeEntry | undefined {
    return this.byKey.get(codeKey(tp, cd));
  }

  /** (tp, cd) 표시명. 언어 폴백은 pickName 규칙. 모르는 코드면 undefined. */
  name(
    tp: string,
    cd: string,
    lang: SupportedLang = FALLBACK_LANG,
  ): string | undefined {
    const entry = this.byKey.get(codeKey(tp, cd));
    return entry ? codeName(entry, lang) : undefined;
  }
}

function codeKey(tp: string, cd: string): string {
  return `${tp}:${cd}`;
}

/** CodeEntry → 표시명. title 계열을 pickName 의 nm 자리에 매핑한다. */
export function codeName(entry: CodeEntry, lang: SupportedLang): string {
  return pickName(
    {
      nm: entry.title,
      nm_en: entry.titleEn,
      nm_ja: entry.titleJa,
      nm_zh: entry.titleZh,
    },
    lang,
  );
}
