/**
 * 게시판 URL 을 hans-api 에서 읽어 온다. 빌드가 sitemap-board.xml 을 굽는 데 쓴다.
 *
 * **왜 빌드가 부르는가.** 사이트맵은 자기 호스트의 URL 만 실을 수 있어서
 * (console.plzhans.com 의 사이트맵은 console 주소만), 백엔드가 만들어 api.plzhans.com 에
 * 두면 라우팅 브리지가 따로 필요하다. 빌드가 구우면 메인 워커가 그냥 준다 — 새 인프라가 없다.
 *
 * **URL 모양은 여기서 만든다.** /board/:name/:id 는 이 앱의 라우터가 정하는 것이라, 백엔드에
 * 옮겨 적으면 정본이 둘이 된다(medifinder 의 STATIC_PATHS 가 그렇게 백엔드에 가 있다).
 * 백엔드는 데이터만 주고 주소 조립은 라우트를 아는 쪽이 한다.
 *
 * **헤더를 붙이지 않는다.** 게시판 API 는 @Public 이고, 서버에서 부르면 Origin 이 없어
 * CORS 분기를 그냥 지난다. X-Client-Id 는 공개값이라 서버 호출에서는 대조할 Origin 이 없어
 * 장식이 된다 — medifinder 의 CLI 도 같은 이유로 안 쓴다(transport.ts 참고).
 */

/** 한 번에 받을 글 수. 서버가 @Max(50) 으로 막는다(board.dto.ts). */
const PAGE_SIZE = 50;

/** 한 게시판에서 넘길 최대 페이지 수. 응답이 이상할 때 무한히 도는 것을 막는 바닥이다. */
const MAX_PAGES = 200;

/** 한 번의 호출이 이만큼 넘으면 포기한다. CI 가 네트워크에 매달려 멈추지 않게. */
const TIMEOUT_MS = 10_000;

/**
 * 재시도 횟수. **운영 빌드는 이 호출이 실패하면 배포가 선다** — 일시적인 429·5xx 하나로
 * 배포가 막히지 않게 몇 번 물러섰다 다시 건다. medifinder 의 hans-api transport 도 같은
 * 이유로 재시도를 그쪽 fetch 안에 두고 있다.
 */
const MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface Board {
  name: string;
}

interface Post {
  id: number;
  /** 비공개 글. 목록에는 오지만 본문이 없어서 사이트맵에 실으면 빈 페이지가 색인된다. */
  secret: boolean;
  publishedAt?: string | null;
}

interface PageResponse<T> {
  items: T[];
  page: number;
  totalPages: number;
}

/** 사이트맵에 실을 주소 한 줄. */
export interface BoardUrl {
  path: string;
  /** W3C 날짜(YYYY-MM-DD). 모르면 비운다 — 지어내면 크롤러가 lastmod 를 안 믿게 된다. */
  lastmod?: string;
}

async function getJson<T>(url: string): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    const last = attempt >= MAX_RETRIES;

    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (cause) {
      // 못 닿았거나 시간이 다 됐다. 남았으면 물러섰다 다시 건다.
      if (last) throw new Error(`GET ${url} 실패`, { cause });
      await sleep(2 ** attempt * 1000);
      continue;
    }

    if (response.ok) {
      return (await response.json()) as T;
    }

    /*
      4xx 는 다시 걸어도 같은 답이다(게시판이 없으면 404). 바로 던진다.
      429·5xx 만 물러선다 — 서버가 얼마나 기다리라고 했으면 그 값을 따른다.
    */
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || last) {
      throw new Error(`GET ${url} → HTTP ${String(response.status)}`);
    }

    const retryAfter = Number(response.headers.get('retry-after'));
    const waitMs =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 2 ** attempt * 1000;
    console.warn(
      `[hansapp-web] HTTP ${String(response.status)} — ${String(waitMs)}ms 뒤 재시도 (${String(attempt + 1)}/${String(MAX_RETRIES)})`,
    );
    await sleep(waitMs);
  }
}

/** ISO 시각에서 날짜만. 값이 없거나 모양이 아니면 undefined. */
function toDate(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const date = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
}

/**
 * 게시판 목록과 글 목록을 훑어 사이트맵에 실을 주소를 만든다.
 *
 * 닿지 못하거나 응답이 오류면 **던진다.** 빈 사이트맵을 조용히 내보내는 것보다 부르는 쪽이
 * 알고 판단하는 편이 낫다 — 게시판이 실제로 없어서 빈 배열이 오는 것과, API 가 죽어서
 * 아무것도 못 받은 것은 다른 일이다.
 */
export async function collectBoardUrls(apiBaseUrl: string): Promise<BoardUrl[]> {
  const base = apiBaseUrl.replace(/\/+$/, '');
  const boards = await getJson<Board[]>(`${base}/boards`);

  const urls: BoardUrl[] = [];

  for (const board of boards) {
    const name = encodeURIComponent(board.name);
    const posts: BoardUrl[] = [];

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const result = await getJson<PageResponse<Post>>(
        `${base}/boards/${name}/posts?page=${String(page)}&size=${String(PAGE_SIZE)}`,
      );

      for (const post of result.items) {
        // 비공개 글은 뺀다. 크롤러가 받는 것이 본문 없는 껍데기라 실을 값이 없다.
        if (post.secret) continue;
        posts.push({
          path: `/board/${name}/${String(post.id)}`,
          lastmod: toDate(post.publishedAt),
        });
      }

      if (page >= result.totalPages) break;
    }

    /*
      게시판 목록 화면. lastmod 는 가장 최근 글의 날짜다 — 목록이 바뀌는 시점이 그때라서,
      글이 없으면 적을 값이 없으므로 비운다.
    */
    const newest = posts
      .map((post) => post.lastmod)
      .filter((date): date is string => Boolean(date))
      .sort()
      .at(-1);

    urls.push({ path: `/board/${name}`, lastmod: newest }, ...posts);
  }

  return urls;
}
