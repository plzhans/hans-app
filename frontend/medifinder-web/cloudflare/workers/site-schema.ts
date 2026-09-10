/**
 * 서비스 자체를 설명하는 구조화 데이터. 홈에서만 내보낸다.
 * 개별 병원을 설명하는 것은 hospital-schema.ts 다.
 */
import { script } from './jsonld';

/**
 * SearchAction 은 검색 결과에 사이트 내 검색창을 띄우는 신호다. 붙인다고 반드시
 * 뜨지는 않지만 없으면 후보에도 안 오른다.
 */
export function siteJsonLd(siteUrl: string, canonical: string, lang: string): string {
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
        url: canonical,
        inLanguage: lang,
        publisher: { '@id': `${siteUrl}/#organization` },
        potentialAction: {
          '@type': 'SearchAction',
          // 검색 화면이 읽는 쿼리 이름과 같아야 한다(useSearchState 의 `q`).
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${canonical.replace(/\/$/, '')}/search?q={search_term_string}`,
          },
          'query-input': 'required name=search_term_string',
        },
      },
    ],
  };
  return script(data);
}

