/** 만들어진 사이트맵 파일 하나. 디스크에 쓰기 전의 상태다. */
export interface SitemapFile {
  /** 파일 이름. 객체 키의 마지막 조각이기도 하다. */
  name: string;
  body: string;
  /** 이 파일이 담은 URL 수. 본문을 다시 세지 않으려고 만들 때 기록해 둔다. */
  locCount: number;
}
