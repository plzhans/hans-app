import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type {
  BatchJobStatusView,
  BatchOverviewView,
  JobRunView,
  RunningStageView,
  StageRunView,
} from '@hansapp/admin-application';

/** 진행 중인 단계 한 줄 */
export class RunningStageDto {
  @ApiProperty({ description: '단계 식별자', example: 'hira.4' })
  readonly job: string;

  @ApiProperty({ description: '기관', example: 'hira' })
  readonly provider: string;

  @ApiProperty({ description: '단계 번호', example: 4 })
  readonly stage: number;

  @ApiProperty({
    description: '어떻게 불렸나. 회차 밖 실행은 CRON 이 아니다.',
    example: 'CRON',
    enum: ['CRON', 'ONCE', 'CLI', 'ADMIN'],
  })
  readonly source: string;

  @ApiProperty({ description: '시작 시각' })
  readonly startedAt: Date;

  @ApiProperty({ description: '처리 대상 건수', example: 1429 })
  readonly total: number;

  @ApiProperty({ description: '지금까지 처리한 건수', example: 320 })
  readonly processed: number;

  @ApiProperty({ description: '지금까지 쓴 API 콜 수', example: 3200 })
  readonly calls: number;

  @ApiPropertyOptional({
    description: '진행률(0~100). 대상 건수를 아직 세기 전이면 null.',
    example: 22,
  })
  readonly percent: number | null;

  @ApiPropertyOptional({
    description:
      '살아 있지 않은 것으로 보이는 이유. **없으면 정상적으로 도는 중이다.**\n\n' +
      'RUNNING 은 스스로 풀리지 않는다 — 프로세스가 끊기면 종료 기록이 안 돌아 ' +
      '행이 영영 RUNNING 으로 남는다.',
    example: '배치가 응답하지 않는다',
  })
  readonly staleReason?: string;

  constructor(view: RunningStageView) {
    this.job = view.job;
    this.provider = view.provider;
    this.stage = view.stage;
    this.source = view.source;
    this.startedAt = view.startedAt;
    this.total = view.total;
    this.processed = view.processed;
    this.calls = view.calls;
    this.percent = view.percent;
    this.staleReason = view.staleReason;
  }
}

/** 잡 하나의 현황 */
export class BatchJobStatusDto {
  @ApiProperty({ description: '잡 이름', example: 'daily-sync' })
  readonly job: string;

  @ApiProperty({ description: '한 줄 설명' })
  readonly description: string;

  @ApiProperty({ description: '분류', example: 'HEALTHCARE' })
  readonly category: string;

  @ApiProperty({ description: '크론식', example: '0 4 * * *' })
  readonly cronExpression: string;

  @ApiProperty({ description: '크론식을 해석하는 타임존', example: 'Asia/Seoul' })
  readonly timeZone: string;

  @ApiProperty({
    description:
      '스케줄이 살아 있나. **끄면 크론 시각이 와도 돌지 않는다.**\n\n' +
      '수동 실행(hanscli·--job)은 껐어도 그대로 된다 — 끈다는 것은 "정해진 시각에 저절로 ' +
      '돌지 마라" 이지 "이 작업을 봉인하라" 가 아니다.',
    example: true,
  })
  readonly enabled: boolean;

  @ApiProperty({
    description: '마지막 회차 상태',
    example: 'DONE',
    enum: ['IDLE', 'RUNNING', 'DONE', 'PARTIAL', 'FAILED', 'SKIPPED'],
  })
  readonly status: string;

  @ApiPropertyOptional({ description: '마지막으로 시작한 시각' })
  readonly lastStartedAt: Date | null;

  @ApiPropertyOptional({ description: '마지막으로 끝난 시각' })
  readonly lastFinishedAt: Date | null;

  @ApiPropertyOptional({
    description: '마지막으로 **성공**한 시각. 실패해도 지워지지 않는다.',
  })
  readonly lastSuccessAt: Date | null;

  @ApiProperty({ description: '마지막 회차 소요 시간(ms)' })
  readonly lastElapsedMs: number;

  @ApiProperty({ description: '마지막 회차 API 콜 수' })
  readonly lastCalls: number;

  @ApiProperty({ description: '마지막 회차 처리 건수' })
  readonly lastProcessed: number;

  @ApiPropertyOptional({ description: '마지막 회차 실패 사유' })
  readonly lastError: string | null;

  @ApiProperty({
    description: '연속 실패 횟수. 성공하면 0 으로 돌아간다.',
    example: 0,
  })
  readonly failureStreak: number;

  @ApiPropertyOptional({
    description: '마지막으로 이 잡을 돌린 호스트. **어디서 도는 잡인지**를 여기서 본다.',
    example: 'batch-01',
  })
  readonly lastHostname: string | null;

