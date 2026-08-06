import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { QuotaDto } from '../../ai/dto/quota.dto';
import type {
  AiSearchFilter,
  AiSearchParams,
  AiSearchCondition,
  AiSearchConditionGroup,
  AiSearchDebug,
  AiSearchHistoryTurn,
  AiSearchResult,
  AiSearchWarning,
  AiSearchTool,
  LlmProviderName,
  AiSearchUsage,
} from '@hansapp/application';

/** 화면이 실행할 일. 닫힌 집합이라 모르는 이름은 오지 않는다. */
const TOOLS = [
  'search_hospitals',
  'search_nearby',
  'ask_location',
  'answer_medical',
  'reject',
] as const;

/** 질문 길이 상한. 이 API 는 검색어를 받는 자리라 문단이 들어올 이유가 없다. */
export const MAX_QUESTION_LENGTH = 300;

/** 고를 수 있는 프로바이더. 설정에 없는 걸 고르면 호출 시점에 실패한다. */
const PROVIDERS = ['anthropic', 'openai', 'local'] as const;

export class AiSearchRequestDto {
  @ApiProperty({
    description: '자연어 질문',
    example: '천식치료 소아과 병원 추천해줘',
    maxLength: MAX_QUESTION_LENGTH,
  })
  /*
    **검증 전에 다듬는다.** @Transform 은 plainToInstance 단계라 아래 검증자보다 먼저 돈다 —
    순서가 반대면 공백만 든 `"  "` 가 MinLength(2) 를 통과해 빈 질문이 LLM 으로 나간다
    (토큰과 하루 몫을 쓰고 아무 답도 못 얻는다).

    브라우저는 보내기 전에 이미 trim 하지만 curl 은 안 한다. 경계에서 막는 게 맞다.
  */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(MAX_QUESTION_LENGTH)
  readonly q!: string;

  @ApiPropertyOptional({
    type: () => AiSearchParamsDto,
    description:
      '**직전 응답의 `params` 를 그대로 돌려보낸다.** 대화를 잇는 유일한 수단이다.\n\n' +
      '서버는 대화를 기억하지 않는다(요청 하나가 자족적이다). 대신 조건이 이미 코드로 ' +
      '정규화돼 있어서 이 한 덩어리면 "지금까지 뭘 찾고 있었나" 가 복원된다 — ' +
      '전체 대화를 물고 다니는 것보다 싸고, 상태가 같으면 캐시도 그대로 맞는다.\n\n' +
      '**모양이 응답과 같은 것은 일부러다** — 받은 것을 그대로 돌려주면 되고 새 규격을 ' +
      '익힐 필요가 없다. 새 주제를 시작하려면 빼고 보내면 된다.\n\n' +
      '`answer`·`reason` 은 보내도 무시한다(자유 문장이라 되먹이지 않는다). ' +
      '`filter` 의 코드도 코드표로 다시 거른다.',
  })
  /*
    **모양을 여기서 파고들지 않는다.** 안쪽 값의 뜻은 코드표를 아는 응용 계층만 판별할 수
    있고(존재하는 진료과 코드인가), 그쪽은 모델 출력에도 같은 검증을 이미 돌린다.
    여기서 데코레이터를 겹겹이 다는 것은 그 검증을 흉내만 내는 셈이다.
  */
  @IsOptional()
  @IsObject()
  readonly context?: AiSearchParams;

