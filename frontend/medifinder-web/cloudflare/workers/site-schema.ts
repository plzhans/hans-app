/**
 * 서비스 자체를 설명하는 구조화 데이터. 홈에서만 내보낸다.
 * 개별 병원을 설명하는 것은 hospital-schema.ts 다.
 */
import { script } from './jsonld';
import { LANGS, type Lang } from './routing';

/**
 * SearchAction 은 검색 결과에 사이트 내 검색창을 띄우는 신호다. 붙인다고 반드시
 * 뜨지는 않지만 없으면 후보에도 안 오른다.
 *
 * Organization·WebSite 는 언어와 무관한 하나의 실체다. @id 가 전역 식별자라, 언어마다
 * 다른 url·inLanguage 를 같은 @id 에 달면 같은 노드에 대해 모순된 사실을 주장하게 된다.
 * 페이지마다 달라지는 것은 WebPage 로 따로 낸다.
 */
export function siteJsonLd(siteUrl: string, canonical: string, lang: Lang): string {
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${siteUrl}/#organization`,
        name: 'MediFinder',
        url: siteUrl,
        // 정사각 아이콘이다. 구글은 로고에 112x112 이상을 요구한다.
        logo: `${siteUrl}/apple-touch-icon.png`,
      },
      {
        '@type': 'WebSite',
        '@id': `${siteUrl}/#website`,
        name: 'MediFinder',
        url: siteUrl,
        inLanguage: [...LANGS],
        publisher: { '@id': `${siteUrl}/#organization` },
        potentialAction: {
          '@type': 'SearchAction',
          // 검색 화면이 읽는 쿼리 이름과 같아야 한다(useSearchState 의 `q`).
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${siteUrl}/search?q={search_term_string}`,
          },
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'WebPage',
        '@id': `${canonical}#webpage`,
        url: canonical,
        inLanguage: lang,
        isPartOf: { '@id': `${siteUrl}/#website` },
      },
    ],
  };
  return script(data);
}
