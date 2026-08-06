import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { HOSPITAL_TIERS, INPATIENT_TIERS } from '@hansapp/data/seed';

import {
  LLM_CONFIG,
  LlmService,
  SvcPromptRepository,
  jsonOutput,
  type LlmConfig,
  type LlmProviderName,
} from '@hansapp/llm';
import { CachePrefix } from '../common/cache-keys';
import { LlmUsageService } from '../common/llm-usage.service';
import { DailyQuotaService } from '../common/daily-quota.service';
import { RegionCache, type RegionEntry } from '../region/region.cache';
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

/**
 * 화면이 실행할 일. **필터가 아니라 지시다.**
 *
 * 필터 하나로 다 표현하려니 "조건은 비었는데 할 일은 있는" 경우가 표현이 안 됐다 —
 * "하남 병원 보여줘"(지역만)나 "근처 병원"(위치만)이 조건 0개로 읽혀 아무것도 못 했다.
 * 무엇을 할지를 이름으로 드러내면 그 자리가 사라진다.
 *
 * **닫힌 집합이다.** 모델이 도구 이름을 지어내지 않는다 — 서버가 모델의 출력(조건·지역·
 * 위치 의도)과 자기가 아는 것(지역 해석 결과·코드 검증 결과)을 합쳐 이 중 하나로 정한다.
 * 그래서 프론트는 switch 하나로 갈리고, 모르는 이름이 오면 조용히 넘기면 된다.
 */
export type AiSearchTool =
  /** 조건(+지역)으로 목록을 조회한다. 좌표가 필요 없다. */
  | 'search_hospitals'
  /** 현재 위치 기준 거리순으로 조회한다. **측위는 화면 몫이다** — 서버는 좌표를 모른다. */
  | 'search_nearby'
  /** 지역을 되물어야 한다. 사용자가 장소를 말했는데 코드로 못 옮겼다(역 이름·읍면동). */
  | 'ask_location'
  /** 검색하지 않는다. 범위 밖이거나 조건을 하나도 못 잡았다. */
  | 'reject';

/** 툴 인자. 툴마다 쓰는 것만 채워진다 — 안 쓰는 자리는 비어 있다. */
export interface AiSearchParams {
  /** search_hospitals · search_nearby · ask_location 이 쓴다. reject 면 비어 있다. */
  readonly filter: AiSearchFilter;
  /**
   * 시군구 코드(없으면 시도 코드). **search_hospitals 에서만 채워진다** —
   * 나머지 툴은 지역이 없거나(nearby) 아직 못 정한 것(ask_location)이다.
   */
  readonly regionCd?: string;
  /**
   * 사용자가 쓴 지역 표현 원문("강남역"). ask_location 이 되물을 때 화면에 보여준다.
   * search_hospitals 에서도 "무엇을 그렇게 읽었는지" 를 밝히는 데 쓴다.
   */
  readonly placeText?: string;
  /** reject 사유. `off_topic` 이면 범위 밖, `too_vague` 면 조건을 못 잡았다. */
  readonly reason?: AiSearchWarning;
}

export interface AiSearchResult {
  /** 화면이 무엇을 할지. 위 AiSearchTool 주석 참고. */
  readonly tool: AiSearchTool;
  readonly params: AiSearchParams;
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
  /**
   * 캐시에서 나온 답이면 true. **이때 `usage` 는 이 요청이 쓴 값이 아니다** — 처음 물었을 때
   * 쓴 값이 그대로 실려 있어서, 구분이 없으면 토큰을 합산하는 쪽이 실제보다 크게 센다.
   */
  readonly cached: boolean;
  /**
   * **서버가 이 요청을 처리한 시간(ms).** 브라우저가 기다린 시간이 아니다(네트워크가 빠진다).
   * 로그에 찍히는 값과 같아서, 사용자가 "느리다" 고 할 때 어느 구간인지 바로 가른다 —
   * 여기가 작은데 느리면 네트워크·렌더 쪽이다.
   */
  readonly elapsedMs: number;
}

