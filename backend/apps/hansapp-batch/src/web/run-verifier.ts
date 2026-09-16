import { BATCH_RUN_AUDIENCE } from '@hansapp/common';
import { RemoteJwksVerifier } from '@hansapp/jwt';

/**
 * 수동 실행 요청을 검증하는 쪽. **설정이 없으면 null 이고, 그러면 그 기능이 꺼진다.**
 *
 * 토큰으로 주입하는 것은 이 값이 설정에서 나오기 때문이다 — 컨트롤러가 ConfigSource 를
 * 직접 들면 설정 키가 컨트롤러마다 흩어진다.
 */
export const RUN_VERIFIER = Symbol('RUN_VERIFIER');

export function buildRunVerifier(adminIssuer?: string): RemoteJwksVerifier | null {
  if (!adminIssuer) return null;
  return new RemoteJwksVerifier(
    // **발급자 주소가 곧 공개키 주소다.** 표준 자리(RFC 8414)라 따로 설정하지 않는다.
    `${adminIssuer}/.well-known/jwks.json`,
    BATCH_RUN_AUDIENCE,
    // 같은 값을 iss 로도 요구한다. 공개키를 저기서 받아 왔으니 저기가 발급자여야 맞다.
    adminIssuer,
    'BatchRunVerifier',
  );
}
