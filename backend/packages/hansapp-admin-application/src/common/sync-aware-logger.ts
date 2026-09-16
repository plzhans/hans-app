import { ConsoleLogger } from '@nestjs/common';

import { syncScopeLabel } from './sync-scope';

/**
 * 적재 스코프를 로그에 붙이는 전역 로거.
 *
 * **서비스는 아무것도 안 바꾼다.** 각자 `new Logger(XxxService.name)` 를 그대로 쓰고,
 * Nest 가 그 호출을 여기로 넘긴다(app.useLogger). 그래서 클래스 이름이 컨텍스트라는
 * 관례가 유지되면서, 어느 단계에서 불렸는지가 메시지 앞에 따라붙는다.
 *
 * ```
 * [HiraSubjectSyncService] hira.1 subject 3/40 01(내과) done — 3 calls · api 7.4s
 * [BatchService]           크론 회차처럼 스코프 밖에서 찍는 줄은 그대로다
 * ```
 *
 * **로거를 따로 만들어 서비스마다 갈아끼우지 않는 이유**가 여기 있다. 그러면 파일마다
 * import 가 바뀌고, 무엇보다 남이 찍는 로그(Nest 내부·라이브러리)는 태그를 못 단다.
 */
export class SyncAwareLogger extends ConsoleLogger {
  /*
    **문자열 인자일 때만 손댄다.** Nest 의 로거는 객체나 여러 인자를 받기도 하는데,
    그때까지 앞에 붙이려 들면 출력이 깨진다. 그런 호출은 그대로 흘려보낸다.
  */
  override log(message: unknown, ...rest: unknown[]): void {
    super.log(this.tag(message), ...(rest as []));
  }

  override debug(message: unknown, ...rest: unknown[]): void {
    super.debug(this.tag(message), ...(rest as []));
  }

  override warn(message: unknown, ...rest: unknown[]): void {
    super.warn(this.tag(message), ...(rest as []));
  }

  override error(message: unknown, ...rest: unknown[]): void {
    super.error(this.tag(message), ...(rest as []));
  }

  override verbose(message: unknown, ...rest: unknown[]): void {
    super.verbose(this.tag(message), ...(rest as []));
  }

  private tag(message: unknown): unknown {
    if (typeof message !== 'string') return message;
    const label = syncScopeLabel();
    return label ? `${label}${message}` : message;
  }
}