/**
 * 하루 몫을 다 썼다. **클라이언트 잘못이 아니다** — 로그인 전에는 모두가 한 통을 나눠 쓰므로,
 * 남이 다 썼어도 여기로 온다. 그래서 "잠시 뒤 다시" 가 아니라 "오늘은 안 된다" 로 안내한다.
 */
export class AiSearchQuotaError extends Error {
  constructor(
    readonly scope: string,
    readonly limit: number,
  ) {
    super(`daily quota exhausted: ${scope} (limit ${limit})`);
    this.name = 'AiSearchQuotaError';
  }
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
  useMyLocation?: unknown;
  warnings?: unknown;
  explain?: unknown;
}

/**
 * 응답 캐시 수명(24시간).
 *
 * 길게 잡는 이유는 **답이 잘 안 변하기 때문**이다 — "천식 소아과" 가 어떤 진료과 코드로
 * 옮겨지는지는 시간이 지난다고 달라지지 않는다. 바뀌는 계기는 프롬프트 수정인데, 그건
 * 키에 섞인 프롬프트 해시가 알아서 갈라 준다.
 *
 * 그래도 무한이 아닌 것은 코드표(진료과목·평가항목)가 늘 수 있어서다. 새 코드가 들어오면
 * 프롬프트를 같이 고치는 게 정상이지만, 안 고쳐도 하루 뒤에는 다시 물어보게 된다.
 */
const ANSWER_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * 캐시에 담기는 **AiSearchResult 의 모양** 버전. 필드를 더하거나 이름을 바꾸면 올린다.
 *
 * 프롬프트 해시로는 이걸 못 막는다 — 프롬프트를 그대로 두고 코드만 고치는 경우가 있고,
 * 그때 옛 모양이 담긴 Redis 값이 새 코드로 흘러들면 `undefined` 를 필드처럼 읽는다.
 * 배포 직후 하루 동안만 나타나는 버그라 재현도 어렵다.
 *
 *   v1  filter/placeText/regionCd/useMyLocation 을 평평하게 두던 시절
 *   v2  tool + params 로 갈라낸 지금
 */
