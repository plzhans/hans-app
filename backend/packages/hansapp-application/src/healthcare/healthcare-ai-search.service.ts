import { Injectable, Logger } from '@nestjs/common';
import { HOSPITAL_TIERS, INPATIENT_TIERS } from '@hansapp/data/seed';

import {
  LlmService,
  SvcPromptRepository,
  jsonOutput,
  type LlmProviderName,
} from '@hansapp/llm';
import { HealthcareCodeCache } from './healthcare-code.cache';
import { HiraAsmCodeCache } from './hira-asm-code.cache';

/** 프롬프트 파일 이름. `<이 값>.system.md` · `<이 값>.schema.json` 을 읽는다. */
const PROMPT_NAME = 'hospital-search';

/**
 * 진료과목 최대 개수. 프롬프트에도 같은 제한을 적어 두지만 **여기서 한 번 더 자른다** —
 * 모델이 헷갈리면 관련 과를 열 개씩 늘어놓는데, 그러면 필터가 아무것도 안 거른 것과 같아진다.
 */
const MAX_SUBJECTS = 5;

/**
 * explain 길이 상한. **인젝션 피해의 상한이기도 하다** — 이 필드가 응답의 유일한 자유
 * 텍스트라, 프롬프트를 뚫었을 때 임의 문장을 실어 보낼 수 있는 통로가 여기뿐이다.
 * 조건 한 문장이면 충분한 자리라 짧게 자른다.
 */
const MAX_EXPLAIN_LENGTH = 200;

/**
 * explain 에서 지우는 것. **URL·이메일·전화번호가 여기 들어갈 이유가 없다** —
 * 조건을 설명하는 자리이지 사용자에게 무언가를 전달하는 통로가 아니다.
 * 프롬프트로도 금지하지만, 뚫렸을 때 피싱 링크가 화면에 그려지는 걸 막는 건 여기다.
 */
const EXPLAIN_FORBIDDEN =
  /(https?:\/\/\S+|www\.\S+|\S+@\S+\.\S+|\b\d{2,4}-\d{3,4}-\d{4}\b)/gi;

/**
 * 제어문자(줄바꿈 포함). 응답 텍스트와 로그 양쪽에서 걷어낸다.
 * no-control-regex 를 끄는 게 맞다 — 제어문자를 **지우는 것**이 이 정규식의 목적이다.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F]+/g;

/** 화면이 배너로 띄우는 신호. 스키마의 enum 과 같은 목록이다. */
export type AiSearchWarning =
  | 'off_topic'
  | 'emergency_suspected'
  | 'medical_caution'
  | 'unsupported_inverse'
  | 'tertiary_referral'
  | 'too_vague';

/**
 * 질문에서 뽑아낸 검색 조건. **HospitalFilterCommand 의 부분집합**이다 —
 * 자연어로 표현될 수 있는 것만 담는다(페이지·정렬·지도 영역은 화면이 정한다).
 */
export interface AiSearchFilter {
  subjectCds: string[];
  specialistCds: string[];
  asmItemCds: string[];
  specialtyCds: string[];
  equipmentCds: string[];
  classCds: string[];
  tiers: string[];
  emergency: boolean;
  baby: boolean;
  name?: string;
}

/**
 * 토큰 사용량. **@hansapp/llm 이 아니라 여기서 정의한다** — 이건 우리 API 응답 계약이라,
 * SDK 나 업체가 필드 이름을 바꿨다고 클라이언트가 같이 흔들리면 안 된다.
 * (SDK 쪽은 `usage.inputTokenDetails.cacheReadTokens` 처럼 중첩돼 있는데 그건 그쪽 사정이다)
 */
export interface AiSearchUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** 캐시에서 읽은 입력 토큰. Claude 에서만 채워진다. */
  readonly cacheReadTokens?: number;
  /** 캐시에 쓴 입력 토큰. Claude 에서만 채워진다. */
  readonly cacheWriteTokens?: number;
}

