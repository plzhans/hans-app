import { createHash } from 'node:crypto';

import type { SitemapFile } from './sitemap-file';

/** 배포된 산출물과 같이 올라가는 목록 파일 이름. */
export const MANIFEST_FILE = 'sitemap-manifest.json';

export interface SitemapManifest {
  /** 파일 이름 → 본문 sha256. 자기 자신은 담지 않는다. */
  files: Record<string, string>;
  /** 전체를 한 값으로 접은 것. 비교는 이것만 보면 된다. */
  digest: string;
}

/**
 * 지금 만든 것의 지문.
 *
 * 배포된 것과 견주어 같으면 올리지 않는다. 산출물이 결정적이라(내용이 같으면 바이트도
 * 같다) 이 비교가 성립한다 — 인덱스의 lastmod 를 생성 시각이 아니라 내용에서 유도하는
 * 이유가 그것이다.
 *
 * 파일별 해시도 담는 것은 무엇이 달라졌는지 보려는 것이다. 판정은 digest 하나로 한다.
 */
export function buildManifest(files: SitemapFile[]): SitemapManifest {
  const entries: Record<string, string> = {};
  for (const file of [...files].sort((a, b) => a.name.localeCompare(b.name))) {
    entries[file.name] = sha256(file.body);
  }
  return { files: entries, digest: sha256(JSON.stringify(entries)) };
}

/**
 * 배포된 매니페스트를 읽어 온다. 없거나 못 읽으면 undefined —
 * **그때는 그냥 올린다.** 판단이 안 서면 올리는 쪽이 안전하다.
 */
export async function fetchDeployedManifest(siteUrl: string): Promise<SitemapManifest | undefined> {
  try {
    const response = await fetch(`${siteUrl}/${MANIFEST_FILE}`);
    if (!response.ok) return undefined;
    const parsed: unknown = await response.json();
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as SitemapManifest).digest === 'string'
    ) {
      return parsed as SitemapManifest;
    }
  } catch {
    // 네트워크 실패·잘못된 JSON. 비교를 포기하고 올린다.
  }
  return undefined;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
