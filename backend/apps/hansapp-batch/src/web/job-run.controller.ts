import {
  ConflictException,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { BatchRunSource, type BatchRunTarget, type BatchRunTokenClaims } from '@hansapp/common';
import { findBatchJob, stageCatalog } from '@hansapp/admin-application';
import { JobLockService } from '@hansapp/lock';
import { RemoteJwksVerifier } from '@hansapp/jwt';

import { BatchService } from '../batch.service';

import { RUN_VERIFIER } from './run-verifier';

/**
 * 관리자 화면이 잡·단계를 손으로 돌리는 창구.
 *
 *   POST /jobs/:job/run      잡 하나(hira = 1~12단계 순서대로)
 *   POST /stages/:job/run    단계 하나(hira.7)
 *
 * **관리자 콘솔이 배치 프로세스를 직접 부른다.** 큐를 거치지 않는 것은 사람이 버튼을 누른
 * 자리이기 때문이다 — 받아들였는지 이미 도는 중인지 배치가 떠 있기는 한지를 그 자리에서
 * 답해야 하는데, 큐에 넣으면 그 셋이 전부 "넣었다" 하나로 뭉개진다.
 *
 * ## 누가 부른 것인지 어떻게 아나
 *
 * 관리자 API 가 자기 개인키로 서명한 짧은 토큰을 싣고, 여기서 그쪽 JWKS 의 공개키로 검증한다.
 *
 * **대칭 비밀을 나눠 갖지 않는 것이 요점이다.** 같은 문자열을 양쪽에 두면 이 프로세스의
 * 환경변수나 로그에서 한 번 새는 순간 위조가 가능해지는데, 여기에는 검증에 쓸 공개키밖에
 * 없어서 새어도 아무것도 못 만든다. 공개키 사본조차 두지 않아, 관리자가 키를 바꿔도
 * 이 프로세스는 배포하지 않는다.
 *
 * 토큰이 붙지 않은 요청은 거절한다. 헬스체크와 같은 포트이지만 이쪽은 값이 비싼 일을 시킨다.
 */
@Controller()
export class BatchJobRunController {
  private readonly logger = new Logger(BatchJobRunController.name);

  constructor(
    private readonly batch: BatchService,
    private readonly lock: JobLockService,
    @Inject(RUN_VERIFIER) private readonly verifier: RemoteJwksVerifier | null,
  ) {}

  /**
   * 잡 하나를 지금 돌린다.
   *
   * **끝날 때까지 기다리지 않는다.** 적재는 길면 한 시간이 넘어 HTTP 로 붙들고 있을 수 없다.
   * 받아들였다는 것만 답하고, 진행과 결과는 콘솔이 보던 자리(batch_job · batch_job_history)에
   * 그대로 쌓인다 — 크론으로 돈 회차와 같은 표에 source 만 ADMIN 으로 남는다.
   *
   * **스케줄이 꺼져 있어도 돈다.** 끈다는 것은 "정해진 시각에 저절로 돌지 마라" 이지
   * "이 작업을 봉인하라" 가 아니다(단계 off 는 반대다. 그건 수동 실행도 막는다).
   */
  @Post('jobs/:job/run')
  @HttpCode(202)
  async run(@Param('job') job: string, @Headers('authorization') authorization?: string) {
    const claims = await this.authorize('job', job, authorization);

    const definition = findBatchJob(job);
    if (!definition) {
      throw new NotFoundException(`Unknown job: ${job}`);
    }

    /*
      **락을 먼저 들여다본다.** 겹침을 실제로 막는 것은 아래의 run 안에 있는 락이지만,
      거기서 걸린 요청은 회차 이력에 SKIPPED 로만 남아 버튼을 누른 사람에게는 침묵으로 보인다.
      흔한 경우를 여기서 걸러 "이미 돌고 있다" 를 즉시 돌려준다.
    */
    if (await this.lock.isHeld(job)) {
      throw new ConflictException(`Job ${job} is already running`);
    }

    /*
      **본문을 받지 않는다.** 무엇을 돌릴지·전부 다시 받을지가 전부 서명된 토큰 안에 있다.
      본문으로도 받으면 "서명된 값" 과 "그냥 실린 값" 이 공존하고, 어느 쪽을 믿는지 헷갈리는
      순간이 곧 구멍이다.
    */
    const force = claims.force;
    this.logger.log(`${job}: manual run requested by admin ${claims.sub} (force=${force})`);

    /*
      **Sentry 크론 감시로 감싸지 않는다.** 그 감시는 "정해진 시각에 돌았나" 를 보는 것이라,
      예정에 없던 수동 회차를 체크인으로 넣으면 다음 크론이 밀렸는지가 가려진다.
      실패는 예외로 따로 보고한다.
    */
    void this.batch.run(definition, { source: BatchRunSource.ADMIN, force }).catch(() => {
      // 기록과 Sentry 보고는 BatchService 의 가드가 이미 했다. 여기서 또 하면
      // 한 실패가 이슈 두 개가 된다 — 띄워 놓고 안 기다리므로 삼키는 것이 맞다.
    });

    return { job, accepted: true };
  }

  /**
   * 단계 하나만 지금 돌린다. `hira.7` 처럼 단계 키를 받는다.
   *
   * **잡 전체와 자리를 나눈 이유는 도는 범위가 다르기 때문이다.** 잡(`hira`)은 1~12단계를
   * 순서대로 돌고 이건 지목한 하나만 돈다 — 한 단계만 고쳐 확인할 때 나머지까지 원본
   * 호출을 쓰지 않아도 된다.
   *
   * 회차를 열지 않으므로 콘솔의 "수동 실행" 영역에 뜬다(BatchService.runStage 참고).
   */
  @Post('stages/:job/run')
  @HttpCode(202)
  async runStage(@Param('job') job: string, @Headers('authorization') authorization?: string) {
    const claims = await this.authorize('stage', job, authorization);

    // 코드가 모르는 단계는 돌릴 수 없다. 카탈로그가 정본이다.
    const spec = stageCatalog().find((row) => row.job === job);
    if (!spec) {
      throw new NotFoundException(`Unknown stage: ${job}`);
    }

    if (await this.lock.isHeld(job)) {
      throw new ConflictException(`Stage ${job} is already running`);
    }

    this.logger.log(
      `${job}: manual stage run requested by admin ${claims.sub} (force=${claims.force})`,
    );

    void this.batch
      .runStage(spec, { source: BatchRunSource.ADMIN, force: claims.force })
      .catch(() => {
        // 기록과 Sentry 보고는 BatchService 의 가드가 이미 했다. 여기서 또 하면
        // 한 실패가 이슈 두 개가 된다 — 띄워 놓고 안 기다리므로 삼키는 것이 맞다.
      });

    return { job, accepted: true };
  }

  /**
   * 요청을 들여다보고 누가 보낸 것인지 확인한다.
   *
   * **이름과 종류를 토큰과 대조한다.** 토큰이 어딘가에서 새더라도 그 안에 적힌 하나로 묶인다 —
   * 값싼 단계를 돌리라고 받은 토큰으로 원본 한도를 태우는 잡을 돌릴 수 없다.
   */
  private async authorize(
    kind: BatchRunTarget,
    job: string,
    authorization?: string,
  ): Promise<BatchRunTokenClaims> {
    if (!this.verifier) {
      /*
        서명자 주소가 설정돼 있지 않다. **열어 두지 않는다** — 검증할 수 없는 상태에서
        받아 주면 이 포트에 닿는 누구나 적재를 돌릴 수 있다.
      */
      throw new ServiceUnavailableException(
        'Manual runs are not accepted (admin.jwt.issuer is not set)',
      );
    }

    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : undefined;
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    let claims: BatchRunTokenClaims;
    try {
      claims = await this.verifier.verify<BatchRunTokenClaims>(token);
    } catch {
      // 만료·서명 불일치·aud 불일치를 갈라 알려 주지 않는다.
      this.logger.warn(`${job}: rejected a manual run request (invalid token)`);
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (claims.job !== job || claims.kind !== kind) {
      this.logger.warn(`${job}: token was issued for ${claims.kind} ${claims.job}`);
      throw new UnauthorizedException('Invalid or expired token');
    }
    return claims;
  }
}
