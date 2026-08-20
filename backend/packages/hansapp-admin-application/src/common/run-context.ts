import { BatchRunSource } from '@hansapp/common';

/**
 * 한 실행이 어디서 왔나. 이력 표(sync_state_history 등)에 그대로 적힌다.
 *
 * **기본값이 CLI 라는 게 이 설계의 핵심이다.** hanscli 는 이 값을 넘기지 않아도 맞는 값이
 * 들어가고, 배치만 자기가 CRON 인지 ONCE 인지 명시한다. 그래서 CLI 쪽 코드는 한 줄도
 * 고치지 않았다 — 나중에 관리자 화면이 붙어도 거기서만 ADMIN 을 넘기면 된다.
 */
export interface RunContext {
  /**
   * 어느 잡 회차에 속했나(batch_job_history.id).
   *
   * 잡 회차 밖에서 돈 것 — hanscli 로 단계 하나만 돌린 경우 — 은 없다.
   * 그 구분이 곧 "사람이 손으로 돌린 것" 을 가려내는 방법이다.
   */
  readonly jobRunId?: bigint;

  readonly source: BatchRunSource;
}

/**
 * 아무도 안 넘겼을 때의 실행 출처.
 *
 * 배치는 항상 자기 값을 넘기므로, 여기로 떨어지는 것은 사람이 부른 경우뿐이다.
 */
export const CLI_RUN_CONTEXT: RunContext = { source: BatchRunSource.CLI };
