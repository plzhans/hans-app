import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { HOSPITAL_TIERS, INPATIENT_TIERS } from '@hansapp/data/seed';
import { FALLBACK_LANG, type SupportedLang } from '@hansapp/common';

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
import {
  UsageQuotaService,
  type QuotaBucket,
  type QuotaState,
  type QuotaWindow,
} from '../common/usage-quota.service';
import { RegionCache, type RegionEntry } from '../region/region.cache';
import { pickName } from './code-name';
import { HealthcareCodeCache } from './healthcare-code.cache';
import { HiraAsmCodeCache } from './hira-asm-code.cache';

/** 프롬프트 파일 이름. `<이 값>.system.md` · `<이 값>.schema.json` 을 읽는다. */
const PROMPT_NAME = 'hospital-search';

/** 답변 모드일 때 시스템 프롬프트 뒤에 덧붙이는 블록(캐시 안 걸림). */
const ANSWER_BLOCK = 'answer-mode';

/**
 * 답변 모드로 들어가는 말머리. **로그인이 붙기 전까지의 임시 수단이다** —
 * 잔액이 생기면 이 문자열은 사라지고 사용자 잔액이 그 자리를 대신한다.
 *
 * 설정(`llm.allowTestCommand`)이 꺼져 있으면 모드로 안 들어간다. 다만 **문자열은 그때도
 * 떼어낸다** — 명령이지 질문의 일부가 아니라서, 붙은 채로 모델에 보내면 질문이 달라지고
 * 캐시 키도 갈린다.
 */
const TEST_COMMAND = '/test';

/** 답변 본문 상한. explain 보다 길지만, 모델에게도 4문장을 넘기지 말라고 적어 뒀다. */
const MAX_ANSWER_LENGTH = 600;

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
  /**
   * 병원을 찾는 건 아니지만 **건강·질환에 관한 물음**. 지금은 답하지 않지만
   * "나중에 답할 수 있는 질문" 이라 off_topic 과 나눠 둔다 — 화면이 가입·충전을
   * 안내하는 근거다(그냥 범위 밖이면 안내할 것이 없다).
   */
  | 'medical_question'
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
  /** 건강 질문에 답한다. **답변 모드에서만 나온다** — params.answer 에 본문이 있다. */
  | 'answer_medical'
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
  /** `answer_medical` 의 본문. 다른 툴에서는 비어 있다. */
  readonly answer?: string;
}

/** 통 하나의 상태. **어느 통인지는 담긴 필드 이름이 말한다.** */
export interface AiSearchQuotaWindow {
  /** 지금까지 쓴 통합 토큰. */
  readonly used: number;
  readonly limit: number;
}

/**
 * 앱 몫. **우리 예산이다** — 이 앱에 이번 달 얼마까지 쓸 것인가.
 *
 * 월이 진짜 한도이고 일은 그게 첫날에 다 타 버리지 않게 하는 둑이다.
 * **먼저 차는 쪽이 막는다.**
 */
export interface AiSearchAppQuota {
  readonly daily?: AiSearchQuotaWindow;
  readonly monthly?: AiSearchQuotaWindow;
}

/** 개인 몫. 충전해서 쓰는 잔액이라 **리셋되지 않고, 하루·월로 나누지도 않는다.** */
export interface AiSearchUserQuota {
  readonly balance?: AiSearchQuotaWindow;
}

/**
 * 지금 쓰는 몫. **둘 다 내려준다 — 화면이 골라 쓴다.**
 *
 * 실제로 깎이는 것은 신원의 것 하나다(로그인했으면 개인 잔액, 아니면 앱 예산).
 * 그래도 둘 다 싣는 것은, 안 깎는 쪽도 얼마나 남았는지는 알아야 해서다.
 *
 * **없는 쪽은 안 걸렸다는 뜻이다.** 지금은 로그인이 없어 `user` 가 늘 비어 있다.
 */
export interface AiSearchQuota {
  readonly app?: AiSearchAppQuota;
  readonly user?: AiSearchUserQuota;
}

/**
 * 잡힌 조건 한 묶음. **코드가 아니라 이름으로 온다.**
 *
 * 화면이 코드표를 또 부르지 않게 서버가 붙여 준다 — 코드표는 부팅 때 메모리에 올라와
 * 있어서(HealthcareCodeCache) 추가 조회가 없다. 화면에서 부르면 채팅을 열 때마다
 * 요청이 나가고, 그러면서도 결국 같은 값이 나온다.
 */
export interface AiSearchCondition {
  /** 묶음 이름. 화면이 이 값으로 "진료과"/"장비" 같은 앞말을 고른다. */
  readonly group: AiSearchConditionGroup;
  /** 사람이 읽는 이름들. 요청 언어(Accept-Language)로 온다. */
  readonly names: string[];
}

export type AiSearchConditionGroup =
  'subject' | 'specialist' | 'assessment' | 'specialty' | 'equipment' | 'class';

/** 확인용 원시값. 사용자에게 보일 것이 아니다 — AiSearchResult.debug 주석 참고. */
export interface AiSearchDebug {
  /**
   * 우리 Redis 캐시에서 나온 답인가. **사용자가 알 필요 없다** — 값은 히트든 아니든
   * 같고(같은 질문이면 같은 값이다), 왜 어떤 때는 빠른지는 우리 사정이다.
   *
   * 확인용으로는 중요하다: 계속 MISS 면 캐시 키가 매번 갈리고 있다는 뜻이다.
   */
  readonly cached: boolean;
  /** **cached 가 true 면 이 값은 처음 물었을 때 쓴 양이다** — 이번 요청 것이 아니다. */
  readonly usage: AiSearchUsage;
}

/**
 * 사용량 한 장. **`available` 이 값의 유무와 다른 것을 말한다.**
 *
 *   available: true,  quota 있음    한도가 걸려 있고 이만큼 썼다
 *   available: true,  quota 없음    걸린 한도가 없다(한도 0, 또는 Redis 를 안 쓰는 구성)
 *   available: false               **모른다** — 계수기를 못 읽었다
 *
 * 셋을 뭉치면 한도 없이 도는 배포와 계수기가 죽은 배포가 화면에서 똑같아진다.
 */
export interface QuotaSnapshot {
  readonly available: boolean;
  readonly quota?: AiSearchQuota;
}

/**
 * 앞선 대화 한 마디. **화면이 들고 있는 원문이다** — 서버가 발급한 상태(`context`)와
 * 주인이 다르므로 따로 받는다.
 *
 * 조건만으로는 안 되는 말들이 있다: "아까 말한 증상 말고", "그럼 약은?". 조건은 **무엇을
 * 찾는가**만 담고 **왜·무엇을 물었는가**는 안 담기 때문이다.
 */
