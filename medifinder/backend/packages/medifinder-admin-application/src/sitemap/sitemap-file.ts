/** 만들어진 사이트맵 파일 하나. 디스크에 쓰기 전의 상태다. */
export interface SitemapFile {
  /** 파일 이름. 객체 키의 마지막 조각이기도 하다. */
  name: string;
  body: string;
  /** 이 파일이 담은 URL 수. 본문을 다시 세지 않으려고 만들 때 기록해 둔다. */
  locCount: number;
  /**
   * 이 파일 안에서 가장 최근 lastmod. 인덱스가 이 값을 쓴다.
   *
   * 생성 시각을 쓰지 않는 이유는 내용이 그대로여도 매번 달라지기 때문이다 — 구글에게는
   * 매 회차 전 조각이 바뀌었다고 말하는 셈이고, 우리도 바뀐 것이 있는지 비교할 수 없다.
   * 담긴 URL 에 lastmod 가 하나도 없으면 undefined 다.
   */
  lastmod?: string;
}