  @ApiPropertyOptional({
    description:
      '앞서 오간 말. `[{ question, answer?, signature? }]`.\n\n' +
      '`context` 와 **주인이 다르다** — 그쪽은 서버가 발급한 상태고 이쪽은 화면이 들고 있는 ' +
      '대화 원문이다. 조건만으로는 "아까 말한 증상", "그럼 약은?" 처럼 앞을 가리키는 말을 ' +
      '풀 수 없어서 따로 받는다.\n\n' +
      '**`answer` 에는 응답의 `answerSignature` 를 `signature` 로 같이 실어야 한다.** ' +
      '없거나 안 맞으면 그 턴의 `answer` 만 버리고 `question` 은 그대로 쓴다 — 답은 ' +
      '"우리가 이렇게 답했다" 는 주장이라 아무 문장이나 심으면 모델을 유도할 수 있다. ' +
      '자기가 한 말(`question`)을 다시 보내는 것은 위조가 아니라 검사하지 않는다.\n\n' +
      '**최근 3마디만 쓴다.** 더 보내도 앞쪽부터 버린다. 한 마디의 길이도 자른다 ' +
      '(질문 300자, 답 800자) — 안 자르면 요금이 부르는 쪽 손에 넘어간다.',
    example: [
      {
        q: '무릎이 왜 아픈 거야?',
        a: '무릎이 아픈 원인은…',
        signature: 'X1c…',
      },
    ],
  })
  /*
    안쪽 모양을 데코레이터로 파고들지 않는다. 문자열 두 개짜리라 검증할 뜻이 별로 없고,
    길이·태그 흉내 자르기는 어차피 응용 계층이 한다(질문에 하는 처리와 같은 곳이다).
  */
  @IsOptional()
  @IsArray()
  readonly history?: AiSearchHistoryTurn[];
}

class AiSearchFilterDto implements AiSearchFilter {
  @ApiProperty({ type: [String], description: '진료과목 코드(신고 기준)' })
  readonly subjectCds!: string[];

  @ApiProperty({
    type: [String],
    description: '그 과목 전문의를 실제로 보유한 병원만 거는 진료과목 코드',
  })
  readonly specialistCds!: string[];

  @ApiProperty({
    type: [String],
    description: '적정성평가 항목 코드. 그 항목 1등급(우수) 병원만 걸린다.',
  })
  readonly asmItemCds!: string[];

  @ApiProperty({ type: [String], description: '전문병원 지정분야 코드' })
  readonly specialtyCds!: string[];

  @ApiProperty({ type: [String], description: '보유장비 코드' })
  readonly equipmentCds!: string[];

  @ApiProperty({ type: [String], description: '종별 코드' })
  readonly classCds!: string[];

  @ApiProperty({
    type: [String],
    description: '병원 등급. 비면 요양병원·정신병원이 제외된다.',
  })
  readonly tiers!: string[];

  @ApiProperty({ description: '응급실 운영 병원만' })
  readonly emergency!: boolean;

  @ApiProperty({ description: '달빛어린이병원만' })
  readonly baby!: boolean;

  @ApiPropertyOptional({ description: '병원 이름(부분 일치)' })
  readonly name?: string;
}

class AiSearchUsageDto implements AiSearchUsage {
  @ApiProperty() readonly inputTokens!: number;
  @ApiProperty() readonly outputTokens!: number;
  @ApiPropertyOptional({ description: '캐시에서 읽은 입력 토큰(Claude 만)' })
  readonly cacheReadTokens?: number;
  @ApiPropertyOptional({ description: '캐시에 쓴 입력 토큰(Claude 만)' })
  readonly cacheWriteTokens?: number;
}

/** 잡힌 조건 한 묶음. **코드가 아니라 이름이다.** */
class AiSearchConditionDto implements AiSearchCondition {
  @ApiProperty({
    enum: [
      'subject',
      'specialist',
      'assessment',
      'specialty',
      'equipment',
      'class',
    ],
    description:
      '묶음 이름. 화면이 이 값으로 "진료과"/"장비" 같은 앞말을 고른다.',
  })
  readonly group!: AiSearchConditionGroup;

  @ApiProperty({
    type: [String],
    description: '사람이 읽는 이름들. **요청 언어**(Accept-Language)로 온다.',
    example: ['내과', '가정의학과'],
  })
  readonly names!: string[];
}

/** 확인용 원시값. **사용자에게 보일 것이 아니다.** */
class AiSearchDebugDto implements AiSearchDebug {
  @ApiProperty({
    description:
      '우리 Redis 캐시에서 나온 답인가. 계속 false 면 캐시 키가 매번 갈리고 있다는 뜻이다. ' +
      '**true 면 아래 `usage` 는 처음 물었을 때 쓴 양이다**(이 요청은 LLM 을 안 불렀다). ' +
      '`credits` 는 히트든 아니든 같다 — 값은 우리 원가가 아니라 질문 하나의 값이다.',
  })
  readonly cached!: boolean;