export interface AiSearchHistoryTurn {
  /** 사용자가 한 말. */
  readonly question: string;
  /** 그때 우리가 한 답(있으면). 답변 모드에서만 생긴다. */
  readonly answer?: string;
  /**
   * `answer` 에 딸려 온 서명(응답의 `answerSignature`). **없거나 안 맞으면 `answer` 를
   * 버린다** — `question` 은 그대로 쓴다. 사용자가 자기 말을 다시 보내는 것은 위조가 아니다.
   */
  readonly signature?: string;
}

/** 몫의 주인. 앱 예산인지 개인 잔액인지. */
export type QuotaOwner = 'app' | 'user';

/** 깎을 통 한 벌. 신원마다 몇 벌이 걸리는지가 다르다. */
interface QuotaTarget {
  readonly owner: QuotaOwner;
  readonly scope: string;
  readonly buckets: QuotaBucket[];
}

/**
 * 몫을 고르는 데 필요한 신원. **둘 중 하나만 채워진다** —
 * 로그인했으면 userId, 아니면 어느 앱에서 왔나(appId).
 */
export interface QuotaCaller {
  readonly userId?: number;
  readonly appId?: number;
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
  /**
   * 잡힌 조건을 **사람이 읽는 이름으로** 푼 것. `params.filter` 의 코드와 같은 내용이다.
   *
   * **캐시에 담기지 않는다** — 언어마다 다른 값이라 담으면 한국어 답이 영어 사용자에게
   * 그대로 나가거나, 캐시를 언어 수만큼 쪼개야 한다. 코드만 담고 나갈 때 푼다.
   *
   * 등급·응급실 같은 고정값은 여기 없다. 코드표가 없는 값이라 화면이 자기 문구를 쓴다.
   */
  readonly conditions: AiSearchCondition[];
  readonly provider: LlmProviderName;
  /**
   * 실제로 답한 모델. **응답이 밝힌 이름이다** — 별칭을 보내면 업체가 구체 버전으로 풀어 준다.
   *
   * 공개해도 되는 이유는 **토큰 수가 안 나가기 때문**이다. 모델을 알면 단가는 알 수 있지만
   * 곱할 수량이 없어 요금이 역산되지 않는다. 둘이 같이 나가면 그때는 계산이 된다.
   */
  readonly model: string;
  /**
   * **이 요청이 쓴 통합 토큰.** 사용자에게 보이는 유일한 사용량 숫자다.
   *
   * 원시 토큰 수가 아니라 환산값이다 — 출력이 입력보다 5배 비싸고 모델마다 단가가 달라서,
   * 세는 단위를 하나로 접지 않으면 같은 숫자가 자리마다 다른 돈을 뜻하게 된다.
   * 한도(`quota`)도 같은 단위라 두 숫자를 그대로 견줄 수 있다.
   *
   * **캐시에서 나온 답도 같은 값을 문다.** 같은 질문이면 언제 묻든 같은 값이어야 하고,
   * 공짜로 주면 처음 물은 사람만 내는 구조가 된다. 우리가 앤트로픽에 안 낸 몫은
   * 캐시를 유지한 대가다.
   *
   * 0 인 경우는 **아무 답도 안 준 때**뿐이다(사전 차단).
   */
  readonly credits: number;
  /**
   * `params.answer` 의 서명. **답이 있고 키가 설정된 배포에만 실린다.**
   *
   * 화면은 이걸 답과 함께 들고 있다가 다음 요청의 `history` 에 그대로 돌려준다 —
   * 그래야 우리가 쓴 글만 문맥으로 이어진다.
   *
   * 자격이 아니라 저작자를 증명하므로 만료도 nonce 도 없다. 오래된 서명을 재생해 봐야
   * 자기가 받았던 답을 다시 문맥에 넣는 것뿐이라 일어나는 일이 없다.
   */
  readonly answerSignature?: string;
  /**
   * 원시 토큰 내역. **설정(llm.exposeDebugUsage)이 켜진 배포에만 실린다** — 로컬·개발이다.
   *
   * 모델 이름과 달리 **이쪽은 곱할 수량이라** 나가면 단가와 맞물려 요금이 그대로 역산된다.
   * 화면에서 감추는 걸로는 안 감춰지므로(응답 JSON 에 그대로 있다) 아예 안 싣는다.
   */
  readonly debug?: AiSearchDebug;
  /**
   * **서버가 이 요청을 처리한 시간(ms).** 브라우저가 기다린 시간이 아니다(네트워크가 빠진다).
   * 로그에 찍히는 값과 같아서, 사용자가 "느리다" 고 할 때 어느 구간인지 바로 가른다 —
   * 여기가 작은데 느리면 네트워크·렌더 쪽이다.
   */
  readonly elapsedMs: number;
  /**
   * 쓴 몫. **못 셌으면 비어 있다**(Redis 미설정·읽기 실패, 또는 한도 없음).
   * 화면은 없으면 아무것도 안 그린다 — 0/0 을 그리면 다 쓴 것처럼 보인다.
   */
  readonly quota?: AiSearchQuota;
}

/**
 * 몫을 다 썼다. **클라이언트 잘못이 아니다** — 로그인 전에는 모두가 한 통을 나눠 쓰므로,
 * 남이 다 썼어도 여기로 온다. 그래서 "잠시 뒤 다시" 가 아니라 "오늘은 안 된다" 로 안내한다.
 *
 * **어느 통이 찼는지를 들고 있는다**(`window`). 안내가 갈려야 하기 때문이다 — 하루치가
 * 찼으면 내일 풀리지만, 월치가 찼으면 다음 달까지다.
 */
