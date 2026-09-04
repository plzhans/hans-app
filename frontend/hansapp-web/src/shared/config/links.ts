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

  // docs 는 **루트 도메인의 /docs** 고 이 콘솔은 console. 서브도메인이라 환경마다 절대 주소를
  // 적는다(plzhans.com/docs · develop.plzhans.com/docs). 로컬만 상대경로다 — 이 콘솔이
  // /docs 를 문서 dev 서버로 프록시한다. 기본값을 상대경로로 두는 이유: 키를 빠뜨리면
  // 콘솔 자신의 /docs 로 가서 곧바로 눈에 띈다(운영 주소를 기본값으로 두면 조용히 넘어간다).
  docs: (import.meta.env.VITE_LINK_DOCS as string | undefined) || '/docs',

  // 환경 구분이 없는 것들. env 로 받을 이유가 없다.
  blog: 'https://blog.plzhans.com',
  telegramExporter: 'https://telegram-exporter.plzhans.com',
};