  @ApiProperty({ type: AiSearchUsageDto })
  readonly usage!: AiSearchUsageDto;
}

class AiSearchParamsDto implements AiSearchParams {
  @ApiProperty({ type: AiSearchFilterDto })
  readonly filter!: AiSearchFilterDto;

  @ApiPropertyOptional({
    description:
      '시군구 코드(없으면 시도 코드). 검색의 `region` 파라미터다. ' +
      '**`search_hospitals` 에서만 채워진다.**',
    example: '41450',
  })
  readonly regionCd?: string;

  @ApiPropertyOptional({
    description:
      '사용자가 쓴 지역 표현 원문(예: "강남역"). **코드가 아니다** — ' +
      '`ask_location` 이 되물을 때 화면에 그대로 보여준다.',
  })
  readonly placeText?: string;

  @ApiPropertyOptional({
    description:
      '`reject` 사유. `off_topic`(범위 밖) 또는 `too_vague`(조건 못 잡음).',
  })
  readonly reason?: AiSearchWarning;
}

/**
 * AI 검색 응답. **병원 목록이 아니라 "무엇을 할지" 다.**
 *
 * 화면은 `tool` 로 갈리고 `params` 를 그대로 실어 기존 API 를 부른다 —
 * 조건 조합을 화면이 추론하지 않는다(그러다 "조건은 비었는데 할 일은 있는" 경우를 놓쳤다).
 *
 * ```
 *   search_hospitals  params.filter (+regionCd) 로 GET /healthcare/hospitals
 *   search_nearby     측위한 뒤 같은 조회에 sort=distance·origin 을 얹는다
 *   ask_location      지역을 되묻는다. params.filter 는 들고 있다가 나중에 쓴다
 *   reject            검색하지 않는다. explain 을 보여준다
 * ```
 *
 * 툴이 늘어도 모르는 이름은 화면이 조용히 넘기면 되므로 옛 클라이언트가 안 깨진다.
 */
export class AiSearchResponseDto {
  @ApiProperty({
    enum: TOOLS,
    description:
      '화면이 실행할 일.\n' +
      '- `search_hospitals` 조건(+지역)으로 조회\n' +
      '- `search_nearby` 현재 위치 기준 거리순 조회(측위는 화면 몫)\n' +
      '- `ask_location` 지역을 되물어야 함(장소를 말했는데 코드로 못 옮김)\n' +
      '- `reject` 검색하지 않음',
  })
  readonly tool!: AiSearchTool;

  @ApiProperty({ type: AiSearchParamsDto })
  readonly params!: AiSearchParamsDto;

  @ApiProperty({
    type: [String],
    description:
      '화면이 배너로 띄울 신호.\n' +
      '- `medical_question` 건강 질문이라 지금은 답하지 않는다(가입·충전 안내로 잇는다)\n' +
      '- `emergency_suspected` 응급 징후. 119·응급실 안내를 띄운다\n' +
      '- `medical_caution` 요구가 의학 권고와 반대다\n' +
      '- `unsupported_inverse` 표현할 수 없는 반대 조건이라 빠졌다\n' +
      '- `tertiary_referral` 상급종합은 진료의뢰서가 없으면 전액 본인 부담\n' +
      '- `too_vague` 조건을 잡기에 질문이 모호하다',
  })
  readonly warnings!: string[];

  @ApiProperty({
    description: '조건이 맞게 잡혔는지 사용자가 확인할 한 문장',
    example: '소아청소년과 중 천식 진료 평가가 우수한 병원입니다.',
  })
  readonly explain!: string;

  @ApiProperty({
    type: [String],
    description:
      '검증에서 떨어진 값(`subject:XX` 꼴). **비어 있는 게 정상이다** — ' +
      '값이 있으면 프롬프트의 코드표가 실제 코드표와 어긋났다는 뜻이다.',
  })
  readonly dropped!: string[];