export class AiSearchQuotaError extends Error {
  constructor(
    /** 어느 쪽 몫이 찼는지. 앱 예산이면 사용자 잘못이 아니다. */
    readonly owner?: QuotaOwner,
    /** 못 읽어서 막은 경우(fail-closed)에는 비어 있다. */
    readonly window?: QuotaWindow,
  ) {
    super(`quota exhausted: ${owner ?? 'unknown'} ${window ?? 'unknown'}`);
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
  answer?: unknown;
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
  'medical_question',
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
    private readonly quota: UsageQuotaService,
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
  private cacheKey(
    questionHash: string,
    promptHash: string,
    carried?: string,
  ): string {
    const state = carried ? `:${sha(carried).slice(0, 16)}` : '';
    return `${CachePrefix.aiSearch}:v${CACHE_SHAPE_VERSION}:${promptHash}:${questionHash}${state}`;
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
    answerMode: boolean;
    rawAnswer: unknown;
    offTopic: boolean;
    filter: AiSearchFilter;
    placeText?: string;
    useMyLocation: boolean;
    warnings: AiSearchWarning[];
  }): { tool: AiSearchTool; params: AiSearchParams } {
    const {
      answerMode,
      rawAnswer,
      offTopic,
      filter,
      placeText,
      useMyLocation,
      warnings,
    } = input;

    /*
      **검색하지 않는 두 경우를 먼저 걸러낸다.** 둘 다 조건을 통째로 버린다 — 모델이
      off_topic 을 달면서 조건도 같이 채워 보내는 경우가 있는데(인젝션으로 유도되면 특히),
      그대로 흘리면 화면이 엉뚱한 검색을 돈다.

      **사유는 나눠서 넘긴다.** 화면이 할 말이 다르기 때문이다 —
      의학 질문은 "가입하면 답할 수 있다" 로 이어지지만, 그냥 범위 밖은 이어질 데가 없다.
    */
    if (offTopic) {
      return {
        tool: 'reject',
        params: { filter: emptyFilter(), reason: 'off_topic' },
      };
    }
    if (warnings.includes('medical_question')) {
      // 답변 모드라도 **모델이 답을 안 냈으면 거절로 떨어뜨린다.** 빈 답변 상자를 그리는
      // 것보다 "지금은 안 된다" 가 낫다.
      const answer = answerMode
        ? sanitizeAnswer(rawAnswer, MAX_ANSWER_LENGTH)
        : undefined;
      return answer
        ? { tool: 'answer_medical', params: { filter: emptyFilter(), answer } }
        : {
            tool: 'reject',
            params: { filter: emptyFilter(), reason: 'medical_question' },
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
   * 지금 사용량. **아무것도 깎지 않는다.**
   *
   * 화면이 채팅창을 열 때 한 번 부른다 — 첫 질문을 하기 전에도 얼마나 남았는지는 보여야
   * 하는데, 답변에 실려 오는 값은 물어봐야 생긴다.
   *
   * **주기적으로 부르라고 만든 것이 아니다.** 값이 바뀌는 계기는 이 사람이 질문하는
   * 순간뿐이고 그때는 답변이 새 값을 싣고 온다. 폴링하면 아무것도 안 바뀐 값을 계속
   * 받으면서 Redis 만 친다.
   *
   * 못 셌으면 undefined 다(Redis 미설정·읽기 실패, 한도 없음). **여기서는 막지 않는다** —
   * 표시용이라 없으면 안 보여주면 그만이고, 실제 차단은 질문할 때 fail-closed 로 걸린다.
   */
  async getQuota(caller: QuotaCaller): Promise<QuotaSnapshot> {
    return this.readQuota(this.quotaTargets(caller));
  }

  /**
   * 누구 몫에서 깎을지. **신원이 통을 고른다** — 부르는 쪽이 고르지 않는다.
   *
   * **여기서 나오는 것은 "보여줄 통" 전부다.** 실제로 깎는 것은 그중 일부다(chargeTargets).
   */
  private quotaTargets(caller: QuotaCaller): QuotaTarget[] {
    const targets: QuotaTarget[] = [
      {
        owner: 'app',
        // 같은 앱이면 브라우저든 서버 키든 한 통이다 — 정산 주체가 앱이라
        // 부르는 경로가 달라도 몫은 하나다.
        scope: `ai-search:app:${caller.appId ?? 'unknown'}`,
        buckets: [
          { window: 'day', limit: this.llmConfig.appDailyTokens },
          { window: 'month', limit: this.llmConfig.appMonthlyTokens },
        ],
      },
    ];
    if (caller.userId) {
      targets.push({
        owner: 'user',
        scope: `ai-search:user:${caller.userId}`,
        buckets: [{ window: 'balance', limit: this.llmConfig.userTokens }],
      });
    }
    return targets;
  }

  /**
   * 모든 통을 읽어 응답 모양으로 묶는다. 깎지 않는다.
   *
   * **하나라도 못 읽으면 `available: false` 다.** 값이 없는 것과 모르는 것은 다르다 —
   * 한도 없이 도는 배포(로컬)와 계수기가 죽은 배포를 같게 다루면, 화면이 어느 쪽인지
   * 모른 채 "한도 없음" 으로 그린다.
   */
  private async readQuota(targets: QuotaTarget[]): Promise<QuotaSnapshot> {
    const read = await Promise.all(
      targets.map(async (target) => ({
        owner: target.owner,
        states: await this.quota.peek(target.scope, target.buckets),
      })),
    );
    if (read.some((r) => r.states === undefined)) {
      return { available: false };
    }
    return {
      available: true,
      quota: toQuota(read as { owner: QuotaOwner; states: QuotaState[] }[]),
    };
  }

  /**
   * 실제로 깎을 통. **신원의 것 하나만 깎는다** — 로그인했으면 개인 잔액, 아니면 앱 예산.
   *
   * 로그인한 사람도 앱 예산을 같이 깎아야 하지 않나 싶지만(우리가 업체에 내는 돈은
   * 그대로다) 그러면 **돈 낸 사람이 무료 사용자들 때문에 막힌다.** 어느 쪽이 맞는지는
   * 요금제가 정해져야 답이 나오는 문제라, 로그인이 붙을 때 같이 정한다.
   *
   * 지금은 로그인이 없어 늘 앱 하나다.
   */
  private chargeTargets(targets: QuotaTarget[]): QuotaTarget[] {
    const owned = targets.find((t) => t.owner === 'user');
    return owned ? [owned] : targets;
  }

  /**
   * 깎을 통에 자리가 있는지 본다. **하나라도 차 있으면 막는다.**
   * 어느 통이 막았는지를 돌려준다 — 안내 문구가 갈려야 한다.
   */
  private async reserveQuota(
    targets: QuotaTarget[],
  ): Promise<{ allowed: boolean; owner?: QuotaOwner; window?: QuotaWindow }> {
    for (const target of this.chargeTargets(targets)) {
      const room = await this.quota.reserve(target.scope, target.buckets);
      if (!room.allowed) {
        return { allowed: false, owner: target.owner, window: room.blocked };
      }
    }
    return { allowed: true };
  }

  /**
   * 쓴 만큼 더하고 결과를 응답 모양으로 묶는다.
   *
   * **깎는 통과 보여주는 통이 다르다.** 깎는 것은 신원의 것 하나뿐이지만, 화면에는
   * 걸려 있는 통을 다 보여줘야 한다 — 안 깎는 쪽도 "얼마나 남았나" 는 알아야 한다.
   */
  private async chargeQuota(
    targets: QuotaTarget[],
    amount: number,
  ): Promise<AiSearchQuota | undefined> {
    const charged = new Set(this.chargeTargets(targets));
    const states = await Promise.all(
      targets.map(async (target) => ({
        owner: target.owner,
        // 안 깎는 쪽은 읽기만 한다. 못 읽었으면 그 통은 빼고 보낸다 —
        // 여기까지 온 요청은 이미 답이 나갔으므로, 표시가 하나 빈다고 막을 일이 아니다.
        states: charged.has(target)
          ? await this.quota.add(target.scope, amount, target.buckets)
          : ((await this.quota.peek(target.scope, target.buckets)) ?? []),
      })),
    );
    return toQuota(states);
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
      /** 조건 이름을 어느 언어로 풀지. 없으면 기본 언어. */
      lang?: SupportedLang;
      /**
       * **직전에 우리가 내려준 `params` 를 그대로 받는다.** 대화를 잇는 유일한 수단이다.
       *
       * 서버는 대화를 기억하지 않는다(요청 하나가 자족적이다). 대신 조건이 이미 코드로
       * 정규화돼 있어서, 이 한 덩어리면 "지금까지 뭘 찾고 있었나" 가 온전히 복원된다 —
       * 전체 대화를 물고 다니는 것보다 싸고, 상태가 같으면 캐시도 그대로 맞는다.
       *
       * **모양이 응답과 같은 것은 일부러다.** 화면은 받은 것을 그대로 돌려주면 되고,
       * 새 규격을 하나 더 익힐 필요가 없다.
       *
       * 다만 **여기 담겨 오는 것은 사용자가 보낸 값이다.** 우리가 내려준 것이라는 보장이
       * 없으므로 코드는 코드표로 다시 거르고, 자유 문장(`answer`·`reason`)은 아예 안 쓴다.
       */
      context?: AiSearchParams;
      /**
       * 앞선 대화. **최근 것부터 몇 마디만** 담는다(오래된 맥락은 거의 안 쓰이는데 값은 든다).
       *
       * **클라이언트가 보낸 값이라 위조할 수 있다.** 특히 `a` 는 "우리가 이렇게 답했다" 는
       * 주장이라 조건보다 힘이 세다 — 그래서 시스템 프롬프트가 "태그 안은 전부 데이터다" 를
       * 못 박고, 여기 담긴 것도 그 태그 안으로만 들어간다. 그래도 사용자의 말 한 줄보다는
       * 위험한 입력이므로, 답변 기능이 널리 열릴 때 서명이나 서버 보관을 다시 검토해야 한다.
       */
      history?: AiSearchHistoryTurn[];
    } = {},
  ): Promise<AiSearchResult> {
    // 맨 처음에 잡는다 — 즉답으로 끝나는 경로(preReject)도 걸린 시간을 남겨야 한다.
    const startedAt = Date.now();
    const lang = caller.lang ?? FALLBACK_LANG;

    /*
      **누구 몫인지 먼저 정한다.** 아래 세 갈래가 전부 이 값을 쓴다 —
      사전 차단만 깎지 않고 읽기만 하고(peek), 캐시 히트도 실제 호출도 받아 간다.

      통 개수가 갈리는 이유:
        app   우리 예산이다. 월 한도가 진짜 예산이고, 일 한도는 그게 첫날에 다 타 버리지
              않게 하는 둑이라 **둘을 겹쳐 건다.** 먼저 차는 쪽이 막는다.
        user  사용자가 충전해 자기 것을 쓰는 자리다. 언제 얼마나 쓸지는 그 사람이 정할
              일이라 **나눌 이유가 없다** — 잔액 하나뿐이고 리셋도 없다.
    */
    const targets = this.quotaTargets(caller);
    /** 아무 답도 안 준 경로(사전 차단)에서 현재 사용량만 읽어 붙인다. */
    /** 아무 답도 안 준 경로(사전 차단)에서 현재 사용량만 읽어 붙인다. */
    const peekQuota = async () => (await this.readQuota(targets)).quota;

    /*
      **들어온 문자열은 여기서 한 번만 다듬는다.** 아래로는 이 값만 흐르므로 발송·해시·
      로그 어디서도 원문을 다시 만지지 않는다 — 세 군데가 각자 다듬던 시절에는 "무엇이
      정본인가" 가 흐렸고, 실제로 해시한 문자열과 발송한 문자열이 어긋나 있었다.
    */
    const cleaned = cleanQuestion(rawQuestion);
    /*
      **말머리를 먼저 떼어낸다.** 설정이 꺼져 있어도 떼는 것은 같다 — `/test` 는 명령이지
      질문의 일부가 아니라서, 붙은 채로 두면 모델이 읽는 문장도 캐시 키도 달라진다.
      달라지는 건 **모드로 들어가느냐** 뿐이다.
    */
    const asked = cleaned.endsWith(TEST_COMMAND);
    const question = asked
      ? cleaned.slice(0, -TEST_COMMAND.length).trim()
      : cleaned;
    const answerMode = asked && this.llmConfig.allowTestCommand;

    /*
      **부를 필요가 없는 질문은 여기서 끝낸다.** 캐시·쿼터보다도 앞이다 —
      캐시에 담을 것도 없고(즉답이다), 하루 몫을 깎을 이유도 없다(호출이 없다).
    */
    if (preReject(question)) {
      this.logger.log(
        `${tag(caller.requestId)}${PROMPT_NAME} pre-rejected (${Date.now() - startedAt}ms)`,
      );
      return this.publish(lang, {
        tool: 'reject',
        // explain 은 비워 둔다 — 화면이 자기 문구를 쓴다(백엔드가 한국어를 쓰지 않는다).
        params: { filter: emptyFilter(), reason: 'too_vague' },
        warnings: ['too_vague'],
        explain: '',
        dropped: [],
        provider: this.llmConfig.defaultProvider,
        // 부른 적이 없으니 답한 모델도 없다.
        model: '',
        // 외부 호출이 없었다. 쓴 것도 없다.
        credits: 0,
        elapsedMs: Date.now() - startedAt,
        quota: await peekQuota(),
        debug: { cached: false, usage: { inputTokens: 0, outputTokens: 0 } },
      });
    }

    const prompt = this.prompts.get(PROMPT_NAME);
    // 답변 모드일 때만 읽는다. 안 쓰는 파일을 매번 여는 이유가 없다.
    const block = answerMode ? this.prompts.getBlock(ANSWER_BLOCK) : undefined;

    /*
      **같은 질문이면 부르지 않는다.** 업체의 프롬프트 캐시는 요금을 1/10 로 줄여 주지만
      지연은 그대로다(8천 토큰을 매번 읽는다 — 실측 5.6초). 사용자가 체감하는 건 그쪽이라,
      응답 자체를 담아 두면 두 번째부터는 수십 ms 다.

      **모든 사용자가 나눠 쓴다.** "천식 소아과" 는 누가 물어도 같은 조건이 나오므로,
      한 명이 물으면 나머지는 호출 없이 받는다.
    */
    /*
      **들어온 이전 조건도 모델 출력과 똑같이 거른다.** 우리가 내려준 값이라는 보장이
      없어서다 — curl 로 아무 코드나 넣어 보낼 수 있고, 그러면 코드표에 없는 값이 프롬프트로
      들어가 모델이 그것을 따라 하게 된다. 떨어진 것은 조용히 버린다(사용자 잘못이 아니다).
    */
    const previous = sanitizeContext(caller.context, (raw, tp) =>
      this.pickCodes(raw, tp, []),
    );

    const questionHash = questionHashOf(question);
    /*
      **모드를 키에 섞는다.** 안 섞으면 답변 모드로 받은 답이 같은 칸에 담겨,
      `/test` 없이 물은 사람에게 유료로 팔 답변이 공짜로 나간다.
    */
    /*
      **이전 조건도 키에 섞는다.** 같은 말이라도 앞 상태가 다르면 답이 달라야 한다 —
      "천안에서" 는 정형외과를 찾던 중인지 소아과를 찾던 중인지에 따라 전혀 다른 조건이 된다.
      안 섞으면 먼저 물은 사람의 상태가 뒤에 온 사람에게 그대로 새어 나간다.
    */
    const key = this.cacheKey(
      questionHash,
      block ? `${prompt.hash}+${block.hash}` : prompt.hash,
      // 조건과 대화가 둘 다 앞 맥락이다. 하나만 섞으면 나머지가 다른 답을 같은 칸에 넣는다.
      [
        carriedParams(previous),
        renderHistory(this.verifyHistory(caller.history)),
      ]
        .filter(Boolean)
        .join('|') || undefined,
    );
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
      /*
        **캐시 히트도 똑같이 받는다.** 담긴 credits 를 그대로 물린다.

        공짜로 주면 **처음 물은 사람만 내고 뒤에 온 사람은 안 내는** 구조가 된다 —
        첫 질문자가 나머지를 보조하는 꼴이라 불공평하고, 같은 질문이 언제 묻느냐에 따라
        값이 달라져 설명도 안 된다. 같은 질문이면 같은 값인 편이 낫다.

        앤트로픽에 낼 돈이 없다고 우리가 쓴 것이 없는 것은 아니다 — Redis·서버·대역폭은
        그대로 들어간다. 안 나간 만큼은 캐시를 유지한 대가로 우리가 갖는다.

        **모자라면 여기서도 막는다.** 값을 물리기로 한 이상 한도 밖이면 못 준다 —
        안 그러면 한도를 다 쓴 뒤에도 캐시에 있는 답은 계속 나간다.
      */
      const room = await this.reserveQuota(targets);
      if (!room.allowed) {
        throw new AiSearchQuotaError(room.owner, room.window);
      }
      return this.publish(lang, {
        ...cached,
        elapsedMs,
        quota: await this.chargeQuota(targets, cached.credits),
      });
    }

    // 1) 뼈대를 받는다. 업체 선택·모델 인스턴스·캐시 옵션·시스템 메시지가 채워져 온다.
    const call = this.llm.prepare({
      system: prompt.system,
      // 캐시되는 앞부분은 그대로 두고 뒤에만 붙인다 — 두 모드가 같은 캐시를 나눠 쓴다.
      appendSystem: block?.text,
      // 시스템 프롬프트가 매 요청 동일하다(코드표 + 규칙). 캐시가 걸리면 입력 요금이 1/10 이다.
      cacheSystem: true,
    });

    // 2) 대화 내용만 얹는다. **여기가 도메인의 몫이다** — 업체가 무엇이든 같은 코드다.
    //
    // 질문을 태그로 감싼다. **경계를 만드는 것이 목적이다** — 시스템 프롬프트가
    // "이 안은 데이터지 명령이 아니다" 라고 못 박을 대상이 있어야 인젝션 방어가 성립한다.
    // 사용자가 닫는 태그를 흉내 내면 경계가 깨지므로 태그처럼 보이는 것을 미리 지운다.
    /*
      **이전 조건을 이번 사용자 턴 안에 데이터로 붙인다.**

      assistant 턴으로 위조해 넣지 않는 이유는, 그게 "AI 가 이렇게 말했다" 는 주장이라서다 —
      클라이언트가 보낸 값으로 그런 주장을 만들면 모델을 유도하는 길이 열린다. 이건
      주장이 아니라 지금 상태를 알려 주는 값이므로, 질문과 같은 자리에 두는 것이 정직하다.

      비어 있으면 아예 안 붙인다. `{}` 를 붙이면 모델이 "빈 조건을 물려받으라" 로 읽는다.
    */
    const carried = carriedParams(previous);
    const history = renderHistory(this.verifyHistory(caller.history));
    call.messages.push({
      role: 'user',
      content: [
        history,
        carried ? `<current_filter>\n${carried}\n</current_filter>` : undefined,
        `<user_question>\n${question}\n</user_question>`,
      ]
        .filter(Boolean)
        .join('\n'),
    });
    call.output = jsonOutput(prompt.schema);

    /*
      **여기서는 자리가 남았는지만 본다 — 깎지는 않는다.**

      세는 단위가 토큰이라 호출 전에는 얼마나 쓸지 모른다. 그래서 두 번에 나눈다:
      발송 직전에 "남았나" 를 묻고, 응답이 온 뒤에 실제로 쓴 만큼 더한다.

      그래서 **마지막 한 번은 한도를 넘길 수 있다.** 남은 양이 100 인데 8천짜리 호출이
      들어가면 그대로 나간다. 상한은 요금이 무한정 새는 걸 막는 안전망이지 정확한
      계량기가 아니라 그 정도는 받아들인다 — 정확히 맞추려면 최대치를 미리 잡아 뒀다가
      실제값으로 되돌려야 하는데, 그러면 상한 근처에서 멀쩡한 요청이 자꾸 거절된다.

      확인이 앞뒤로 밀리면 둘 다 틀린다:
        너무 앞(prepare 전)  설정이 틀려 prepare 가 터지는 배포에서도 "오늘은 안 됨" 으로
                             보이기 시작한다 — 나간 게 없는데 막힌 것이다.
        너무 뒤(chat 후)     이미 나간 호출을 두고 묻는 꼴이라 막을 것이 없다.

      **캐시 히트는 위에서 이미 받아 갔다.** 거기는 쓸 양을 알고 있어서(담긴 credits)
      확인과 차감을 한 번에 한다 — 여기처럼 두 박자로 나눌 이유가 없다.
    */
    const room = await this.reserveQuota(targets);
    if (!room.allowed) {
      throw new AiSearchQuotaError(room.owner, room.window);
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

    /*
      **쓴 만큼 더한다.** 캐시로 읽힌 토큰도 그대로 센다 — 사용자가 보는 숫자는 우리
      원가가 아니라 "이 질문이 얼마나 큰 일이었나" 여야 하고, 캐시가 먹었는지 아닌지는
      우리 쪽 사정이라 같은 질문이 날마다 다른 값으로 세어지면 설명할 수가 없다.
      (원가 분석은 llm_usage 에 항목별로 다 남으니 그쪽에서 한다.)
    */
    const credits = creditsOf(usage);
    const quota = await this.chargeQuota(targets, credits);

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
      answerMode,
      rawAnswer: raw.answer,
      offTopic,
      filter,
      placeText,
      useMyLocation,
      warnings,
    });

    const result: Omit<AiSearchResult, 'conditions'> = {
      tool,
      params,
      warnings,
      explain: sanitizeExplain(raw.explain),
      dropped,
      provider,
      model,
      credits,
      elapsedMs: Date.now() - startedAt,
      quota,
      debug: { cached: false, usage },
    };

    /*
      **떨어뜨린 코드가 있으면 담지 않는다.** dropped 는 프롬프트와 코드표가 어긋났다는
      신호라, 그 상태의 답을 하루 동안 돌려주면 고친 뒤에도 옛 결함이 계속 나온다.
      (프롬프트를 고치면 해시가 갈려 자동으로 무효화되지만, 코드표만 고친 경우는 안 갈린다)
    */
    if (dropped.length === 0) {
      await this.trySet(key, result);
    }
    /*
      **캐시에는 원시값째 담고, 내보낼 때만 뺀다.** 서버 안쪽에서는 그 값이 계속 쓰인다 —
      캐시 히트도 `llm_usage` 에 "어느 모델의 답이 재사용됐나" 를 남겨야 하는데, 담을 때
      빼 버리면 그 기록에서 모델이 사라진다. 나가면 안 되는 것은 응답이지 캐시가 아니다.
    */
    return this.publish(lang, result);
  }