  @ApiPropertyOptional({
    description:
      '그때 돌던 산출물의 판. 동작이 이상하면 대개 옛 빌드가 남아 있는 것이라 여기서 갈린다.',
    example: '0.16.0+9ef211f',
  })
  readonly lastVersion: string | null;

  @ApiPropertyOptional({ description: '다음 실행 예정 시각' })
  readonly nextRunAt: Date | null;

  @ApiProperty({
    description:
      '예정 시각이 지났는데 아직 안 돌았다. **스케줄러가 죽었다는 신호다** — ' +
      'next_run_at 은 회차가 끝날 때마다 다시 쓰이므로 정상이면 항상 미래를 가리킨다.',
    example: false,
  })
  readonly overdue: boolean;

  @ApiProperty({
    description: '지금 돌고 있는 단계들. 안 돌고 있으면 빈 배열.',
    type: [RunningStageDto],
  })
  readonly runningStages: RunningStageDto[];

  constructor(view: BatchJobStatusView) {
    this.job = view.job;
    this.description = view.description;
    this.category = view.category;
    this.cronExpression = view.cronExpression;
    this.timeZone = view.timeZone;
    this.enabled = view.enabled;
    this.status = view.status;
    this.lastStartedAt = view.lastStartedAt;
    this.lastFinishedAt = view.lastFinishedAt;
    this.lastSuccessAt = view.lastSuccessAt;
    this.lastElapsedMs = view.lastElapsedMs;
    this.lastCalls = view.lastCalls;
    this.lastProcessed = view.lastProcessed;
    this.lastError = view.lastError;
    this.failureStreak = view.failureStreak;
    this.lastHostname = view.lastHostname;
    this.lastVersion = view.lastVersion;
    this.nextRunAt = view.nextRunAt;
    this.overdue = view.overdue;
    this.runningStages = view.runningStages.map((stage) => new RunningStageDto(stage));
  }
}

/** 스케줄 on/off 요청 */
export class BatchJobEnabledDto {
  @ApiProperty({ description: '켤지 끌지', example: false })
  @IsBoolean()
  readonly enabled!: boolean;
}

/** 현황 화면이 한 번에 받는 것 */
export class BatchOverviewDto {
  @ApiProperty({ description: '스케줄이 붙은 잡들', type: [BatchJobStatusDto] })
  readonly jobs: BatchJobStatusDto[];

  @ApiProperty({
    description:
      '**사람이 직접 돌리고 있는 단계.** hanscli(`source=CLI`)나 관리자 화면(`ADMIN`)에서 ' +
      '시작한 것이다.\n\n' +
      '잡 회차에 붙지 않으므로 잡 카드에 얹지 않는다 — 얹으면 스케줄이 돌고 있는 것처럼 보인다.',
    type: [RunningStageDto],
  })
  readonly manualStages: RunningStageDto[];

  @ApiProperty({
    description:
      '**중단됐거나 기록이 어긋난 단계.** `staleReason` 에 이유가 담긴다.\n\n' +
      '프로세스가 끊겨 RUNNING 인 채 굳은 행, 크론이 돌렸는데 회차 기록이 없는 행이 온다. ' +
      '사람이 시작한 것이 아니므로 수동 실행과 섞지 않는다.',
    type: [RunningStageDto],
  })
  readonly stalledStages: RunningStageDto[];

  constructor(view: BatchOverviewView) {
    this.jobs = view.jobs.map((job) => new BatchJobStatusDto(job));
    this.manualStages = view.manualStages.map((stage) => new RunningStageDto(stage));
    this.stalledStages = view.stalledStages.map((stage) => new RunningStageDto(stage));
  }
}

/** 회차 한 줄 */
export class BatchJobRunDto {
  @ApiProperty({
    description: '회차 번호. **문자열이다** — BigInt 라 JSON 으로 그대로 못 내보낸다.',
    example: '1024',
  })
  readonly id: string;

  @ApiProperty({ description: '잡 이름', example: 'daily-sync' })
  readonly job: string;

  @ApiProperty({
    description: '어떻게 불렸나',
    example: 'CRON',
    enum: ['CRON', 'ONCE', 'CLI', 'ADMIN'],
  })
  readonly source: string;

  @ApiProperty({
    description: '결과',
    example: 'DONE',
    enum: ['RUNNING', 'DONE', 'PARTIAL', 'FAILED', 'SKIPPED'],
  })
  readonly status: string;

  @ApiPropertyOptional({ description: '원래 돌기로 했던 시각. 수동 실행은 없다.' })
  readonly scheduledAt: Date | null;

  @ApiProperty({ description: '시작 시각' })
  readonly startedAt: Date;

