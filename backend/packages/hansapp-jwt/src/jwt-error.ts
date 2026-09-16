/**
 * 토큰을 믿을 수 없다. **왜인지는 담지 않는다.**
 *
 * 만료인지 서명 불일치인지 모르는 kid 인지를 갈라 알려 주면 공격자에게 힌트가 된다.
 * 부르는 쪽이 자기 계층의 에러(도메인 코드가 붙은 것)로 바꿔 던진다.
 */
export class JwtVerifyError extends Error {
  constructor(message = 'Invalid or expired token.') {
    super(message);
    this.name = 'JwtVerifyError';
  }
}