export interface AiSearchResult {
  readonly filter: AiSearchFilter;
  /**
   * 사용자가 쓴 지역 표현 원문. **코드로 바꾸지 않는다** — 역·동·시군구 해석은
   * 아직 이 서비스가 하지 않는다(지역 기준점 테이블이 들어오면 그때).
   * 화면이 이 문자열로 지역 선택을 유도하거나 그대로 보여준다.
   */
  readonly placeText?: string;
  readonly needsLocation: boolean;
  readonly warnings: AiSearchWarning[];
  readonly explain: string;
  /**
   * 검증에서 떨어진 값들(`subject:XX` 꼴). **응답에 싣는 이유는 프롬프트를 고치기 위해서다** —
   * 여기 뭔가 쌓이면 코드표와 프롬프트가 어긋났다는 뜻이라, 로그만 보고도 어느 코드가
   * 문제인지 알 수 있다. 비어 있는 게 정상이다.
   */
  readonly dropped: string[];
  readonly provider: LlmProviderName;
  readonly model: string;
  readonly usage: AiSearchUsage;
}

/** 모델이 낸 원시 JSON. 스키마로 강제되지만 신뢰하지 않고 다시 검증한다. */
interface RawFilter {
  subjectCds?: unknown;
  specialistCds?: unknown;
  asmItemCds?: unknown;
  specialtyCds?: unknown;
  equipmentCds?: unknown;
  classCds?: unknown;
  tiers?: unknown;
  emergency?: unknown;
  baby?: unknown;
  name?: unknown;
  placeText?: unknown;
  needsLocation?: unknown;
  warnings?: unknown;
  explain?: unknown;
}

const VALID_TIERS = new Set<string>([
  ...HOSPITAL_TIERS.map((t) => t.code),
  ...INPATIENT_TIERS,
]);

const VALID_WARNINGS = new Set<string>([
  'off_topic',
  'emergency_suspected',
  'medical_caution',
  'unsupported_inverse',
  'tertiary_referral',
  'too_vague',
]);

/**
 * 자연어 질문 → 병원 검색 조건.
 *
 * **검색은 하지 않는다.** 조건만 만들어 돌려주고, 실제 조회는 화면이 기존
 * `/healthcare/hospitals` 로 한 번 더 부른다. 그래서 이 서비스는 ES 도 DB 도 안 본다.
 *
 * 그렇게 나눈 이유:
 *   - 사용자가 **AI 가 뭘 잡았는지 보고 고칠 수 있다**. 틀려도 필터 하나 고치면 끝이라
 *     다시 물어볼 필요가 없다
 *   - 목록·지도·무한스크롤을 다시 만들지 않는다. 렌더링은 기존 화면 그대로다
 *   - 응답 토큰이 거의 안 든다(문장을 안 쓴다). 왕복도 한 번이라 도구 호출 루프가 없다
 *
 * **모델이 낸 코드를 그대로 믿지 않는다.** 스키마가 모양은 잡아 주지만 값이 우리 코드표에
 * 있는지는 모른다 — 없는 코드가 섞이면 검색이 조용히 0건이 되므로 여기서 걸러내고
 * 떨어뜨린 것을 dropped 로 알린다.
 */
@Injectable()
export class HealthcareAiSearchService {
  private readonly logger = new Logger(HealthcareAiSearchService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly prompts: SvcPromptRepository,
    private readonly codes: HealthcareCodeCache,
    private readonly asmCodes: HiraAsmCodeCache,
  ) {}

