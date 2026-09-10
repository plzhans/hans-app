import { LANGS, langPath, type Lang } from './routing';
import type { Meta } from './meta';

/**
 * 공유 미리보기에 쓸 기본 그림. **public/og.png 로 배포된다.**
 *
 * 로고와 워드마크만 있고 문구가 없다 — ko·en-us·ja·zh-hans 어디서 떠도 어색하지 않게
 * 일부러 로케일 중립으로 만들었다. 페이지마다 자기 그림이 생기면 그때 이걸 밀어낸다.
 *
 * **바뀌는 값을 굽지 않는다.** 엔드포인트 경로나 병원 수 같은 걸 넣으면 서비스가 바뀔 때마다
 * 그림이 거짓말을 하는데, 정작 그림은 아무도 다시 안 만든다.
 */
const DEFAULT_OG_IMAGE = '/og.png';
const OG_IMAGE_SIZE = { width: 1200, height: 630 };

/**
 * <head> 에 덧붙일 태그들.
 *
 * canonical·hreflang 은 지금 화면이 JS 로 넣고 있어 **봇에게는 없는 것과 같다.**
 * 여기서 넣으면 응답 HTML 에 그대로 실린다.
 */
export function headTags(o: {
  meta: Meta;
  lang: Lang;
  path: string;
  siteUrl: string;
  /** 이 페이지만의 그림. 없으면 기본 그림을 쓴다(지금은 어느 페이지도 주지 않는다). */
  image?: string;
}) {
  const canonical = `${o.siteUrl}${langPath(o.path, o.lang)}`;

  // 절대 URL 이어야 한다 — 공유 봇은 상대 경로를 못 푼다.
  const image = o.image ?? DEFAULT_OG_IMAGE;
  const imageUrl = /^https?:\/\//.test(image) ? image : `${o.siteUrl}${image}`;
  const alternates = LANGS.map(
    (l) => `<link rel="alternate" hreflang="${l}" href="${o.siteUrl}${langPath(o.path, l)}">`,
  );

  /*
    **줄바꿈과 들여쓰기를 넣어 이어 붙인다.** 한 줄로 붙이면 소스 보기에서 13개 태그가
    가로로 끝없이 이어져 사람이 읽을 수 없다. 늘어나는 바이트는 십수 바이트뿐이고,
    그마저 전송 시 압축된다 — 읽을 수 있는 쪽이 낫다.

    앞에 개행을 하나 두는 것은 index.html 의 마지막 <head> 태그 뒤에 붙기 때문이다.
  */
  const tags = [
    o.meta.noindex ? `<meta name="robots" content="noindex, follow">` : null,
    `<link rel="canonical" href="${canonical}">`,
    ...alternates,
    // 언어가 안 맞으면 여기로 — 기본 언어 URL 이다.
    `<link rel="alternate" hreflang="x-default" href="${o.siteUrl}${o.path}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="MediFinder">`,
    `<meta property="og:url" content="${canonical}">`,
    `<meta property="og:title" content="${esc(o.meta.title)}">`,
    `<meta property="og:description" content="${esc(o.meta.description)}">`,
    `<meta property="og:image" content="${imageUrl}">`,
    // 크기를 알려주면 미리보기가 그림을 받기 전에 자리를 잡는다. 없으면 늦게 뜨거나 안 뜬다.
    `<meta property="og:image:width" content="${OG_IMAGE_SIZE.width}">`,
    `<meta property="og:image:height" content="${OG_IMAGE_SIZE.height}">`,
    `<meta property="og:image:alt" content="${esc(o.meta.title)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    // 병원 상세에서만 붙는다. 다른 화면에서는 undefined 라 아래에서 걸러진다.
    o.meta.jsonLd ?? null,
  ].filter((tag): tag is string => !!tag);

  // 앞에 개행을 하나 두는 것은 index.html 의 마지막 <head> 태그 뒤에 이어 붙기 때문이다.
  return `\n    ${tags.join('\n    ')}`;
}

/** 속성값에 들어가므로 따옴표까지 막는다. 병원 이름에 &·" 가 들어올 수 있다. */
function esc(text: string) {
  return text.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string,
  );
}
