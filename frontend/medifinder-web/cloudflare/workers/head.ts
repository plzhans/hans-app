import { LANGS, langPath, type Lang } from './routing';
import type { Meta } from './meta';

/**
 * 공유 미리보기에 쓸 기본 그림. public/og.png 로 배포된다.
 * 로고와 워드마크뿐이고 문구가 없어 네 로케일 어디서 떠도 쓸 수 있다.
 *
 * 바뀌는 값(엔드포인트 경로·병원 수 등)을 그림에 굽지 말 것. 서비스가 바뀌어도
 * 그림은 아무도 다시 안 만든다.
 */
const DEFAULT_OG_IMAGE = '/og.png';
const OG_IMAGE_SIZE = { width: 1200, height: 630 };

/**
 * <head> 에 덧붙일 태그들.
 * canonical·hreflang 은 화면도 넣지만 그건 JS 를 실행하는 크롤러만 본다.
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

  // 줄바꿈해서 낸다. 한 줄로 붙이면 소스 보기에서 태그 13개가 가로로 이어져 못 읽는다.
  // 늘어나는 바이트는 전송 시 압축된다.
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

  // index.html 의 마지막 <head> 태그 뒤에 이어 붙으므로 앞에 개행을 하나 둔다.
  return `\n    ${tags.join('\n    ')}`;
}

/** 속성값에 들어가므로 따옴표까지 막는다. 병원 이름에 &·" 가 들어올 수 있다. */
function esc(text: string) {
  return text.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string,
  );
}