  @ApiPropertyOptional({ description: '종료 시각. 아직 돌고 있으면 없다.' })
  readonly finishedAt: Date | null;

  @ApiPropertyOptional({ description: '소요 시간(ms)' })
  readonly elapsedMs: number | null;

  @ApiPropertyOptional({
    description: '예정보다 늦게 시작한 시간(ms). 예정이 없으면 null.',
  })
  readonly delayMs: number | null;

  @ApiProperty({ description: 'API 콜 수 합계' })
  readonly calls: number;

  @ApiProperty({
    description: '처리 건수 합계. **잡마다 의미가 다르다** — 적재는 병원 수, 정리는 삭제 건수.',
  })
  readonly processed: number;

  @ApiPropertyOptional({ description: '실패 사유 한 줄 요약' })
  readonly error: string | null;

  @ApiPropertyOptional({
    description: '잡마다 모양이 다른 요약(단계별 콜·처리·소요, 테이블별 삭제 건수).',
  })
  readonly summary: unknown;

  @ApiPropertyOptional({ description: '이 회차를 돌린 호스트', example: 'batch-01' })
  readonly hostname: string | null;

  @ApiPropertyOptional({ description: '그 호스트의 프로세스 번호', example: 4821 })
  readonly pid: number | null;

  @ApiPropertyOptional({
    description: '돌린 산출물의 판. **옛 빌드가 남아 있는지 여기서 드러난다.**',
    example: '0.16.0+9ef211f',
  })
  readonly version: string | null;

  constructor(view: JobRunView) {
    this.id = view.id;
    this.job = view.job;
    this.source = view.source;
    this.status = view.status;
    this.scheduledAt = view.scheduledAt;
    this.startedAt = view.startedAt;
    this.finishedAt = view.finishedAt;
    this.elapsedMs = view.elapsedMs;
    this.delayMs = view.delayMs;
    this.calls = view.calls;
    this.processed = view.processed;
    this.error = view.error;
    this.summary = view.summary;
    this.hostname = view.hostname;
    this.pid = view.pid;
    this.version = view.version;
  }
}

/** 단계 한 줄 */
export class BatchStageRunDto {
  @ApiProperty({ description: '단계 실행 번호(문자열)', example: '20480' })
  readonly id: string;

  @ApiProperty({ description: '단계 식별자', example: 'hira.4' })
  readonly job: string;

  @ApiProperty({ description: '기관', example: 'hira' })
  readonly provider: string;

  @ApiProperty({ description: '단계 번호', example: 4 })
  readonly stage: number;

  @ApiPropertyOptional({ description: '같은 단계 안의 세부 구분', example: 'equipment' })
  readonly detail: string | null;

  @ApiProperty({
    description: '어떻게 불렸나. **CLI 면 사람이 hanscli 로 돌린 것이다.**',
    example: 'CRON',
    enum: ['CRON', 'ONCE', 'CLI', 'ADMIN'],
  })
  readonly source: string;

  @ApiProperty({
    description: '결과',
    example: 'DONE',
    enum: ['RUNNING', 'DONE', 'PARTIAL', 'FAILED', 'SKIPPED'],
  })
  readonly status: string;

  @ApiPropertyOptional({
    description: '생략 사유. status=SKIPPED 일 때만 찬다.',
    example: '최근 7일 이내에 성공했다',
  })
  readonly skipReason: string | null;

  @ApiProperty({ description: '시작 시각' })
  readonly startedAt: Date;

  @ApiPropertyOptional({ description: '종료 시각' })
  readonly finishedAt: Date | null;

  @ApiProperty({ description: '소요 시간(ms)' })
  readonly elapsedMs: number;

  @ApiProperty({ description: '처리 대상 건수' })
  readonly total: number;

  @ApiProperty({ description: '처리한 건수' })
  readonly processed: number;

  @ApiProperty({ description: 'API 콜 수' })
  readonly calls: number;

  @ApiPropertyOptional({ description: '진행률(0~100). 대상 건수가 0 이면 null.' })
  readonly percent: number | null;

  @ApiPropertyOptional({ description: '실패 사유' })
  readonly error: string | null;

  constructor(view: StageRunView) {
    this.id = view.id;
    this.job = view.job;
    this.provider = view.provider;
    this.stage = view.stage;
    this.detail = view.detail;
    this.source = view.source;
    this.status = view.status;
    this.skipReason = view.skipReason;
    this.startedAt = view.startedAt;
    this.finishedAt = view.finishedAt;
    this.elapsedMs = view.elapsedMs;
    this.total = view.total;
    this.processed = view.processed;
    this.calls = view.calls;
    this.percent = view.percent;
    this.error = view.error;
  }
}