  /**
   * 답변 서명. 키가 없거나 답이 없으면 안 붙인다.
   *
   * **HMAC 은 결정적이다** — 같은 답에 같은 서명이 나온다. 그게 정상이고, (메시지, 서명)
   * 쌍을 아무리 모아도 키는 안 나온다. 무작위를 섞을 이유가 없다.
   */
  private signAnswer(answer: string | undefined): string | undefined {
    const key = this.llmConfig.answerSigningKey;
    if (!key || !answer) {
      return undefined;
    }
    return createHmac('sha256', key).update(answer).digest('base64url');
  }

  /**
   * 돌려받은 대화에서 **우리가 쓰지 않은 답을 걷어낸다.** 질문은 남긴다 —
   * 사용자가 자기 말을 다시 보내는 것은 위조가 아니다.
   *
   * 키가 없는 배포에서는 답이 통째로 빠진다. 조용히 통과시키면 설정을 빼먹은 배포가
   * 곧 방어가 꺼진 배포가 된다.
   */
  private verifyHistory(
    history: AiSearchHistoryTurn[] | undefined,
  ): AiSearchHistoryTurn[] | undefined {
    if (!history?.length) {
      return undefined;
    }
    return history.map((turn) => {
      if (!turn.answer) {
        return turn;
      }
      const expected = this.signAnswer(turn.answer);
      return expected &&
        turn.signature &&
        equalSignature(expected, turn.signature)
        ? turn
        : { question: turn.question };
    });
  }

