import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * 지금 도는 적재가 무엇인가. 로그가 자기 자리를 스스로 알게 하는 값이다.
 *
 * **인자로 넘기지 않는다.** 단계 서비스가 여는 스코프 하나가 그 아래 모든 호출에
 * 따라붙는다 — 하위 서비스가 열 개든 스무 개든 시그니처가 안 바뀐다.
 */
interface SyncScope {
  /** 콘솔이 쓰는 단계 키. `hira.1` · `nmc.2` · `hira.2.equipment` */
  readonly job: string;

  /**
   * 그 단계 안의 하위 작업. `subject` · `detail` 처럼 코드의 어느 덩어리인지를 말한다.
   * 단계가 여섯 덩어리로 나뉘는 경우(hira.1)에 어디쯤인지가 이걸로 갈린다.
   */
  step?: string;
}

/**
 * 스코프 보관소.
 *
 * **AsyncLocalStorage 는 await 사슬을 따라간다.** 스코프를 연 콜백 안에서 부른 것은
 * 몇 겹을 내려가도 같은 값을 본다 — 스프링의 MDC 와 같은 자리다.
 */
const storage = new AsyncLocalStorage<SyncScope>();

/** 이 단계를 도는 동안의 스코프를 연다. 단계 서비스만 부른다. */
export function runInSyncScope<T>(job: string, body: () => Promise<T>): Promise<T> {
  return storage.run({ job }, body);
}

/**
 * 하위 작업 이름을 바꾼다. **같은 스코프 안에서 덮어쓴다** — 단계 하나가 덩어리 여섯을
 * 순서대로 돌 때, 그때그때 어느 덩어리인지가 로그에 따라붙게 한다.
 */
export function setSyncStep(step: string): void {
  const scope = storage.getStore();
  if (scope) scope.step = step;
}

/**
 * 로그 앞에 붙일 말. **스코프 밖이면 빈 문자열**이라 평소 로그와 섞이지 않는다.
 *
 * 로거가 이 값을 읽는다 — 서비스는 자기가 어느 단계에서 불렸는지 몰라도 된다.
 */
export function syncScopeLabel(): string {
  const scope = storage.getStore();
  if (!scope) return '';
  return scope.step ? `${scope.job} ${scope.step} ` : `${scope.job} `;
}
