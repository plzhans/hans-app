/**
 * 관리자 이메일 다루기. **계정을 만드는 곳과 고치는 곳이 같은 규칙을 쓴다.**
 *
 * 두 통로가 각자 판단하면 한쪽으로 만든 계정과 다른 쪽으로 고친 계정의 성질이 갈린다 —
 * 대소문자만 다른 이메일이 두 개 생기거나, 로그인할 수 없는 주소로 바뀌어 버린다.
 */

/** 저장·대조에 쓰는 모양. 로그인 때도 같은 함수를 거쳐 비교한다. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * 로그인 DTO 의 IsEmail 이 통과시킬 모양인지 본다.
 *
 * 완전한 RFC 5322 검사가 아니다 — 그건 여기서 할 일이 아니고, 목적은 "만들어 놓고 로그인이
 * 안 되는 계정" 을 막는 것뿐이다. 공백 없이 `@` 하나, 도메인에 점이 하나 이상이면 된다.
 */
export function isEmailLike(email: string): boolean {
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email);
}
