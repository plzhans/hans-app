/**
 * 사이트맵 XML 직렬화.
 *
 * 줄바꿈해서 낸다. 사람이 소스를 열어 확인하는 일이 실제로 있고, 늘어나는 바이트는
 * 전송 시 압축된다. 규격의 50MB 상한은 압축 전 기준이지만 URL 4만 개 기준 8MB 남짓이라
 * 여유가 있다.
 */

/** XML 텍스트에서 뜻이 있는 문자. 병원 이름이 아니라 URL 만 담지만 규칙은 지킨다. */
function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&apos;';
    }
  });
}

export interface SitemapEntry {
  loc: string;
  /**
   * 이 페이지의 다른 언어판. 구글은 각 언어판이 자기 자신을 포함한 모든 판을
   * 나열하기를 요구한다. 비어 있으면 xhtml 네임스페이스를 아예 안 쓴다.
   */
  alternates?: { hreflang: string; href: string }[];
  /**
   * 마지막 수정 시각(ISO). 값이 없으면 생략한다.
   *
   * 지어내면 안 된다. 전부 같은 날짜로 채우면 구글은 그 사이트의 lastmod 를 통째로
   * 무시한다 — 없는 것보다 나쁘다.
   */
  lastmod?: string;
}

export function renderUrlSet(entries: SitemapEntry[]): string {
  const usesAlternates = entries.some((e) => e.alternates?.length);
  const ns = [
    'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    ...(usesAlternates ? ['xmlns:xhtml="http://www.w3.org/1999/xhtml"'] : []),
  ].join(' ');

  const body = entries
    .map((entry) => {
      const lines = [`    <loc>${escapeXml(entry.loc)}</loc>`];
      if (entry.lastmod) {
        lines.push(`    <lastmod>${entry.lastmod}</lastmod>`);
      }
      for (const alt of entry.alternates ?? []) {
        lines.push(
          `    <xhtml:link rel="alternate" hreflang="${alt.hreflang}" href="${escapeXml(alt.href)}"/>`,
        );
      }
      return `  <url>\n${lines.join('\n')}\n  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset ${ns}>\n${body}\n</urlset>\n`;
}

export interface IndexEntry {
  loc: string;
  /**
   * 이 조각 안에서 가장 최근 lastmod. 값이 없으면 생략한다.
   *
   * 생성 시각을 적지 않는다 — 내용이 그대로여도 매 회차 달라져서, 구글에게 전 조각이
   * 바뀌었다고 말하게 된다.
   */
  lastmod?: string;
}

export function renderIndex(entries: IndexEntry[]): string {
  const body = entries
    .map((entry) => {
      const lines = [`    <loc>${escapeXml(entry.loc)}</loc>`];
      if (entry.lastmod) {
        lines.push(`    <lastmod>${entry.lastmod}</lastmod>`);
      }
      return `  <sitemap>\n${lines.join('\n')}\n  </sitemap>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`;
}