  @ApiProperty({
    type: [AiSearchConditionDto],
    description:
      '잡힌 조건을 **사람이 읽는 이름으로** 푼 것. `params.filter` 의 코드와 같은 내용이다. ' +
      '화면이 코드표를 또 부르지 않게 서버가 붙인다. ' +
      '등급·응급실 같은 고정값은 여기 없다 — 코드표가 없는 값이라 화면이 자기 문구를 쓴다.',
  })
  readonly conditions!: AiSearchConditionDto[];

  @ApiProperty({ enum: PROVIDERS })
  readonly provider!: LlmProviderName;

  @ApiProperty({
    description:
      '실제로 답한 모델. **요청에 실은 이름이 아니다** — 별칭을 보내면 ' +
      '업체가 구체 버전으로 풀어 준다. 모델만으로는 요금이 역산되지 않는다 ' +
      '(곱할 수량인 토큰 수가 `debug` 에 있고 운영에서는 안 나간다).',
  })
  readonly model!: string;

  @ApiProperty({
    description:
      '이 요청이 쓴 **통합 토큰**. 사용자에게 보이는 유일한 사용량 숫자다. ' +
      '원시 토큰 수가 아니라 환산값이다 — 출력이 입력보다 비싸고 모델마다 단가가 달라서, ' +
      '단위를 하나로 접지 않으면 같은 숫자가 자리마다 다른 돈을 뜻한다. ' +
      '`quota` 와 같은 단위라 그대로 견줄 수 있다. ' +
      '**캐시에서 나온 답도 같은 값을 문다** — 같은 질문이면 언제 묻든 같은 값이어야 한다. ' +
      '0 인 경우는 아무 답도 안 준 때뿐이다(사전 차단).',
    example: 9387,
  })
  readonly credits!: number;

  @ApiProperty({
    description:
      '서버가 이 요청을 처리한 시간(ms). **브라우저가 기다린 시간이 아니다**(네트워크 제외). ' +
      '캐시 히트면 한 자릿수까지 떨어진다.',
    example: 1840,
  })
  readonly elapsedMs!: number;

  @ApiPropertyOptional({
    type: QuotaDto,
    description:
      '쓴 몫. **못 셌으면 없다**(Redis 미설정·읽기 실패, 또는 한도 없음) — ' +
      '화면은 없으면 아무것도 안 그린다(0/0 은 다 쓴 것처럼 보인다).',
  })
  readonly quota?: QuotaDto;

  @ApiPropertyOptional({
    description:
      '`params.answer` 의 서명. **답이 있고 키가 설정된 배포에만 온다.**\n\n' +
      '답과 함께 들고 있다가 다음 요청의 `history[].signature` 로 그대로 돌려준다 — ' +
      '그래야 우리가 쓴 글만 문맥으로 이어진다.\n\n' +
      '저작자를 증명할 뿐 자격을 담지 않으므로 만료도 nonce 도 없다.',
  })
  readonly answerSignature?: string;

  @ApiPropertyOptional({
    type: AiSearchDebugDto,
    description:
      '원시 토큰 내역. **설정(llm.exposeDebugUsage)이 켜진 배포에만 온다** — 로컬·개발이다. ' +
      '모델 이름과 달리 이쪽은 곱할 수량이라, 나가면 단가와 맞물려 요금이 역산된다. ' +
      '화면에서 감추는 걸로는 안 감춰지므로(응답 JSON) 서버가 아예 안 싣는다.',
  })
  readonly debug?: AiSearchDebugDto;

  constructor(result: AiSearchResult) {
    this.tool = result.tool;
    this.params = result.params;
    this.warnings = result.warnings;
    this.explain = result.explain;
    this.dropped = result.dropped;
    this.conditions = result.conditions;
    this.provider = result.provider;
    this.model = result.model;
    this.credits = result.credits;
    this.answerSignature = result.answerSignature;
    this.elapsedMs = result.elapsedMs;
    this.quota = result.quota;
    this.debug = result.debug;
  }
}
