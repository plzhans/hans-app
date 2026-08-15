import * as Sentry from '@sentry/nestjs';

/**
 * Sentry 로 보낼 시간을 얼마나 기다릴지(ms).
 *
 * **부팅 실패는 이미 배포가 깨진 상황이라 몇 초 더 늦어도 손해가 없다.** 반대로 안 기다리면
 * 이벤트가 아예 안 나간다 — 전송은 비동기인데 프로세스가 곧바로 죽기 때문이다.
 *
 * 그렇다고 무한정 기다릴 수는 없다. Sentry 가 응답하지 않을 때 컨테이너가 안 죽으면
 * 오케스트레이터의 재시작·헬스체크 판단이 그만큼 밀린다.
 */
const FLUSH_TIMEOUT_MS = 3_000;

/**
 * **부팅에서 죽었다는 것을 Sentry 로 알린다.**
 *
 * 요청 처리 중 나는 오류는 전역 예외 필터가 보고한다. 하지만 부팅 실패는 그 필터가 서기도
 * 전에 나므로 아무도 안 알린다 — CI 로 배포되는 서비스에서는 이게 가장 아쉬운 자리다.
 * 컨테이너가 재시작을 반복하는 것을 누군가 로그를 열어 보기 전까지 모르게 된다.
 *
 * **flush 가 핵심이다.** captureException 만 부르고 `process.exit()` 하면 이벤트가 큐에 담긴
 * 채로 프로세스가 죽는다 — 보고한 줄 알았는데 아무것도 안 간다. 그래서 이 함수를 기다린 뒤에
 * 종료해야 한다.
 *
 * @param error   던져진 것. Error 가 아니어도 Sentry 가 알아서 감싼다.
 * @param enabled Sentry 가 실제로 켜졌는지(= DSN 이 있어 init 이 돌았는지). 꺼져 있으면
 *   captureException 은 어차피 no-op 이지만, 그때 3초를 기다릴 이유가 없어 바로 돌아간다.
 */
export async function reportBootFailure(error: unknown, enabled: boolean): Promise<void> {
  if (!enabled) return;

  Sentry.captureException(error, {
    // **요청 오류와 갈라 놓는다.** 부팅 실패는 배포를 되돌릴지 판단하는 신호라, 같은 스트림에
    // 섞이면 "요청 하나가 실패했다" 와 구분되지 않는다.
    level: 'fatal',
    tags: { phase: 'boot' },
  });

  await Sentry.flush(FLUSH_TIMEOUT_MS);
}
