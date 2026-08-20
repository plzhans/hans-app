/**
 * 외부 서비스 바로가기 링크.
 *
 * 환경마다 주소가 달라지는 것만 env 로 받고, 나머지는 여기 박는다.
 *
 * **?? 가 아니라 || 다.** 키만 적고 값을 비워 두는 일이 있는데(누수 방지), ?? 는 빈 문자열을
 * 통과시켜 링크가 죽는다. 다만 || 의 기본값이 운영 주소라 **빠뜨려도 조용히 넘어간다** —
 * 실제로 세 파일 모두에 키가 없어서 develop 포털이 운영 문서·사이트로 보내고 있었다.
 */
export const LINKS = {
  // medifinder 는 환경마다 주소가 다르고 규칙으로 유도할 수 없어(`develop.` 접두에 도메인
  // 자체도 다름) `.env.*` 세 곳에 모두 적는다.
  medifinder:
    (import.meta.env.VITE_LINK_MEDIFINDER as string | undefined) ||
    'https://medifinder.kr',

  // 환경 구분이 없는 것들. env 로 받을 이유가 없다.
  //
  // docs 는 **포털과 같은 도메인의 /docs** 다(plzhans.com/docs · develop.plzhans.com/docs,
  // 로컬은 이 콘솔이 /docs 를 문서 dev 서버로 프록시). 상대경로라 세 환경 모두 같은 값으로
  // 맞는다 — 예전엔 기본값이 운영 주소라 키를 빠뜨리면 develop 포털이 조용히 운영 문서로
  // 보냈는데(실제로 그랬다), 상대경로에는 그 실패가 아예 없다.
  docs: '/docs',
  blog: 'https://blog.plzhans.com',
  telegramExporter: 'https://telegram-exporter.plzhans.com',
};
