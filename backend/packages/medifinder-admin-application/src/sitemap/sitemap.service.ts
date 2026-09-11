import { Injectable, Logger } from '@nestjs/common';

import { InjectConfig, type MedifinderConfig } from '../config';
import { HospitalCollectorService, type CollectedByTier } from './hospital-collector.service';
import type { SitemapFile } from './sitemap-file';
import { LANGS_BY_TIER, TIERS, URLS_PER_FILE, fileName, langPath, type Lang } from './sitemap-plan';
import { renderIndex, renderUrlSet, type IndexEntry, type SitemapEntry } from './sitemap-render';
import { validateSitemaps } from './sitemap-validate';
import { SitemapWriterService } from './sitemap-writer.service';

export interface BuildOptions {
  /** 받아 올 최대 건수. 개발용이다. */
  limit?: number;
  /**
   * 이 수보다 적게 나오면 실패시킨다.
   *
   * API 가 반쯤 죽어 8만 건이 3만 건으로 오는 일이 있는데, 그대로 덮으면 색인에서
   * 5만 페이지가 한꺼번에 빠진다. 값을 안 주면 검사하지 않는다.
   */
  minUrls?: number;
}

export interface BuildResult {
  dir: string;
  files: SitemapFile[];
  total: number;
}

/**
 * 사이트맵을 만든다.
 *
 * 만들기와 올리기를 나눈 이유는, 만들다 실패했을 때 R2 에 손을 안 대기 위해서다.
 * 산출물은 디렉터리에 남으므로 눈으로 확인한 뒤 올릴 수 있다.
 */
@Injectable()
export class SitemapService {
  private readonly logger = new Logger(SitemapService.name);

  constructor(
    @InjectConfig() private readonly config: MedifinderConfig,
    private readonly collector: HospitalCollectorService,
    private readonly writer: SitemapWriterService,
  ) {}

  async build(dir: string, options: BuildOptions = {}): Promise<BuildResult> {
    const byTier = await this.collector.collect(options.limit);
    const files = this.render(byTier);
    const total = files.reduce((sum, file) => sum + file.locCount, 0);

    this.logger.log(`파일 ${files.length}개 / URL ${total}개`);

    const problems = validateSitemaps(files, this.config.siteUrl);
    if (options.minUrls !== undefined && total < options.minUrls) {
      problems.push(`total ${total} URLs is below the expected minimum of ${options.minUrls}.`);
    }
    if (problems.length > 0) {
      throw new Error(`Sitemap validation failed:\n  - ${problems.join('\n  - ')}`);
    }

    const written = await this.writer.write(dir, files);
    return { dir: written, files, total };
  }

  private render(byTier: CollectedByTier): SitemapFile[] {
    const siteUrl = this.config.siteUrl;
    const files: SitemapFile[] = [];

    for (const tier of TIERS) {
      const hospitals = byTier[tier];
      if (hospitals.length === 0) continue;

      const langs = LANGS_BY_TIER[tier];
      const chunks = chunk(hospitals, URLS_PER_FILE);

      for (const lang of langs) {
        for (const [index, part] of chunks.entries()) {
          const entries = part.map((hospital) =>
            toEntry(hospital.id, lang, langs, siteUrl, hospital.updatedAt),
          );
          files.push({
            name: fileName(tier, lang, index + 1, chunks.length),
            body: renderUrlSet(entries),
            locCount: entries.length,
          });
        }
      }
    }

    // 인덱스의 lastmod 는 **이 파일을 실제로 다시 만든 시각**이다. 우리가 아는 사실이라
    // 지어내는 값이 아니다 — 병원의 lastmod 와 근거가 다르다.
    const generatedAt = new Date().toISOString();
    const index: IndexEntry[] = files.map((file) => ({
      loc: `${siteUrl}/${file.name}`,
      lastmod: generatedAt,
    }));
    files.push({
      name: 'sitemap.xml',
      body: renderIndex(index),
      locCount: index.length,
    });

    return files;
  }
}

/**
 * 한 병원의 한 언어판.
 *
 * alternates 에 자기 자신을 포함한 모든 언어판을 넣는다 — 구글이 그렇게 요구한다.
 * 한 언어만 내는 tier 는 alternates 를 붙이지 않는다. 자기 하나만 나열하는 것은
 * 아무 정보도 아니고 파일만 키운다.
 */
function toEntry(
  id: number,
  lang: Lang,
  langs: readonly Lang[],
  siteUrl: string,
  lastmod?: string,
): SitemapEntry {
  const bare = `/hospitals/${id}`;
  return {
    loc: `${siteUrl}${langPath(bare, lang)}`,
    lastmod,
    alternates:
      langs.length > 1
        ? langs.map((l) => ({ hreflang: l, href: `${siteUrl}${langPath(bare, l)}` }))
        : undefined,
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