const CACHE_SHAPE_VERSION = 2;

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
    private readonly regions: RegionCache,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly quota: DailyQuotaService,
    // 한도 값만 본다. 실행은 LlmService 가 하고 이쪽은 "누가 얼마나 쓸 수 있나" 만 정한다.
    @Inject(LLM_CONFIG) private readonly llmConfig: LlmConfig,
    private readonly usage: LlmUsageService,
  ) {}

  /**
   * 응답 캐시 키. `aiSearch:<프롬프트해시>:<질문해시>`
   *
   * **질문 원문을 키에 넣지 않는다.** 건강 관련 질문이 Redis 키에 평문으로 쌓이면
   * `KEYS *` 한 번에 다 보인다(좌표를 URL·로그에 안 싣는 것과 같은 이유). 해시라 길이도 고정된다.
   *
   * **CRC32 같은 체크섬은 못 쓴다.** 32비트는 6만여 개에서 충돌이 시작되는데, 충돌하면
   * A 가 물은 답이 B 에게 간다 — 남의 검색 조건이 내 화면에 뜨는 것이라 그냥 버그가 아니다.
   * sha256 을 128비트로 잘라 쓴다(충돌하려면 2⁶⁴ 개가 필요하다).
   *
   * 프롬프트 해시는 **파일을 읽을 때 한 번** 계산해 둔 값이다(SvcPrompt.hash) — 8천 토큰을
   * 요청마다 해싱하지 않는다. 프롬프트가 바뀌면 키 공간이 통째로 갈려 옛 답이 안 나온다.
   */
  private cacheKey(questionHash: string, promptHash: string): string {
    return `${CachePrefix.aiSearch}:v${CACHE_SHAPE_VERSION}:${promptHash}:${questionHash}`;
  }

  /**
   * 모델이 읽어낸 것 + 서버가 아는 것 → **무엇을 할지**.
   *
   * **모델이 툴을 고르지 않는 이유**는 판단 재료의 절반이 서버에만 있어서다 —
   * "강남역" 이 시군구로 풀리는지, 모델이 낸 코드가 코드표에 있는지는 모델이 모른다.
   * 모델은 질문을 읽고, 서버는 그걸 실행 가능한 지시로 옮긴다.
   *
   * 순서가 곧 우선순위다. 위에서 걸리면 아래는 안 본다:
   *   1. 범위 밖         → reject     (조건이 있어도 버린다)
   *   2. 장소를 말했다   → 풀렸으면 search_hospitals, 못 풀었으면 ask_location
   *   3. 내 위치         → search_nearby
   *   4. 조건만 있다     → search_hospitals (전국)
   *   5. 아무것도 없다   → reject
   */
  private decide(input: {
    offTopic: boolean;
    filter: AiSearchFilter;
    placeText?: string;
    useMyLocation: boolean;
    warnings: AiSearchWarning[];
  }): { tool: AiSearchTool; params: AiSearchParams } {
    const { offTopic, filter, placeText, useMyLocation, warnings } = input;

    // 범위 밖이면 **조건을 통째로 버린다.** 모델이 off_topic 을 달면서 조건도 같이 채워
    // 보내는 경우가 있는데(인젝션으로 유도되면 특히), 그대로 흘리면 화면이 엉뚱한 검색을 돈다.
    if (offTopic) {
      return {
        tool: 'reject',
        params: { filter: emptyFilter(), reason: 'off_topic' },
      };
    }

    if (placeText) {
      const regionCd = this.resolveRegion(placeText);
      return regionCd
        ? { tool: 'search_hospitals', params: { filter, regionCd, placeText } }
        : // 역 이름·읍면동은 아직 못 푼다. 그대로 전국 검색을 돌리면 사용자는 자기가 말한
          // 동네가 반영된 줄 아니, 지역을 되묻고 조건은 들고 간다.
          { tool: 'ask_location', params: { filter, placeText } };
    }

    if (useMyLocation) {
      return { tool: 'search_nearby', params: { filter } };
    }

    // 지역도 위치도 없지만 조건은 있다 — 전국에서 찾는다.
    if (hasAnyCondition(filter)) {
      return { tool: 'search_hospitals', params: { filter } };
    }

    // 조건도 지역도 위치도 없다. 모델이 사유를 달았으면 그걸 살리고, 아니면 too_vague 다.
    return {
      tool: 'reject',
      params: {
        filter: emptyFilter(),
        reason: warnings.find((w) => w !== 'off_topic') ?? 'too_vague',
      },
    };
  }

  /**
   * `placeText` → 시군구 코드(없으면 시도 코드). 검색의 `region` 파라미터가 된다.
   *
   * **지오코딩이 아니라 이름 매칭이다.** "하남에서 찾아줘" 가 원하는 것은 하남시 안의
   * 목록이지 어느 점에서 가까운 순이 아니라, 좌표까지 갈 이유가 없다.
   *
   * 시도를 먼저 잡고 그 안에서 시군구를 찾는다 — "중구" 는 서울·부산·대구에 다 있어서
   * 시도 없이는 고를 수가 없다. 시도까지만 나오면 시도 코드로 만족한다(서버가 그 시도의
   * 시군구 전체로 넓혀 준다).
   *
   * **애매하면 포기한다.** 후보가 둘 이상이면 undefined 를 돌려주고, 화면이 placeText 로
   * 지역 선택을 띄운다 — 찍어서 엉뚱한 동네를 보여주는 것보다 한 번 묻는 게 낫다.
   */
  private resolveRegion(placeText: string): string | undefined {
    // "경기도 하남시" 처럼 붙여 쓰든 띄어 쓰든 같게 보려고 공백을 없앤다.
    const text = placeText.replace(/\s+/g, '');

    const hit = (entries: RegionEntry[]): RegionEntry[] =>
      entries.filter((r) => aliases(r).some((a) => text.includes(a)));

    // 시도가 잡히면 시군구 후보를 그 안으로 좁힌다.
    const sido = hit(this.regions.list({ level: 'sido' }))[0];
    const sggus = hit(
      this.regions.list({ level: 'sggu', parentCode: sido?.code }),
    );

    if (sggus.length === 1) {
      return sggus[0].code;
    }
    // 시군구가 여럿이면 시도까지만 확정된 것이다. 시도조차 없으면 못 푼 것이고.
    return sido?.code;
  }

  /**
   * **업체도 모델도 인자로 받지 않는다.** 설정(`llm.provider`, `llm.<provider>.defaultModel`)이
   * 정한다 — 호출자가 고르게 두면 호출자가 요금을 정하게 되는데, 이 메서드는 공개
   * 엔드포인트가 부른다. 바꿔 볼 일이 있으면 설정을 고치고 재시작한다.
   */
  async extractFilter(
    rawQuestion: string,
    /**
     * 누가 물었나. 하루 몫을 **누구 통에서 깎을지** 정하는 데만 쓴다.
     *   userId 있음   그 사람 몫 (로그인 붙은 뒤)
     *   없음          그 앱 몫 (appId) — 로그인 전 사용자들이 나눠 쓴다
     *
     * `requestId` 는 추적용이다. **로그에만 쓴다** — 판단에 끼어들지 않는다.
     */
    caller: {
      userId?: number;
      /** 어느 앱에서 왔나. **하루 몫도 사용 기록도 이 값으로 묶인다.** */
      appId?: number;
      requestId?: string;
    } = {},
  ): Promise<AiSearchResult> {
    /*
      **들어온 문자열은 여기서 한 번만 다듬는다.** 아래로는 이 값만 흐르므로 발송·해시·
      로그 어디서도 원문을 다시 만지지 않는다 — 세 군데가 각자 다듬던 시절에는 "무엇이
      정본인가" 가 흐렸고, 실제로 해시한 문자열과 발송한 문자열이 어긋나 있었다.
    */
    const question = cleanQuestion(rawQuestion);
    const prompt = this.prompts.get(PROMPT_NAME);

    const startedAt = Date.now();

    /*
      **같은 질문이면 부르지 않는다.** 업체의 프롬프트 캐시는 요금을 1/10 로 줄여 주지만
      지연은 그대로다(8천 토큰을 매번 읽는다 — 실측 5.6초). 사용자가 체감하는 건 그쪽이라,
      응답 자체를 담아 두면 두 번째부터는 수십 ms 다.

      **모든 사용자가 나눠 쓴다.** "천식 소아과" 는 누가 물어도 같은 조건이 나오므로,
      한 명이 물으면 나머지는 호출 없이 받는다.
    */
    const questionHash = questionHashOf(question);
    const key = this.cacheKey(questionHash, prompt.hash);
    const cached = await this.tryGet(key);
    if (cached) {
      const elapsedMs = Date.now() - startedAt;
      this.logger.log(
        `${tag(caller.requestId)}${PROMPT_NAME} cache hit ${elapsedMs}ms (${key})`,
      );
      /*
        **캐시 히트도 남긴다**(토큰 0). 안 남기면 수요를 알 수 없어 캐시가 얼마나 값을
        하는지 못 잰다 — 정산은 cached=false 만 합산하면 된다.

        await 하지 않는다. 응답을 만든 뒤에 남기는 기록이라 사용자를 기다리게 할 이유가 없다.
      */
      void this.usage.record({
        requestId: caller.requestId,
        appId: caller.appId,
        userId: caller.userId,
        feature: PROMPT_NAME,
        promptName: PROMPT_NAME,
        promptHash: prompt.hash,
        questionHash,
        provider: cached.provider,
        model: cached.model,
        inputTokens: 0,
        outputTokens: 0,
        cached: true,
        elapsedMs,
      });
      return { ...cached, elapsedMs };
    }

    // 1) 뼈대를 받는다. 업체 선택·모델 인스턴스·캐시 옵션·시스템 메시지가 채워져 온다.
    const call = this.llm.prepare({
      system: prompt.system,
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
      content: `<user_question>\n${question}\n</user_question>`,
    });
    call.output = jsonOutput(prompt.schema);

    /*
      **여기서 센다 — 발송 직전이다.**

      앞뒤로 한 칸씩 밀면 둘 다 틀린다:
        너무 앞(prepare 전)  키가 없어 prepare 가 터져도 카운터가 깎인다. 설정이 틀린 배포가
                             하루치를 태우고 나면 "설정 안 됨" 이 "오늘은 안 됨" 으로 바뀌어
                             진짜 원인을 가린다 — 나간 게 없는데 센 것이다.
        너무 뒤(chat 후)     실패한 호출이 안 세어진다. 그런데 실패해도 요금은 나갔을 수 있고,
                             무엇보다 실패가 공짜 재시도가 되어 상한이 뚫린다.

      **캐시 히트도 세지 않는다**(위에서 이미 반환했다). 외부 호출이 없으니 요금이 0 이고,
      깎으면 "같은 질문을 반복하면 한도가 준다" 는 이상한 규칙이 된다.

      prepare 는 로컬 계산뿐이라(모델 인스턴스 생성) 그 뒤가 곧 발송 직전이다.
    */
    const { scope, limit } = caller.userId
      ? {
          scope: `ai-search:user:${caller.userId}`,
          limit: this.llmConfig.userDailyLimit,
        }
      : {
          // 로그인 전이면 **어느 앱에서 왔나**로 센다. 같은 앱이면 브라우저든 서버 키든
          // 한 통이다 — 정산 주체가 앱이라 부르는 경로가 달라도 몫은 하나다.
          // 인증이 필수라 여기까지 왔다면 값이 있다. 없으면 한 통(unknown)으로 묶는다.
          scope: `ai-search:app:${caller.appId ?? 'unknown'}`,
          limit: this.llmConfig.appDailyLimit,
        };

    if (!(await this.quota.take(scope, limit))) {
      throw new AiSearchQuotaError(scope, limit);
    }

    // 3) 발송. 상한값을 안 채웠으므로 설정값(llm.maxTokens·llm.timeoutSec)이 적용된다.
    const response = await this.llm.chat(call);

    // SDK 응답을 **우리 API 계약으로 옮긴다.** 중첩 경로(inputTokenDetails)와
    // undefined 는 SDK 사정이라 여기서 흡수한다 — 클라이언트가 그걸 알 이유가 없다.
    const provider = call.provider;
    // **응답이 밝힌 모델이다** — 요청에 쓴 이름이 아니다. 별칭을 보내면 업체가 구체 버전으로
    // 풀어서 알려주므로, 실제로 무엇이 답했는지는 이쪽만 안다.
    const model = response.response.modelId ?? '';
    const usage: AiSearchUsage = {
      inputTokens: response.usage.inputTokens ?? 0,
      outputTokens: response.usage.outputTokens ?? 0,
      cacheReadTokens: response.usage.inputTokenDetails?.cacheReadTokens,
      cacheWriteTokens: response.usage.inputTokenDetails?.cacheWriteTokens,
    };

    // 사용량·지연을 남긴다. **LlmService 가 아니라 여기서 남기는 이유**는 어느 프롬프트로
    // 무엇을 물었는지가 여기에만 있어서다 — 대행자의 로그는 "누가 왜" 를 못 적는다.
    // cacheRead 가 계속 0 이면 시스템 프롬프트가 요청마다 달라졌다는 뜻이다.
    /*
      **업체의 요청 id 를 같이 남긴다.** 나중에 "이 호출이 왜 이랬나" 를 업체에 물어볼 때
      찾을 수 있는 값은 그쪽 id 뿐이다 — 우리 id 는 그들 시스템에 없다.
      반대로 우리 id 를 업체에 보내는 건 의미가 없어서 안 보낸다(색인되지 않는다).
    */
    const upstreamId = response.response.headers?.['request-id'];

    this.logger.log(
      `${tag(caller.requestId)}${PROMPT_NAME} ${provider}/${model} ` +
        `${Date.now() - startedAt}ms ` +
        `in=${usage.inputTokens} out=${usage.outputTokens} ` +
        `cacheRead=${usage.cacheReadTokens ?? 0} cacheWrite=${usage.cacheWriteTokens ?? 0}` +
        (upstreamId ? ` upstream=${upstreamId}` : ''),
    );

    void this.usage.record({
      requestId: caller.requestId,
      appId: caller.appId,
      userId: caller.userId,
      feature: PROMPT_NAME,
      promptName: PROMPT_NAME,
      promptHash: prompt.hash,
      questionHash,
      provider,
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      cached: false,
      elapsedMs: Date.now() - startedAt,
      upstreamId,
    });

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

    const placeText = offTopic ? undefined : nonEmpty(raw.placeText);
    // 장소를 말했으면 내 위치는 쓰지 않는다. 모델에도 그렇게 적어 뒀지만 여기서 한 번 더
    // 못 박는다 — 둘 다 켜져 오면 화면이 어느 쪽을 따를지 알 수 없다.
    const useMyLocation = !offTopic && !placeText && raw.useMyLocation === true;

    const { tool, params } = this.decide({
      offTopic,
      filter,
      placeText,
      useMyLocation,
      warnings,
    });

    const result: AiSearchResult = {
      tool,
      params,
      warnings,
      explain: sanitizeExplain(raw.explain),
      dropped,
      provider,
      model,
      usage,
      cached: false,
      elapsedMs: Date.now() - startedAt,
    };

    /*
      **떨어뜨린 코드가 있으면 담지 않는다.** dropped 는 프롬프트와 코드표가 어긋났다는
      신호라, 그 상태의 답을 하루 동안 돌려주면 고친 뒤에도 옛 결함이 계속 나온다.
      (프롬프트를 고치면 해시가 갈려 자동으로 무효화되지만, 코드표만 고친 경우는 안 갈린다)
    */
    if (dropped.length === 0) {
      await this.trySet(key, result);
    }
    return result;
  }

  /** 캐시 조회(best-effort). Redis 가 죽어도 AI 호출로 살아난다. */
  private async tryGet(key: string): Promise<AiSearchResult | undefined> {
    try {
      const hit = await this.cache.get<AiSearchResult>(key);
      // 캐시에서 온 것임을 표시해 둔다 — usage 는 이 요청이 쓴 값이 아니라 처음 물었을 때
      // 쓴 값이라, 구분이 없으면 토큰을 합산하는 쪽이 실제보다 크게 센다.
      // elapsedMs 는 부르는 쪽이 이번 요청 기준으로 다시 채운다(담긴 값은 처음 것이다).
      return hit ? { ...hit, cached: true } : undefined;
    } catch {
      return undefined;
    }
  }

  /** 캐시 저장(best-effort). 실패해도 응답은 이미 만들어졌다. */
  private async trySet(key: string, value: AiSearchResult): Promise<void> {
    try {
      await this.cache.set(key, value, ANSWER_CACHE_TTL_MS);
    } catch {
      // 저장 실패는 무시한다.
    }
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

/**
 * 지역 하나를 부르는 이름들. `resolveRegion` 이 이 중 하나라도 걸리면 그 지역으로 본다.
 *
 * **꼬리(시·군·구)를 뗀 형태를 같이 넣는 게 핵심이다.** 사람들은 "강남구" 라고 안 하고
 * "서울 강남" 이라고 쓴다 — 정식 명칭만 보면 그게 안 걸려서 시도까지만 잡히고 만다.
 *
 * 한 글자로 줄어드는 것은 뺀다. "중구" → "중" 은 아무 문장에나 들어 있어서, 그걸로
 * 매칭하면 지역과 상관없는 질문이 엉뚱한 구로 걸린다.
 */
function aliases(region: RegionEntry): string[] {
  const names = [region.nm, region.shortNm].filter((n): n is string => !!n);
  const stems = names
    .map((n) => n.replace(/\s+/g, ''))
    .flatMap((n) => {
      const stem = n.replace(/[시군구]$/, '');
      return stem.length >= 2 && stem !== n ? [n, stem] : [n];
    });
  return [...new Set(stems)];
}

/**
 * 들어온 질문을 **한 번에 정본으로 만든다.** 이 함수를 지난 값만 아래로 흐른다.
 *
 * 하는 일:
 *   NFKC 정규화     전각 "ＡＢ" 와 반각 "AB" 를 같게 본다
 *   꺾쇠 제거       `</user_question>` 흉내로 프롬프트 경계를 끊는 것을 막는다.
 *                   병원 검색어에 꺾쇠가 들어갈 일이 없어 통째로 없앤다
 *   가로 공백 합침  스페이스·탭 연속을 한 칸으로
 *   빈 줄 접기      줄바꿈 3개 이상 → 2개
 *   앞뒤 정리       trim
 *
 * **줄바꿈은 살린다.** 입력칸이 여러 줄을 받으므로(Shift+Enter) 사용자가 나눈 문단은
 * 그 자체로 뜻이다 — "증상 / 원하는 조건" 처럼 끊어 적은 걸 한 줄로 뭉개면 오히려 읽기
 * 어려워진다.
 *
 * 대신 **빈 줄이 여러 개 이어지는 것은 접는다.** 그건 사람이 쓰는 모양이 아니라, 태그 안에
 * 새 절이 시작된 것처럼 보이게 만드는 수단이다(`### 시스템 지시` 같은 위장). 문단 하나를
 * 나누는 데는 빈 줄 한 개면 족하다.
 *
 * **소문자로 만들지 않는다.** 그건 "같은 질문인가" 를 볼 때만 필요한 것이라 해시 쪽에
 * 둔다 — 모델이 읽는 글을 굳이 뭉갤 이유가 없다.
 *
 * **어순은 건드리지 않는다.** "천식 소아과" 와 "소아과 천식" 을 같게 보고 싶은 유혹이
 * 있지만, 단어를 정렬하면 "주사 말고 약" 과 "약 말고 주사" 도 같아진다 — 뜻이 정반대인
 * 질문이 캐시 한 칸을 나눠 쓰게 된다. 덜 맞는 게 틀린 답보다 낫다.
 */
function cleanQuestion(raw: string): string {
  return (
    raw
      .normalize('NFKC')
      .replace(/[<>]/g, ' ')
      // 줄바꿈을 남겨야 하므로 가로 공백만 골라 합친다(\s 는 \n 까지 먹는다).
      .replace(/[^\S\n]+/g, ' ')
      // 줄 끝에 남은 공백은 지운다. 안 지우면 "천식 \n" 처럼 티 안 나는 차이가 해시를 가른다.
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

/**
 * 질문의 신원(sha256 앞 128비트). **캐시 키와 사용 기록이 같은 값을 쓴다** —
 * 원문은 복원할 수 없으면서 "같은 질문인가" 는 판별된다.
 */
function questionHashOf(question: string): string {
  // cleanQuestion 이 이미 지나간 값이다. 대소문자만 더 지운다 — "ENT" 와 "ent" 는 같은
  // 질문이지만, 발송하는 문자열까지 소문자로 만들 이유는 없다(모델이 읽는 글이다).
  return createHash('sha256')
    .update(question.toLowerCase())
    .digest('hex')
    .slice(0, 32);
}

/** 스키마가 null 을 허용하는 자리. 빈 문자열도 없는 것으로 본다. */
function nonEmpty(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : undefined;
}

/** 로그 앞머리. 추적 id 가 없으면(내부 호출 등) 아무것도 안 붙인다. */
function tag(requestId?: string): string {
  return requestId ? `[${requestId}] ` : '';
}

/**
 * 조건이 하나라도 잡혔나. **지역·위치는 안 센다** — 그건 filter 밖에 있고, 여기서는
 * "전국에서라도 걸러낼 게 있나" 만 묻는다(decide 가 지역·위치를 먼저 처리한 뒤 부른다).
 */
function hasAnyCondition(filter: AiSearchFilter): boolean {
  return (
    filter.subjectCds.length > 0 ||
    filter.specialistCds.length > 0 ||
    filter.asmItemCds.length > 0 ||
    filter.specialtyCds.length > 0 ||
    filter.equipmentCds.length > 0 ||
    filter.classCds.length > 0 ||
    filter.tiers.length > 0 ||
    filter.emergency ||
    filter.baby ||
    !!filter.name
  );
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