  /**
   * 응답으로 내보낼 형태.
   *
   * 세 가지를 여기서 한다 — **조건 이름을 붙이고**(언어마다 다르므로 캐시가 아니라 여기서),
   * **답에 서명을 붙이고**, 설정이 꺼져 있으면 **원시 토큰 내역을 뗀다**(모델 이름은 남긴다).
   */
  private publish(
    lang: SupportedLang,
    result: Omit<AiSearchResult, 'conditions'>,
  ): AiSearchResult {
    /*
      **서명은 여기서 붙인다.** 캐시에서 나온 답도 같은 문을 지나므로 한 곳이면 된다 —
      담아 두면 키를 갈았을 때 옛 서명이 하루 동안 살아 있게 된다.
    */
    const withNames: AiSearchResult = {
      ...result,
      conditions: this.conditionsOf(result.params.filter, lang),
      answerSignature: this.signAnswer(result.params.answer),
    };
    if (this.llmConfig.exposeDebugUsage) {
      return withNames;
    }
    // 키를 통째로 없앤다 — undefined 로 두면 직렬화에서 빠지긴 하지만, 남겨 둘 이유가 없다.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { debug, ...rest } = withNames;
    return rest;
  }

  /**
   * 코드 → 이름. **모르는 코드는 조용히 뺀다** — 검증(pickCodes)을 통과한 코드만 들어오므로
   * 여기서 못 찾는다면 코드표가 그새 바뀐 것이고, 그 한 줄 때문에 답 전체를 버릴 이유는 없다.
   * 비는 묶음도 뺀다(화면이 "진료과:" 만 그리는 일이 없게).
   */
  private conditionsOf(
    filter: AiSearchFilter,
    lang: SupportedLang,
  ): AiSearchCondition[] {
    const byCode = (tp: string, cds: string[]): string[] =>
      cds.map((cd) => this.codes.name(tp, cd, lang)).filter(isNonEmpty);

    const groups: AiSearchCondition[] = [
      { group: 'subject', names: byCode('subject', filter.subjectCds) },
      // 전문의도 진료과 코드표를 쓴다(같은 표, 다른 뜻 — "그 과 전문의가 있나").
      { group: 'specialist', names: byCode('subject', filter.specialistCds) },
      {
        group: 'assessment',
        names: filter.asmItemCds
          .map((cd) => this.asmCodes.get(cd))
          .filter(isDefined)
          .map((item) => pickName(item.name, lang)),
      },
      { group: 'specialty', names: byCode('specialty', filter.specialtyCds) },
      { group: 'equipment', names: byCode('equipment', filter.equipmentCds) },
      { group: 'class', names: byCode('class', filter.classCds) },
    ];
    return groups.filter((g) => g.names.length > 0);
  }