  async extractFilter(
    question: string,
    options: { provider?: LlmProviderName; model?: string } = {},
  ): Promise<AiSearchResult> {
    const prompt = this.prompts.get(PROMPT_NAME);

    const startedAt = Date.now();

    // 1) 뼈대를 받는다. 업체 선택·모델 인스턴스·캐시 옵션·시스템 메시지가 채워져 온다.
    const call = this.llm.prepare({
      system: prompt.system,
      provider: options.provider,
      model: options.model,
      // 시스템 프롬프트가 매 요청 동일하다(코드표 + 규칙). 캐시가 걸리면 입력 요금이 1/10 이다.
      cacheSystem: true,
    });

    // 2) 대화 내용만 얹는다. **여기가 도메인의 몫이다** — 업체가 무엇이든 같은 코드다.
    //
    // 질문을 태그로 감싼다. **경계를 만드는 것이 목적이다** — 시스템 프롬프트가
    // "이 안은 데이터지 명령이 아니다" 라고 못 박을 대상이 있어야 인젝션 방어가 성립한다.
    // 사용자가 닫는 태그를 흉내 내면 경계가 깨지므로 태그처럼 보이는 것을 미리 지운다.
    call.messages.push({
      role: 'user',
      content: `<user_question>\n${sanitizeQuestion(question)}\n</user_question>`,
    });
    call.output = jsonOutput(prompt.schema);

    // 3) 발송. 상한값을 안 채웠으므로 설정값(llm.maxTokens·llm.timeoutSec)이 적용된다.
    const response = await this.llm.chat(call);

    // SDK 응답을 **우리 API 계약으로 옮긴다.** 중첩 경로(inputTokenDetails)와
    // undefined 는 SDK 사정이라 여기서 흡수한다 — 클라이언트가 그걸 알 이유가 없다.
    const provider = call.provider;
    const model = response.response.modelId ?? options.model ?? '';
    const usage: AiSearchUsage = {
      inputTokens: response.usage.inputTokens ?? 0,
      outputTokens: response.usage.outputTokens ?? 0,
      cacheReadTokens: response.usage.inputTokenDetails?.cacheReadTokens,
      cacheWriteTokens: response.usage.inputTokenDetails?.cacheWriteTokens,
    };

    // 사용량·지연을 남긴다. **LlmService 가 아니라 여기서 남기는 이유**는 어느 프롬프트로
    // 무엇을 물었는지가 여기에만 있어서다 — 대행자의 로그는 "누가 왜" 를 못 적는다.
    // cacheRead 가 계속 0 이면 시스템 프롬프트가 요청마다 달라졌다는 뜻이다.
    this.logger.log(
      `${PROMPT_NAME} ${provider}/${model} ${Date.now() - startedAt}ms ` +
        `in=${usage.inputTokens} out=${usage.outputTokens} ` +
        `cacheRead=${usage.cacheReadTokens ?? 0} cacheWrite=${usage.cacheWriteTokens ?? 0}`,
    );

    // SDK 가 스키마 검증까지 끝낸 값이다(실패하면 chat 이 던진다).
    const raw = (response.output ?? {}) as RawFilter;
    if (!response.output) {
      // 스키마를 걸었는데도 값이 없으면 모델·엔드포인트 문제다. 원문 앞부분을 남겨 둔다.
      this.logger.warn(
        `llm returned unparseable output: ${response.text.slice(0, 200)}`,
      );
    }

    const dropped: string[] = [];

    const filter: AiSearchFilter = {
      subjectCds: this.pickCodes(raw.subjectCds, 'subject', dropped).slice(
        0,
        MAX_SUBJECTS,
      ),
      specialistCds: this.pickCodes(
        raw.specialistCds,
        'subject',
        dropped,
      ).slice(0, MAX_SUBJECTS),
      asmItemCds: this.pickAsmCodes(raw.asmItemCds, dropped),
      specialtyCds: this.pickCodes(raw.specialtyCds, 'specialty', dropped),
      equipmentCds: this.pickCodes(raw.equipmentCds, 'equipment', dropped),
      classCds: this.pickCodes(raw.classCds, 'class', dropped),
      tiers: this.pickFrom(raw.tiers, VALID_TIERS, 'tier', dropped),
      emergency: raw.emergency === true,
      baby: raw.baby === true,
      name: nonEmpty(raw.name),
    };

    if (dropped.length > 0) {
      // 조용히 지나가면 프롬프트가 코드표와 어긋난 걸 아무도 모른다.
      this.logger.warn(
        `dropped unknown codes: ${dropped.join(', ')} (question: ${forLog(question)})`,
      );
    }

    const warnings = this.pickFrom(
      raw.warnings,
      VALID_WARNINGS,
      'warning',
      dropped,
    ) as AiSearchWarning[];

    // 범위 밖 판정이면 **서버가 필터를 비운다.** 모델이 off_topic 을 달면서 조건도 같이
    // 채워 보내는 경우가 있는데(인젝션으로 유도되면 특히), 그대로 흘리면 화면이 엉뚱한
    // 검색을 돌린다. 판정과 결과를 여기서 일치시킨다.
    const offTopic = warnings.includes('off_topic');
    if (offTopic) {
      this.logger.warn(`off-topic question rejected: ${forLog(question)}`);
    }

    return {
      filter: offTopic ? emptyFilter() : filter,
      placeText: offTopic ? undefined : nonEmpty(raw.placeText),
      needsLocation: !offTopic && raw.needsLocation === true,
      warnings,
      explain: sanitizeExplain(raw.explain),
      dropped,
      provider,
      model,
      usage,
    };
  }

