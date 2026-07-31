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
  // 환경마다 주소가 다르다. 규칙으로 유도할 수 없어(docs 는 `develop-` 접두, medifinder 는
  // `develop.` 접두에 도메인 자체도 다름) `.env.*` 세 곳에 모두 적는다.
  medifinder:
    (import.meta.env.VITE_LINK_MEDIFINDER as string | undefined) ||
    'https://medifinder.kr',
  docs:
    (import.meta.env.VITE_LINK_DOCS as string | undefined) ||
    'https://docs.plzhans.com',

  // 환경 구분이 없는 것들. env 로 받을 이유가 없다.
  blog: 'https://blog.plzhans.com',
  telegramExporter: 'https://telegram-exporter.plzhans.com',
};
