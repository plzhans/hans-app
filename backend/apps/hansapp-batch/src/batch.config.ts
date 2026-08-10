import type { ConfigSource } from '@hansapp/common';

/** 배치 설정 토큰 */
export const BATCH_CONFIG = Symbol('BATCH_CONFIG');

export interface BatchConfig {
  /**
   * 실행 시각 (크론식). 기본은 매일 04:00.
   * 원본 갱신주기가 일 1회라 새벽에 한 번이면 충분하다.
   */
  readonly cron: string;

  /**
   * 인증 부산물(세션·인가코드·이메일 인증) 정리 크론식.
   *
   * 적재(cron)와 **따로 둔다.** 성격이 다른 일이라 주기도 시간대도 같이 갈 이유가 없고,
   * 적재가 길어지거나 실패해도 정리는 제 시간에 돌아야 한다.
   */
  readonly authCleanupCron: string;

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
  // 전부 비밀 아닌 값 → getX(config/config.yaml 또는 환경변수 BATCH_CRON 등).
  return {
    cron: source.getStringOrDefault('apps-batch.cron'),
    authCleanupCron: source.getStringOrDefault(
      'apps-batch.authCleanupCron',
      '30 4 * * *',
    ),
    maxCallsPerRun:
      source.getNumberOrDefault('apps-batch.maxCallsPerRun') || undefined,
  };
}