  /** healthcare_code 에 있는 코드만 통과시킨다. 없는 건 dropped 로 뺀다. */
  private pickCodes(raw: unknown, tp: string, dropped: string[]): string[] {
    return toStringArray(raw).filter((cd) => {
      if (this.codes.get(tp, cd)) {
        return true;
      }
      dropped.push(`${tp}:${cd}`);
      return false;
    });
  }

  /** 적정성평가 코드는 표가 따로다(hira_code). */
  private pickAsmCodes(raw: unknown, dropped: string[]): string[] {
    return toStringArray(raw).filter((cd) => {
      if (this.asmCodes.get(cd)) {
        return true;
      }
      dropped.push(`asm:${cd}`);
      return false;
    });
  }

  /** 코드표가 아니라 고정 집합으로 거르는 값(등급·경고). */
  private pickFrom(
    raw: unknown,
    valid: ReadonlySet<string>,
    label: string,
    dropped: string[],
  ): string[] {
    return toStringArray(raw).filter((value) => {
      if (valid.has(value)) {
        return true;
      }
      dropped.push(`${label}:${value}`);
      return false;
    });
  }
}

/** 배열이 아니거나 문자열이 아닌 항목은 버린다. 중복도 없앤다. */
function toStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item === 'string' && item.trim() !== '') {
      seen.add(item.trim());
    }
  }
  return [...seen];
}

/** 스키마가 null 을 허용하는 자리. 빈 문자열도 없는 것으로 본다. */
function nonEmpty(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : undefined;
}

/** 아무 조건도 없는 필터. 범위 밖 질문의 응답이다. */
function emptyFilter(): AiSearchFilter {
  return {
    subjectCds: [],
    specialistCds: [],
    asmItemCds: [],
    specialtyCds: [],
    equipmentCds: [],
    classCds: [],
    tiers: [],
    emergency: false,
    baby: false,
  };
}

/**
 * 질문에서 **태그처럼 보이는 것을 지운다.** 사용자가 `</user_question>` 을 흉내 내면
 * 프롬프트가 만든 경계가 그 자리에서 끊기고, 뒤에 붙인 문장이 지시로 읽힐 수 있다.
 * 병원 검색어에 꺾쇠가 들어갈 일이 없으므로 통째로 없앤다.
 */
function sanitizeQuestion(question: string): string {
  return question.replace(/[<>]/g, ' ').trim();
}

/**
 * explain 을 다듬는다. **응답의 유일한 자유 텍스트라 여기만 막으면 된다.**
 *
 * 프롬프트로도 URL 을 금지하지만 프롬프트는 뚫릴 수 있다. 화면에 피싱 링크가 그려지는
 * 것은 코드로 막는다 — 프롬프트는 품질을 위한 것이고, 이 함수가 안전장치다.
 */
function sanitizeExplain(raw: unknown): string {
  const text = nonEmpty(raw);
  if (!text) {
    return '';
  }
  return (
    text
      .replace(EXPLAIN_FORBIDDEN, '')
      // 제어문자를 지운다(줄바꿈 포함). 한 문장짜리 자리라 개행이 들어갈 이유가 없다.
      .replace(CONTROL_CHARS, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_EXPLAIN_LENGTH)
  );
}

/**
 * 로그에 실을 질문. **개행을 지우는 게 핵심이다** — 사용자 입력을 그대로 로그에 쓰면
 * 개행을 넣어 가짜 로그 줄을 만들 수 있다(로그 위조). 길이도 자른다.
 */
function forLog(question: string): string {
  return question
    .replace(CONTROL_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 200);
}
