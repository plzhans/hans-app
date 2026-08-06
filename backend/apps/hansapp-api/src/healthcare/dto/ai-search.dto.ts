import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import type {
  AiSearchFilter,
  AiSearchParams,
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

  @ApiProperty({ enum: PROVIDERS })
  readonly provider!: LlmProviderName;

  @ApiProperty({ description: '실제로 답한 모델' })
  readonly model!: string;

  @ApiProperty({
    description:
      '캐시된 답이면 true. 이때 `usage` 는 **처음 물었을 때** 쓴 토큰이라 ' +
      '이 요청의 비용이 아니다(이 요청은 LLM 을 부르지 않았다).',
  })
  readonly cached!: boolean;

  @ApiProperty({
    description:
      '서버가 이 요청을 처리한 시간(ms). **브라우저가 기다린 시간이 아니다**(네트워크 제외). ' +
      '캐시 히트면 한 자릿수까지 떨어진다.',
    example: 1840,
  })
  readonly elapsedMs!: number;

  @ApiProperty({ type: AiSearchUsageDto })
  readonly usage!: AiSearchUsageDto;

  constructor(result: AiSearchResult) {
    this.tool = result.tool;
    this.params = result.params;
    this.warnings = result.warnings;
    this.explain = result.explain;
    this.dropped = result.dropped;
    this.provider = result.provider;
    this.model = result.model;
    this.cached = result.cached;
    this.elapsedMs = result.elapsedMs;
    this.usage = result.usage;
  }
}
