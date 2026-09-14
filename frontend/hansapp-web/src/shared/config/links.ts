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

  // docs 는 **환경마다 호스트가 다르다.** 운영은 루트 도메인으로 갈라져 나갔고
  // (plzhans.com/docs), develop 은 아직 이 콘솔 밑이며(develop-console.plzhans.com/docs),
  // 로컬은 이 콘솔이 문서 dev 서버로 프록시한다.
  //
  // **기본값을 상대경로로 둔다.** medifinder 와 반대다 — 여기서 기본값을 운영 주소로 두면
  // 키를 빠뜨린 develop 이 운영 문서로 새는데, 상대경로면 자기 도메인의 /docs 로 떨어져
  // develop·로컬이 그대로 맞는다. 운영만 키를 적으면 된다.
  docs: (import.meta.env.VITE_LINK_DOCS as string | undefined) || '/docs',

  // 포털(루트 도메인의 랜딩). 콘솔에서 되돌아가는 유일한 통로다 —
  // 랜딩은 콘솔·문서를 가리키는데 콘솔에서 올라가는 길이 없으면 참조가 한쪽으로만 흐른다.
  portal:
    (import.meta.env.VITE_LINK_PORTAL as string | undefined) ||
    'https://plzhans.com',

  // 환경 구분이 없는 것들. env 로 받을 이유가 없다.
  blog: 'https://blog.plzhans.com',
  telegramExporter: 'https://telegram-exporter.plzhans.com',
};