/** 회차 하나와 그 안의 단계들 */
export class BatchJobRunDetailDto {
  @ApiProperty({ type: BatchJobRunDto })
  readonly run: BatchJobRunDto;

  @ApiProperty({ description: '이 회차에 돈 단계들. 시작 순서대로.', type: [BatchStageRunDto] })
  readonly stages: BatchStageRunDto[];

  constructor(run: BatchJobRunDto, stages: BatchStageRunDto[]) {
    this.run = run;
    this.stages = stages;
  }
}

/**
 * 회차 이력 조회 조건.
 *
 * **기간이 필수가 아니다.** 인증 로그와 달리 이 표는 하루 두어 행씩 쌓여서, 기간 없이
 * 훑어도 `(started_at)` 인덱스로 충분하다. 잡을 지정하면 `(job, started_at)` 을 탄다.
 */
export class BatchJobRunQueryDto {
  @ApiPropertyOptional({ description: '페이지 번호(1부터)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  readonly page: number = 1;

  @ApiPropertyOptional({ description: '페이지 크기', default: 30, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  readonly size: number = 30;

  @ApiPropertyOptional({
    description: '볼 잡. 쉼표로 여러 개(`daily-sync,auth-cleanup`). 없으면 전부.',
    example: 'daily-sync',
  })
  @IsOptional()
  @Transform(({ value }) => {
    // 없을 때 손대지 않는다 — 배열을 만들어 돌려주면 @IsOptional 이 건너뛸 기회를 잃는다.
    if (value == null) return undefined;
    const parsed = (Array.isArray(value) ? value : [value])
      .flatMap((item: unknown) => String(item).split(','))
      .map((item) => item.trim())
      .filter(Boolean);
    return parsed.length ? parsed : undefined;
  })
  @IsString({ each: true })
  @MaxLength(30, { each: true })
  readonly jobs?: string[];

  @ApiPropertyOptional({ description: '시작 시각(ISO 8601, 포함)' })
  @IsOptional()
  @IsISO8601()
  readonly from?: string;

  @ApiPropertyOptional({ description: '종료 시각(ISO 8601, 포함)' })
  @IsOptional()
  @IsISO8601()
  readonly to?: string;
}

/** 단계 이력 조회 조건 */
export class BatchStageRunQueryDto {
  @ApiPropertyOptional({ description: '페이지 번호(1부터)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  readonly page: number = 1;

  @ApiPropertyOptional({ description: '페이지 크기', default: 30, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  readonly size: number = 30;
}

/**
 * 단계 한 줄. 관리자가 여기서 단계를 켜고 끈다.
 *
 * **잡 카드보다 한 칸 아래다.** 잡(hira)을 통째로 끄면 싸고 중요한 목록 단계까지 멈추므로,
 * 원본 한도를 아끼려면 개별 상세 단계만 골라 끌 수 있어야 한다.
 */
export class BatchStageDto {
  @ApiProperty({ description: '단계 키', example: 'hira.2' })
  readonly job: string;

  @ApiProperty({ description: '기관', example: 'hira' })
  readonly provider: string;

  @ApiProperty({ description: '단계 번호', example: 2 })
  readonly stage: number;

  @ApiProperty({
    description: '무엇을 하는 단계인가. 콜 수가 함께 적혀 있어 끌지 말지를 여기서 판단한다.',
    example: '개별 상세 — 상급종합 47개 × 10종',
  })
  readonly description: string;

  @ApiProperty({
    description:
      '켜져 있나. **끄면 스케줄뿐 아니라 수동 실행도 막힌다** — hanscli 로 돌려도 건너뛴다. ' +
      '고친 뒤 확인해야 하면 `--force` 로 뚫는다.',
    example: true,
  })
  readonly enabled: boolean;

  @ApiProperty({ description: '마지막 상태', example: 'done' })
  readonly status: string;

  @ApiPropertyOptional({ description: '마지막으로 성공한 시각' })
  readonly lastSuccessAt: Date | null;

  @ApiPropertyOptional({ description: '다음에 돌 자격이 생기는 시각' })
  readonly nextEligibleAt: Date | null;

  @ApiProperty({ description: '마지막 실행이 쓴 API 콜 수', example: 276 })
  readonly calls: number;

  constructor(row: {
    job: string;
    provider: string;
    stage: number;
    description: string;
    enabled: boolean;
    status: string;
    lastSuccessAt: Date | null;
    nextEligibleAt: Date | null;
    calls: number;
  }) {
    this.job = row.job;
    this.provider = row.provider;
    this.stage = row.stage;
    this.description = row.description;
    this.enabled = row.enabled;
    this.status = row.status;
    this.lastSuccessAt = row.lastSuccessAt;
    this.nextEligibleAt = row.nextEligibleAt;
    this.calls = row.calls;
  }
}
