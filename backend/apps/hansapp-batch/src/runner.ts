import { hostname } from 'node:os';

import { buildInfo } from './boot-config';

/**
 * 이 프로세스가 누구인가. 이력·헬스체크가 같은 값을 본다.
 *
 * **어디서 도는지 모르는 배치가 실제로 있었다.** 옛 빌드가 어딘가에 떠서 회차를 계속
 * 만드는데 이력에 실행 주체가 없어 호스트를 특정하지 못했다. 두 군데서 따로 만들면
 * 값이 갈릴 수 있어 한 곳에서 만들어 나눠 쓴다.
 */
export const RUNNER = {
  hostname: hostname(),
  pid: process.pid,
  version: buildInfo.version,
} as const;
