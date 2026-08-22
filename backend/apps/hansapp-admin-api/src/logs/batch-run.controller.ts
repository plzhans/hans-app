import {
  BadRequestException,
  Body,
  Get,
  NotFoundException,
  Param,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiController, ApiPageResponse, PageResponseDto } from '@hansapp/http-common';
import {
  BatchJobService,
  BatchRunReadService,
  DATA_PROVIDERS,
  stageCatalog,
  SyncStateService,
  type DataProvider,
} from '@hansapp/admin-application';
import {
  AdminActionLogService,
  CurrentAdmin,
  type AdminAuthUser,
} from '@hansapp/admin-application/auth';
import type { Request } from 'express';

import {
  BatchJobRunDetailDto,
  BatchJobRunDto,
  BatchJobRunQueryDto,
  BatchJobEnabledDto,
  BatchJobStatusDto,
  BatchOverviewDto,
  BatchStageDto,
  BatchStageRunDto,
  BatchStageRunQueryDto,
} from './dto/batch-run.dto';

/**
 * 배치 현황과 실행 이력.
 *
 * **세 층으로 판다.** 잡 목록(지금 어떤가) → 회차 이력(언제언제 돌았나) → 단계(그 회차에
 * 무슨 일이 있었나). 화면이 이 순서로 파고들고, 각 층이 답하는 질문이 다르다.
 *
 * 단계 이력만은 회차를 가로질러 볼 수도 있다(`/stages/:job`) — "이 단계가 요즘 어떤가" 는
 * 특정 회차가 아니라 그 단계의 추이를 묻는 것이라서다. 거기에는 hanscli 로 사람이
 * 돌린 실행도 함께 나온다(`source=CLI`).
 */
@ApiTags('batch')
@ApiController('api/batch')
export class BatchRunController {
  constructor(
    private readonly batch: BatchRunReadService,
    private readonly master: BatchJobService,
    private readonly stageState: SyncStateService,
    private readonly actionLog: AdminActionLogService,
  ) {}

  @Get('jobs')
  @ApiOperation({
    summary: '배치 잡 현황',
    description:
      '스케줄이 붙은 잡의 목록과 각각의 마지막 결과·다음 예정 시각을 준다.\n\n' +
      '`category` 로 묶어 보여주면 된다(HEALTHCARE·AUTH·USER).\n\n' +
      '**`overdue` 가 true 면 스케줄러가 죽은 것이다** — 예정 시각이 지났는데 갱신되지 않았다는 뜻이다.\n\n' +
      '돌고 있는 잡이면 `runningStages` 에 진행 중인 단계와 진행률이 담긴다.\n\n' +
      '`manualStages` 는 사람이 직접 돌리고 있는 단계(hanscli·관리자 화면)이고, ' +
      '`stalledStages` 는 프로세스가 끊겨 굳었거나 회차 기록이 어긋난 단계다.',
  })
  async jobs(): Promise<BatchOverviewDto> {
    return new BatchOverviewDto(await this.batch.overview());
  }

  @Put('jobs/:job/enabled')
  @ApiOperation({
    summary: '스케줄 켜기 / 끄기',
    description:
      '끄면 크론 시각이 와도 그 잡이 돌지 않는다. **재시작이 필요 없다** — 배치가 실행 ' +
      '시점에 이 값을 읽는다.\n\n' +
      '**수동 실행은 막지 않는다.** hanscli 나 `--job` 으로 돌리는 길은 열려 있다 — ' +
      '문제가 생겨 껐는데 고친 뒤 확인할 방법이 없으면 곤란하다.\n\n' +
      '누가 언제 바꿨는지는 관리자 행위 로그에 남는다.',
  })
  async setEnabled(
    @Param('job') job: string,
    @Body() body: BatchJobEnabledDto,
    @CurrentAdmin() admin: AdminAuthUser,
    @Req() request: Request,
  ): Promise<BatchJobStatusDto> {
    const current = await this.batch.findJob(job);
    if (!current) {
      throw new NotFoundException(`batch job ${job} not found`);
    }

    await this.master.setEnabled(job, body.enabled);

    // 스케줄을 끄면 그 잡이 멈춘다. 나중에 "왜 안 돌았나" 를 되짚을 근거를 남긴다.
    await this.actionLog.record({
      // 관리자 계정 관리(admin-account.service)의 meta() 와 같은 조합이다.
      adminId: admin.adminId,
      ip: request.ip ?? null,
      userAgent: request.get('user-agent') ?? null,
      action: body.enabled ? 'BATCH_JOB_ENABLE' : 'BATCH_JOB_DISABLE',
      result: 'SUCCESS',
      // 어느 잡인지는 여기 남긴다 — 액션을 잡마다 만들면 잡이 늘 때마다 ALTER 가 따라온다.
      detail: { job },
    });

    const updated = await this.batch.findJob(job);
    return new BatchJobStatusDto(updated ?? current);
  }

  @Get('runs')
  @ApiOperation({
    summary: '회차 이력',
    description:
      '잡이 언제언제 돌았는지를 최근 순으로 준다. 잡·기간으로 거른다.\n\n' +
      '`status=SKIPPED` 인 행은 **크론은 떴지만 이전 회차가 안 끝나 그냥 돌아간** 것이다. ' +
      '행이 아예 없는 것(프로세스가 죽어 안 뜸)과 구별해서 봐야 한다.',
  })
  @ApiPageResponse(BatchJobRunDto)
  async runs(@Query() query: BatchJobRunQueryDto): Promise<PageResponseDto<BatchJobRunDto>> {
    const page = await this.batch.listJobRuns(
      {
        jobs: query.jobs,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
      },
      query.page,
      query.size,
    );
    return PageResponseDto.from(page.map((view) => new BatchJobRunDto(view)));
  }

