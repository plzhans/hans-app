import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import type {
  AiSearchFilter,
  AiSearchResult,
  LlmProviderName,
  AiSearchUsage,
} from '@hansapp/application';

/** 질문 길이 상한. 이 API 는 검색어를 받는 자리라 문단이 들어올 이유가 없다. */
export const MAX_QUESTION_LENGTH = 300;

/** 고를 수 있는 프로바이더. 설정에 없는 걸 고르면 호출 시점에 실패한다. */
const PROVIDERS = ['claude', 'openai', 'local'] as const;

export class AiSearchRequestDto {
  @ApiProperty({
    description: '자연어 질문',
    example: '천식치료 소아과 병원 추천해줘',
    maxLength: MAX_QUESTION_LENGTH,
  })
  @IsString()
  @MinLength(2)
  @MaxLength(MAX_QUESTION_LENGTH)
  readonly q!: string;

  @ApiPropertyOptional({
    description:
      '어느 업체로 보낼지. 비우면 서버 설정의 기본값(llm.provider).\n' +
      '`local` 은 OpenAI 호환 엔드포인트(ollama·vLLM 등)를 뜻한다.',
    enum: PROVIDERS,
  })
  @IsOptional()
  @IsIn(PROVIDERS)
  readonly provider?: LlmProviderName;

  @ApiPropertyOptional({
    description:
      '모델 이름. 비우면 프로바이더별 설정의 기본값. ' +
      '비교 실험용이라 운영 클라이언트는 보통 비운다.',
    example: 'claude-opus-5',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  readonly model?: string;
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

/**
 * AI 검색 응답. **병원 목록이 아니라 검색 조건이다.**
 *
 * 화면은 이 filter 를 사용자에게 칩으로 보여주고(고칠 수 있게), 그대로
 * `GET /healthcare/hospitals` 에 실어 실제 목록을 받는다. 그렇게 나눈 이유는
 * HealthcareAiSearchService 주석 참고.
 */
export class AiSearchResponseDto {
  @ApiProperty({ type: AiSearchFilterDto })
  readonly filter!: AiSearchFilterDto;

  @ApiPropertyOptional({
    description:
      '사용자가 쓴 지역 표현 원문(예: "강남역 근처"). **코드가 아니다** — ' +
      '역·동 해석은 아직 서버가 하지 않는다. 화면이 지역 선택을 유도하는 데 쓴다.',
  })
  readonly placeText?: string;

  @ApiProperty({
    description: '지역을 특정할 수 없어 되물어야 하면 true',
  })
  readonly needsLocation!: boolean;

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

  @ApiProperty({ type: AiSearchUsageDto })
  readonly usage!: AiSearchUsageDto;

  constructor(result: AiSearchResult) {
    this.filter = result.filter;
    this.placeText = result.placeText;
    this.needsLocation = result.needsLocation;
    this.warnings = result.warnings;
    this.explain = result.explain;
    this.dropped = result.dropped;
    this.provider = result.provider;
    this.model = result.model;
    this.usage = result.usage;
  }
}
