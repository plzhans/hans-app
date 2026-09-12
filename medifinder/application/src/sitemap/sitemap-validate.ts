/**
 * 만든 사이트맵을 내보내기 전에 검사한다.
 *
 * **검사가 걸리면 업로드를 하지 않는다.** 잘못된 사이트맵으로 덮는 것보다 어제 것이
 * 그대로 살아 있는 편이 낫다 — 색인은 잘못 제출한 순간에 빠지고, 되돌려도 다시 잡히는 데
 * 몇 주가 걸린다.
 */
import type { SitemapFile } from './sitemap-file';

/** 규격 상한. 파일 하나에 URL 50,000개, 압축 전 50MB 를 넘길 수 없다. */
const MAX_URLS_PER_FILE = 50_000;
const MAX_BYTES_PER_FILE = 50 * 1024 * 1024;

/**
 * 어긋난 것들을 문장으로 돌려준다. 빈 배열이면 이상 없다.
 *
 * 첫 문제에서 멈추지 않는 이유는, 고치는 사람이 한 번에 다 보는 편이 낫기 때문이다.
 */
export function validateSitemaps(files: SitemapFile[], siteUrl: string): string[] {
  const problems: string[] = [];

  for (const file of files) {
    const locs = [...file.body.matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => match[1]);

    if (locs.length === 0) {
      problems.push(`${file.name}: has no <loc>.`);
    }
    if (locs.length > MAX_URLS_PER_FILE) {
      problems.push(`${file.name}: ${locs.length} URLs exceeds the limit of ${MAX_URLS_PER_FILE}.`);
    }

    const bytes = Buffer.byteLength(file.body, 'utf8');
    if (bytes > MAX_BYTES_PER_FILE) {
      problems.push(`${file.name}: ${bytes} bytes exceeds the limit of ${MAX_BYTES_PER_FILE}.`);
    }

    const duplicate = firstDuplicate(locs);
    if (duplicate) {
      problems.push(`${file.name}: duplicate <loc> ${duplicate}.`);
    }

    // 사이트 주소가 틀리면 전부 다른 사이트의 URL 이 된다. 구글은 자기 소유가 아닌
    // 도메인의 URL 을 무시하므로, 통째로 색인되지 않고도 오류는 안 난다.
    const stray = locs.find((loc) => !loc.startsWith(siteUrl));
    if (stray) {
      problems.push(`${file.name}: <loc> ${stray} is outside ${siteUrl}.`);
    }
  }

  return problems;
}

function firstDuplicate(values: string[]): string | undefined {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return undefined;
}
