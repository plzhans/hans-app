import {
  ApiHideProperty,
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { QuotaDto } from '../../ai/dto/capabilities.dto';
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

/** 화면이 배너로 띄우는 신호. 닫힌 집합이라 스펙에 enum 으로 싣는다. */
const WARNINGS = [
  'off_topic',
  'medical_question',
  'emergency_suspected',
  'medical_caution',
  'unsupported_inverse',
  'tertiary_referral',
  'too_vague',
] as const;

/** 질문 길이 상한. 이 API 는 검색어를 받는 자리라 문단이 들어올 이유가 없다. */
export const MAX_QUESTION_LENGTH = 300;

/** 고를 수 있는 프로바이더. 설정에 없는 걸 고르면 호출 시점에 실패한다. */
const PROVIDERS = ['anthropic', 'openai', 'local'] as const;

/** 앞서 오간 말 한 마디. 검증이 아니라 **스펙에 모양을 싣기 위한** 클래스다. */
class AiSearchHistoryTurnDto implements AiSearchHistoryTurn {
  @ApiProperty({
    description: '사용자가 한 말',
    example: '무릎이 왜 아픈 거야?',
  })
  readonly question!: string;

  @ApiPropertyOptional({
    description: '그 질문에 대한 응답. 답변이 있었던 턴에만 담는다.',
    example: '무릎이 아픈 원인은…',
  })
  readonly answer?: string;

  @ApiPropertyOptional({
    description:
      '`answer` 에 딸려 온 서명(응답의 `answerSignature`). ' +
      '**`answer` 를 보낼 거면 반드시 같이 보낸다.**',
    example: 'X1c…',
  })
  readonly signature?: string;
}

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
      '직전 응답의 `params` 를 그대로 돌려보낸다. 앞서 잡힌 조건을 이어받는 수단이다 ' +
      '— 서버는 대화를 기억하지 않는다.\n\n' +
      '새 주제를 시작하려면 빼고 보낸다. `answer`·`reason` 은 보내도 무시한다.',
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
    type: () => [AiSearchHistoryTurnDto],
    description:
      '앞서 오간 말. "아까 말한 증상" 처럼 앞을 가리키는 말을 푸는 데 쓴다 ' +
      '(`context` 는 조건만 담아 이것까지는 못 푼다).\n\n' +
      '`answer` 를 보낼 때는 그 응답의 `answerSignature` 를 `signature` 로 같이 실어야 한다. ' +
      '없거나 맞지 않으면 그 턴의 `answer` 만 버리고 `question` 은 그대로 쓴다.\n\n' +
      '**최근 3마디만 쓴다**(더 보내면 앞쪽부터 버린다). ' +
      '한 마디의 길이도 자른다 — 질문 300자, 답 800자.',
    example: [
      {
        question: '무릎이 왜 아픈 거야?',
        answer: '무릎이 아픈 원인은…',
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

/**
 * 확인용 원시값. **스펙에 실리지 않는다**(AiSearchResponseDto.debug 가 @ApiHideProperty).
 * 로컬·개발에서 눈으로 보는 값이라 설명도 우리끼리 쓰는 말로 둔다.
 */
class AiSearchDebugDto implements AiSearchDebug {
  /** 캐시에서 나온 답인가. true 면 `usage` 는 처음 물었을 때 쓴 양이다. */
  @ApiProperty()
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
    // 타입(AiSearchWarning)만 두면 스펙에 자유 객체로 나간다. 값 목록을 명시한다.
    enum: WARNINGS,
    description: '`reject` 사유. `warnings` 와 같은 값 집합이다.',
  })
  readonly reason?: AiSearchWarning;

  @ApiPropertyOptional({
    description: '`answer_medical` 의 본문. 다른 동작에서는 오지 않는다.',
  })
  readonly answer?: string;
}

/**
 * AI 검색 응답. 병원 목록이 아니라 **무엇을 할지**를 준다.
 *
 * 조건 개수로 할 일을 추론하지 않게 `tool` 을 따로 둔다 — "근처 병원" 처럼
 * 조건은 비었는데 할 일은 있는 경우가 있다. 툴이 늘어도 모르는 이름을 넘기면
 * 되므로 옛 클라이언트가 깨지지 않는다.
 */
export class AiSearchResponseDto {
  @ApiProperty({
    enum: TOOLS,
    description:
      '클라이언트가 실행할 동작.\n' +
      '- `search_hospitals` `params.filter`(+`regionCd`)로 병원 검색\n' +
      '- `search_nearby` 현재 위치 기준 거리순 검색. 측위는 클라이언트가 한다\n' +
      '- `ask_location` 지역을 되묻는다. `params.placeText` 에 사용자가 쓴 표현이 있다\n' +
      '- `answer_medical` `params.answer` 를 그대로 보여준다\n' +
      '- `reject` 검색하지 않는다. `params.reason` 이 사유다',
  })
  readonly tool!: AiSearchTool;

  @ApiProperty({ type: AiSearchParamsDto })
  readonly params!: AiSearchParamsDto;

  @ApiProperty({
    enum: WARNINGS,
    isArray: true,
    description:
      '사용자에게 안내할 신호.\n' +
      '- `off_topic` 병원 검색 범위 밖의 질문\n' +
      '- `medical_question` 건강 질문. 검색 조건으로 옮기지 않았다\n' +
      '- `emergency_suspected` 응급 징후. 119·응급실 안내가 필요하다\n' +
      '- `medical_caution` 요구가 일반적인 의학 권고와 어긋난다\n' +
      '- `unsupported_inverse` 검색 조건으로 표현할 수 없는 반대 조건이라 빠졌다\n' +
      '- `tertiary_referral` 상급종합병원은 진료의뢰서가 없으면 전액 본인 부담이다\n' +
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
      '검증에서 제외된 값(`subject:XX` 꼴). 비어 있는 것이 정상이다.',
  })
  readonly dropped!: string[];

  @ApiProperty({
    type: [AiSearchConditionDto],
    description:
      '잡힌 조건을 사람이 읽는 이름으로 푼 것. `params.filter` 의 코드와 같은 내용이라 ' +
      '코드표를 따로 조회할 필요가 없다. 등급·응급실처럼 코드표가 없는 값은 포함되지 않는다.',
  })
  readonly conditions!: AiSearchConditionDto[];

  @ApiProperty({ enum: PROVIDERS })
  readonly provider!: LlmProviderName;

  @ApiProperty({
    description:
      '실제로 응답한 모델. 요청에 실은 이름이 아니라 확정된 버전이다.',
  })
  readonly model!: string;

  @ApiProperty({
    description:
      '이 요청이 사용한 양. `quota` 와 같은 단위라 그대로 견줄 수 있다. ' +
      '같은 질문이면 언제 묻든 같은 값이다.',
    example: 9387,
  })
  readonly credits!: number;

  @ApiProperty({
    description: '서버 처리 시간(ms). 네트워크 구간은 포함되지 않는다.',
    example: 1840,
  })
  readonly elapsedMs!: number;

  @ApiPropertyOptional({
    type: QuotaDto,
    description: '사용량. 한도가 걸려 있지 않으면 오지 않는다.',
  })
  readonly quota?: QuotaDto;

  @ApiPropertyOptional({
    description:
      '`params.answer` 의 서명. 답이 있을 때만 온다. ' +
      '다음 요청의 `history[].signature` 로 그대로 돌려주면 그 답이 문맥으로 이어진다.',
  })
  readonly answerSignature?: string;

  /**
   * 원시 토큰 내역. 설정(`llm.exposeDebugUsage`)이 켜진 배포에만 실린다 — 로컬·개발이다.
   *
   * **스펙에서 감춘다.** 대외로 나가는 값이 아니라 문서에 적을 것이 아니고, 적어 두면
   * 쓰는 쪽이 기대게 된다. 개발 화면에서 그리려면 클라이언트가 자기 타입으로 얹어 쓴다.
   */
  @ApiHideProperty()
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
