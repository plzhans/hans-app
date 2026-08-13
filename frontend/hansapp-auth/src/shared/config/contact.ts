/**
 * 노출용 대표 이메일. VITE_CONTACT_EMAIL 로 주입되며 빌드 시 번들에 인라인된다.
 *
 * **약관·방침에 적힌 연락처는 이 값이 아니다.** 그쪽은 @hansapp/legal 의 문서 안에 박혀 있다 —
 * 문서의 연락처를 바꾸는 것은 개정이라 공지 대상이고, 환경(local/develop/production)마다
 * 달라져서도 안 된다. 여기 값은 화면 장식이라 둘의 성격이 다르다. 다만 어긋나 보이면 곤란하니
 * 바꿀 때 함께 고친다.
 */
export const CONTACT_EMAIL =
  (import.meta.env.VITE_CONTACT_EMAIL as string | undefined) ??
  'plzhans@gmail.com';