  @Get('runs/:id')
  @ApiOperation({
    summary: '회차 상세 — 그 안의 단계들',
    description:
      '한 회차와 그 회차에 돈 단계들을 시작 순서대로 준다. 단계는 쪽수를 나누지 않는다 ' +
      '— 한 회차가 16단계뿐이라 통째로 주는 편이 화면에 낫다.',
  })
  async run(@Param('id') id: string): Promise<BatchJobRunDetailDto> {
    const found = await this.batch.findJobRun(toId(id));
    if (!found) {
      throw new NotFoundException(`batch run ${id} not found`);
    }
    return new BatchJobRunDetailDto(
      new BatchJobRunDto(found.run),
      found.stages.map((stage) => new BatchStageRunDto(stage)),
    );
  }

  @Get('stages')
  @ApiOperation({
    summary: '단계 목록',
    description:
      '기관별 단계와 각각의 on/off 상태를 준다. `provider` 로 좁힐 수 있다.\n\n' +
      '**잡 카드보다 한 칸 아래의 손잡이다.** 잡(`hira`)을 통째로 끄면 싸고 중요한 목록 ' +
      '단계(`hira.1`)까지 멈춘다 — 원본 한도를 아끼려면 개별 상세 단계만 골라 꺼야 한다.\n\n' +
      '`description` 에 콜 수가 함께 적혀 있으니 그걸 보고 판단하면 된다.',
  })
  @ApiOkResponse({ type: [BatchStageDto] })
  async stageList(@Query('provider') provider?: string): Promise<BatchStageDto[]> {
    const wanted = asProvider(provider);
    const catalog = stageCatalog().filter(
      (spec) => wanted === undefined || spec.provider === wanted,
    );
    const rows = await this.stageState.listStages(catalog);
    return rows.map((row) => new BatchStageDto(row));
  }

  @Put('stages/:job/enabled')
  @ApiOperation({
    summary: '단계 켜기 / 끄기',
    description:
      '끄면 배치가 와도 그 단계를 건너뛴다. **재시작이 필요 없다** — 실행 시점에 이 값을 읽는다.\n\n' +
      '**잡 on/off 와 효력이 다르다. 수동 실행도 막는다.** 개발서버와 운영이 같은 서비스키를 ' +
      '쓰기 때문에, hanscli 로 무심코 돌린 한 번이 그대로 운영 몫의 일일 한도에서 빠진다. ' +
      '고친 뒤 확인해야 하면 `--force` 로 뚫는다.\n\n' +
      '누가 언제 바꿨는지는 관리자 행위 로그에 남는다.',
  })
  async setStageEnabled(
    @Param('job') job: string,
    @Body() body: BatchJobEnabledDto,
    @CurrentAdmin() admin: AdminAuthUser,
    @Req() request: Request,
  ): Promise<BatchStageDto> {
    // 카탈로그에 없는 단계는 끌 수도 없다 — 코드가 모르는 것을 DB 에 만들지 않는다.
    const spec = stageCatalog().find((row) => row.job === job);
    if (!spec) {
      throw new NotFoundException(`batch stage ${job} not found`);
    }

    await this.stageState.setEnabled(spec, body.enabled);

    // 단계를 끄면 그 단계가 멈춘다. 나중에 "왜 이 데이터가 안 들어왔나" 를 되짚을 근거를 남긴다.
    await this.actionLog.record({
      adminId: admin.adminId,
      ip: request.ip ?? null,
      userAgent: request.get('user-agent') ?? null,
      action: body.enabled ? 'BATCH_STAGE_ENABLE' : 'BATCH_STAGE_DISABLE',
      result: 'SUCCESS',
      // 어느 단계인지는 여기 남긴다 — 액션을 단계마다 만들면 단계가 늘 때마다 ALTER 가 따라온다.
      detail: { job },
    });

    const rows = await this.stageState.listStages([spec]);
    return new BatchStageDto(rows[0]);
  }

  @Get('stages/:job')
  @ApiOperation({
    summary: '단계 이력',
    description:
      '한 단계(`nmc.1`, `hira.4` 등)의 실행 이력을 최근 순으로 준다.\n\n' +
      '**회차를 가리지 않는다** — hanscli 로 사람이 돌린 것도 함께 나온다(`source=CLI`).\n\n' +
      '`status=SKIPPED` 는 신선도에 걸려 건너뛴 것이다. 목록 단계는 신선도가 7일이라 ' +
      '주 6일이 이 상태인 게 정상이다.',
  })
  @ApiPageResponse(BatchStageRunDto)
  async stages(
    @Param('job') job: string,
    @Query() query: BatchStageRunQueryDto,
  ): Promise<PageResponseDto<BatchStageRunDto>> {
    const page = await this.batch.listStageRuns(job, query.page, query.size);
    return PageResponseDto.from(page.map((view) => new BatchStageRunDto(view)));
  }
}

function asProvider(value?: string): DataProvider | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!DATA_PROVIDERS.includes(value as DataProvider)) {
    throw new BadRequestException(`unknown provider: ${value}`);
  }
  return value as DataProvider;
}

/**
 * 경로의 회차 번호를 BigInt 로. 숫자가 아니면 404 다 —
 * 그런 회차는 존재하지 않으므로 400 보다 404 가 맞다.
 */
function toId(value: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new NotFoundException(`batch run ${value} not found`);
  }
  return BigInt(value);
}
