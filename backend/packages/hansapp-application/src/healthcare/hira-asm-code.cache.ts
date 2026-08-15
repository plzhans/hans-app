import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '@hansapp/data';
import { FALLBACK_LANG, type SupportedLang } from '@hansapp/common';

import { pickName } from './code-name';

/** 병원평가 항목 한 건. 이름은 언어별로 들고 있다가 읽을 때 고른다. */
export interface AsmItem {
  /** 원본 asmGrd 번호. hira_hospital_asm 의 컬럼명(asm_01…)과 1:1. */
  code: string;

  /** 그룹 코드(hira_code.tp). 'asm01' 처럼 온다. */
  groupCode: string;

  /** 항목명. pickName 규칙으로 고른다(번역이 비면 한국어). */
  name: {
    nm: string;
    nm_en: string | null;
    nm_ja: string | null;
    nm_zh: string | null;
  };

  /** 그룹명. 같은 규칙. */
  groupName: {
    nm: string;
    nm_en: string | null;
    nm_ja: string | null;
    nm_zh: string | null;
  };

  /** 우리 메모. 천식의 인코딩 예외 같은 것. **내부용이라 응답에 싣지 않는다.** */
  cmt: string | null;
}

/**
 * 병원평가 항목 코드(hira_code 의 tp='asm*') 인메모리 캐시.
 *
 * **부팅 때 한 번 통째로 읽어 메모리에 둔다.** HealthcareCodeCache 와 같은 이유다 —
 * 코드는 시드로만 바뀌는 정적 참조 데이터라 조회마다 조인할 이유가 없다. 22행뿐이다.
 *
 * **HealthcareCodeCache 와 별개인 이유:** 저기는 healthcare_code(우리 코드), 여기는
 * hira_code(심평원 원본 코드)다. 병원평가는 심평원이 직접 평가·부여하는 HIRA 전용 개념이라
 * 통합 코드 레이어에 올리지 않았다.
 *
 * **번역은 우리가 붙인 것이다.** 심평원은 한국어만 준다. 화면(병원상세 평가 탭)에 그대로
 * 나가는 값이라 영어로 볼 때 "급성기뇌졸중" 이 뜨면 안 돼서 시드에 넣었다. 번역이 비면
 * 한국어로 폴백한다 — sync 가 채우는 6종은 번역이 없어 항상 한국어다.
 *
 * **계층은 tp → cd 2단이다.** tp 가 곧 그룹이다(asm01=급성질환). "병원평가항목" 이라는
 * 상위 레벨은 없다 — 모든 행에 똑같이 붙는 상수라 계층이 아니다.
 */
@Injectable()
export class HiraAsmCodeCache implements OnApplicationBootstrap {
  private readonly logger = new Logger(HiraAsmCodeCache.name);

  /** cd → 항목. cd 는 asm* 전체에서 유일하다(원본 asmGrd 번호라 겹치지 않는다). */
  private byCode = new Map<string, AsmItem>();

  /** 그룹 노출 순서. tp 오름차순 = 심평원 홈페이지 순서. */
  private groups: string[] = [];

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.reload();
  }

  /**
   * 다시 읽어 캐시를 통째로 교체한다. 부팅 시 자동 호출.
   * 새 맵을 만들어 마지막에 바꿔 끼우므로 로딩 중에도 옛 맵이 온전하다.
   */
  async reload(): Promise<void> {
    const rows = await this.prisma.hiraCode.findMany({
      where: { tp: { startsWith: 'asm' } },
      orderBy: [{ tp: 'asc' }, { cd: 'asc' }],
    });

    const byCode = new Map<string, AsmItem>();
    const groups: string[] = [];

    for (const r of rows) {
      byCode.set(r.cd, {
        code: r.cd,
        groupCode: r.tp,
        name: {
          nm: r.cdNm ?? r.cd,
          nm_en: r.cdNmEn,
          nm_ja: r.cdNmJa,
          nm_zh: r.cdNmZh,
        },
        groupName: {
          nm: r.tpNm,
          nm_en: r.tpNmEn,
          nm_ja: r.tpNmJa,
          nm_zh: r.tpNmZh,
        },
        cmt: r.cdCmt,
      });
      if (!groups.includes(r.tp)) {
        groups.push(r.tp);
      }
    }

    this.byCode = byCode;
    this.groups = groups;
    this.logger.log(
      `Loaded ${rows.length} hira_code(asm) rows in ${groups.length} groups into memory`,
    );
  }

  /** 항목 하나. 모르는 코드면 undefined. */
  get(code: string): AsmItem | undefined {
    return this.byCode.get(code);
  }

  /** 전체 항목 코드(그룹 → 항목 순). hira_hospital_asm 의 컬럼을 도는 데 쓴다. */
  codes(): readonly string[] {
    return [...this.byCode.keys()];
  }

  /** 그룹 코드 목록(노출 순서). */
  groupCodes(): readonly string[] {
    return this.groups;
  }
}

/** 항목명. 번역이 비어 있으면 한국어로 폴백한다(pickName 규칙). */
export function asmItemName(item: AsmItem, lang: SupportedLang = FALLBACK_LANG): string {
  return pickName(item.name, lang);
}

/** 그룹명. 같은 규칙. */
export function asmGroupName(item: AsmItem, lang: SupportedLang = FALLBACK_LANG): string {
  return pickName(item.groupName, lang);
}
