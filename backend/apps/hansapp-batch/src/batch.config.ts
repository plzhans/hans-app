import type { ConfigSource } from '@hansapp/common';

import { BATCH_JOBS, type BatchJobName } from './batch.jobs';

/** 배치 설정 토큰 */
export const BATCH_CONFIG = Symbol('BATCH_CONFIG');

export interface BatchConfig {
  /**
   * 잡별 크론식. 키는 잡 이름이다.
   *
   * **잡마다 따로 둔다.** 원본이 다르면 갱신주기도 한도도 장애도 따로 논다 — 심평원을
   * 하루 두 번 받고 싶을 때 다른 적재까지 같이 끌려가면 안 된다.
   * 설정 키는 `apps-batch.jobs.<이름>.cron` 이고, 안 적으면 잡 정의의 기본값을 쓴다.
   */
  readonly crons: Readonly<Record<BatchJobName, string>>;

  /**
   * 위 크론식들을 해석할 타임존.
   *
   * **비워 두면 컨테이너 TZ 를 따라간다** — UTC 컨테이너에서 `0 4 * * *` 은 KST 13:00 이다.
   * Sentry 의 크론 감시도 같은 값을 받아야 정상 실행을 "늦음" 으로 보지 않는다.
   */
  readonly timeZone: string;

  /**
   * 상주 모드가 여는 포트. **한 컴퓨터에 하나만 띄우는 가드를 겸한다.**
   *
   * 이미 떠 있으면 EADDRINUSE 로 부팅이 실패한다 — Node 에는 flock 이 없어서, 프로세스가
   * 죽으면 커널이 회수해 주는 성질을 포트에서 빌린다(잠금 파일은 kill -9 뒤에 남아
   * 영영 막는다. 실제로 sync_state 잠금에서 그 사고를 겪었다).
   *
   * **여러 대에 띄우는 것은 막지 않는다.** 그건 Redis 잡 락이 맡는다 — 이건 머신 단위다.
   */
  readonly webPort: number;

  /** 어느 주소에 붙을까. 기본은 로컬만. 컨테이너 헬스체크를 받으려면 0.0.0.0. */
  readonly bindAddress: string;

  /**
   * 실행당 콜 상한. **일일 한도와는 다른 것이다.**
   *
   * 일일 한도(NMC API 별 1,000 / HIRA API 별 10,000)는 우리가 세지 않는다. 세면 반드시 어긋난다 —
   * 실패한 콜이 한도에 잡히는지, 다른 프로세스가 같은 키를 쓰는지 알 수 없기 때문이다.
   * 대신 원본이 resultCode 22 로 알려주면 그때 멈추고 다음 날 이어받는다.
   *
   * 이 값은 그 위에 얹는 **안전판**일 뿐이다. 0 이나 미설정이면 상한을 두지 않는다
   * (원본이 한도를 알려줄 때까지 계속 받는다).
   */
  readonly maxCallsPerRun?: number;
}

/**
 * 각 계층이 자기 설정을 스스로 뽑고 검증한다. process.env 를 직접 읽는 곳은 @hansapp/common 뿐이다.
 */
export function buildBatchConfig(source: ConfigSource): BatchConfig {
  // 전부 비밀 아닌 값 → getX(config/config.yaml 또는 환경변수 APPS_BATCH_JOBS_HIRA_CRON 등).
  const crons = Object.fromEntries(
    BATCH_JOBS.map((job) => [
      job.name,
      source.getStringOrDefault(`apps-batch.jobs.${job.name}.cron`, job.defaultCron),
    ]),
  ) as Record<BatchJobName, string>;

  return {
    crons,
    timeZone: source.getStringOrDefault('apps-batch.timeZone'),
    webPort: source.getNumberOrDefault('apps-batch.web.port'),
    bindAddress: source.getStringOrDefault('apps-batch.web.bindAddress'),
    maxCallsPerRun: source.getNumberOrDefault('apps-batch.maxCallsPerRun') || undefined,
  };
}