  /** 캐시 조회(best-effort). Redis 가 죽어도 AI 호출로 살아난다. */
  private async tryGet(
    key: string,
  ): Promise<Omit<AiSearchResult, 'conditions'> | undefined> {
    try {
      const hit = await this.cache.get<Omit<AiSearchResult, 'conditions'>>(key);
      /*
        캐시에서 온 것임을 표시해 둔다 — `debug.usage` 는 이 요청이 쓴 값이 아니라 처음
        물었을 때 쓴 값이라, 구분이 없으면 원시 토큰을 합산하는 쪽이 실제보다 크게 센다.
        credits·elapsedMs 는 부르는 쪽이 이번 요청 기준으로 다시 채운다.

        debug 가 없는 항목은 이 필드가 생기기 전에 담긴 것이다. 하루면 다 빠지므로
        표시만 못 할 뿐 답 자체는 그대로 쓴다.
      */
      if (!hit) {
        return undefined;
      }
      return hit.debug
        ? { ...hit, debug: { ...hit.debug, cached: true } }
        : hit;
    } catch {
      return undefined;
    }
  }

  /** 캐시 저장(best-effort). 실패해도 응답은 이미 만들어졌다. */
  private async trySet(
    key: string,
    value: Omit<AiSearchResult, 'conditions'>,
  ): Promise<void> {
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
 * **부르지 않고 끝낼 수 있는 질문인가.** 걸리면 LLM 을 아예 안 탄다(요금 0, 즉답).
 *
 * 여기 넣을 자격은 하나다 — **틀릴 일이 거의 없어야 한다.** 애매한 것을 걸러내는 건
 * 모델이 할 일이고(그래서 `too_vague` 가 있다), 여기는 "이건 질문이 아니다" 가 명백한
 * 것만 잡는다. 정상 질문을 하나라도 막으면 아낀 요금보다 잃는 게 크다.
 *
 * 걸린 것은 조용히 `too_vague` 로 돌려준다 — 400 을 주면 사용자는 자기가 뭘 잘못했는지
 * 모른 채 오류 화면을 보게 되는데, 그냥 "이렇게 물어봐 주세요" 가 맞는 답이다.
 */
function preReject(question: string): boolean {
  // 자모만. "ㅇㅇ" "ㅋㅋㅋ" "ㅎㅇ" — 완성된 글자가 하나도 없다.
  if (/^[\u3131-\u318E\s]+$/.test(question)) return true;

  // 숫자·구분자만. 전화번호를 그대로 붙여 넣는 경우가 여기 걸린다("010-1234-5678").
  if (/^[\d\s.,\-+()]+$/.test(question)) return true;

  // 글자도 숫자도 하나 없음. "!!!" "..." "???" 이모지만.
  if (/^[^\p{L}\p{N}]+$/u.test(question)) return true;

  // 같은 글자만 반복. "ㅋㅋㅋㅋ" 는 위에서 잡히지만 "aaaa" "ㅁㅁㅁ" 는 여기다.
  // **전체가 한 글자일 때만** 이다 — "아파요ㅠㅠㅠ" 처럼 뒤에 붙는 건 정상 질문이다.
  if (/^(.)\1+$/u.test(question)) return true;

  // 링크만. 우리는 URL 로 병원을 찾지 않는다.
  if (/^(https?:\/\/|www\.)\S+$/i.test(question)) return true;

  // 다듬고 나니 글자가 한 자뿐. DTO 의 MinLength 는 다듬기 전 길이를 본다.
  if (question.replace(/[^\p{L}\p{N}]/gu, '').length < 2) return true;

  return false;
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
/**
 * 답변 본문을 다듬는다. **explain 과 같은 규칙에 길이만 다르다.**
 *
 * URL·연락처를 지우는 이유가 여기서 더 무겁다 — explain 은 조건 설명이라 링크가 낄 일이
 * 애초에 없지만, 답변은 모델이 "자세한 건 여기서" 를 붙이고 싶어 하는 자리다. 그게 나가면
 * 우리가 검증하지 않은 곳으로 사람을 보내는 것이 된다.
 *
 * 비면 undefined 다 — 부르는 쪽이 그걸 보고 거절로 떨어뜨린다.
 */
function sanitizeAnswer(raw: unknown, max: number): string | undefined {
  const text = nonEmpty(raw);
  if (!text) {
    return undefined;
  }
  const clean = text
    .replace(EXPLAIN_FORBIDDEN, '')
    // 줄바꿈만 남기고 나머지 제어문자를 지운다. CONTROL_CHARS 를 그대로 쓰면 \n 까지
    // 먹어서(그 범위 안이다) 문단이 사라진다 — 답변은 문단이 뜻인 자리라 다르게 다룬다.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]+/g, ' ')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
  return clean || undefined;
}

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

/**
 * 출력 토큰 가중치. **Anthropic 은 어느 모델이든 출력이 입력의 5배다** — Haiku($1/$5),
 * Sonnet($3/$15), Opus 가 모두 같은 비율이라 모델과 무관하게 하나로 둔다.
 */
const OUTPUT_WEIGHT = 5;

/**
 * 원시 사용량을 **사용자에게 청구할 통합 토큰**으로 접는다.
 *
 * **캐시 적중을 값에 반영하지 않는다.** 캐시가 살아 있으면 우리 원가는 1/10 이지만,
 * 그건 우리 인프라 사정이다 — 같은 질문이 캐시 상태에 따라 7배씩 다르게 깎이면
 * 사용자에게 설명할 수가 없다. 아낀 만큼은 우리 마진으로 둔다.
 *
 * 반대로 **모델 단가는 반영해야 한다**(아직 하나뿐이라 배수가 없다). 단가표가 붙으면
 * 여기에 모델 배수가 곱해진다 — 그 표는 별도 작업이라 지금은 기준 모델 1 로 둔다.
 */
function creditsOf(usage: AiSearchUsage): number {
  return Math.round(usage.inputTokens + usage.outputTokens * OUTPUT_WEIGHT);
}

/** 값이 있고 빈 문자열이 아닌가. 코드표에서 못 찾은 이름을 걸러 내는 데 쓴다. */
function isNonEmpty(value: string | undefined): value is string {
  return !!value;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

/**
 * 계수기가 준 통 상태를 **이름 있는 필드로** 옮긴다. 계수기 안쪽은 통을 배열로 다루는
 * 편이 낫지만(개수가 신원마다 다르다) 밖으로 나가는 계약은 이름이 있어야 한다.
 *
 * 하나도 못 읽었으면 undefined 다 — 화면이 아무것도 안 그리게 한다
 * (0/0 은 다 쓴 것처럼 보인다).
 */
function toQuota(
  read: { owner: QuotaOwner; states: QuotaState[] }[],
): AiSearchQuota | undefined {
  const at = (
    states: QuotaState[],
    window: QuotaWindow,
  ): AiSearchQuotaWindow | undefined => {
    const state = states.find((s) => s.window === window);
    return state ? { used: state.used, limit: state.limit } : undefined;
  };

  const quota: { app?: AiSearchAppQuota; user?: AiSearchUserQuota } = {};
  for (const { owner, states } of read) {
    if (states.length === 0) {
      continue;
    }
    if (owner === 'app') {
      quota.app = { daily: at(states, 'day'), monthly: at(states, 'month') };
    } else {
      quota.user = { balance: at(states, 'balance') };
    }
  }
  return quota.app || quota.user ? quota : undefined;
}

/**
 * 이전 조건을 **믿을 수 있는 것만 남긴다.**
 *
 * 응답과 같은 모양으로 받되(화면이 받은 것을 그대로 돌려줄 수 있게), 쓸 때는 골라 쓴다:
 *
 *   filter      코드 배열. 코드표로 다시 거른다 — 사용자가 보낸 값이다
 *   regionCd    이미 코드다. 코드표에 없으면 지역 해석에서 어차피 안 걸린다
 *   placeText   못 푼 장소 이름. 사용자가 원래 친 말이라 그대로 이어 갈 값이다
 *   reason      안 쓴다. 우리가 붙인 분류일 뿐 조건이 아니다
 *   answer      **절대 안 쓴다.** 모델이 쓴 자유 문장이라, 돌려받아 프롬프트에 넣으면
 *               클라이언트가 아무 문장이나 "이전 답변" 으로 심을 수 있다
 */
function sanitizeContext(
  context: AiSearchParams | undefined,
  pick: (raw: unknown, tp: string) => string[],
): AiSearchParams | undefined {
  if (!context?.filter) {
    return undefined;
  }
  const raw = context.filter;
  const filter: AiSearchFilter = {
    subjectCds: pick(raw.subjectCds, 'subject'),
    specialistCds: pick(raw.specialistCds, 'subject'),
    // 적정성평가는 표가 따로다. 이어 가는 값으로는 드물어 여기서는 버린다.
    asmItemCds: [],
    specialtyCds: pick(raw.specialtyCds, 'specialty'),
    equipmentCds: pick(raw.equipmentCds, 'equipment'),
    classCds: pick(raw.classCds, 'class'),
    tiers: toStringArray(raw.tiers).filter((t) => VALID_TIERS.has(t)),
    emergency: raw.emergency === true,
    baby: raw.baby === true,
    name: nonEmpty(raw.name),
  };
  return {
    filter,
    regionCd: nonEmpty(context.regionCd),
    placeText: nonEmpty(context.placeText),
  };
}

/**
 * 이어 갈 조건을 프롬프트에 실을 JSON 으로. **비어 있으면 undefined 다** —
 * 빈 조건을 실으면 모델이 "아무것도 없는 상태를 물려받으라" 로 읽어, 새 질문에서도
 * 괜히 앞을 의식한다.
 */
function carriedParams(params: AiSearchParams | undefined): string | undefined {
  if (!params) {
    return undefined;
  }
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params.filter)) {
    if (Array.isArray(value) ? value.length > 0 : Boolean(value)) {
      body[key] = value;
    }
  }
  if (params.regionCd) body.regionCd = params.regionCd;
  if (params.placeText) body.placeText = params.placeText;

  return Object.keys(body).length > 0 ? JSON.stringify(body) : undefined;
}

/** sha256 앞부분. 캐시 키에 상태를 섞는 데 쓴다. */
function sha(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** 대화를 몇 마디까지 물릴지. 오래된 맥락은 거의 안 쓰이는데 토큰은 그대로 든다. */
const MAX_HISTORY_TURNS = 3;

/** 한 마디의 길이 상한. 답변은 문단이라 질문보다 넉넉히 준다. */
const MAX_HISTORY_QUESTION = 300;
const MAX_HISTORY_ANSWER = 800;

/**
 * 앞선 대화를 프롬프트에 실을 블록으로. 없으면 undefined 다.
 *
 * **꺾쇠를 지우고 길이를 자른다.** 사용자가 보낸 값이라 `</history>` 를 흉내 내 경계를
 * 끊으려 들 수 있고(질문에 하는 것과 같은 처리다), 길이를 안 자르면 요금이 클라이언트
 * 손에 넘어간다 — 대화 한 마디에 10만 자를 실어 보내면 그대로 토큰이 된다.
 *
 * **최근 것만 남긴다.** 뒤에서부터 세되 순서는 시간순으로 되돌린다.
 */
function renderHistory(
  turns: AiSearchHistoryTurn[] | undefined,
): string | undefined {
  if (!turns?.length) {
    return undefined;
  }
  const lines = turns
    .slice(-MAX_HISTORY_TURNS)
    .map((turn) => {
      const question = clip(turn.question, MAX_HISTORY_QUESTION);
      if (!question) {
        return undefined;
      }
      const answer = clip(turn.answer, MAX_HISTORY_ANSWER);
      return answer ? `Q: ${question}\nA: ${answer}` : `Q: ${question}`;
    })
    .filter(Boolean);

  return lines.length > 0
    ? `<history>\n${lines.join('\n')}\n</history>`
    : undefined;
}

/** 태그 흉내를 지우고 길이를 자른다. 빈 값이면 undefined. */
function clip(raw: unknown, max: number): string | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }
  const text = raw
    .normalize('NFKC')
    .replace(/[<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
  return text || undefined;
}

/** 서명 비교. **길이가 달라도 던지지 않는다** — 위조된 값이 예외로 요청을 깨면 안 된다. */
function equalSignature(expected: string, given: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  // 길이가 다르면 볼 것도 없다. 같을 때만 시간 일정 비교로 넘긴다.
  return a.length === b.length && timingSafeEqual(a, b);
}
