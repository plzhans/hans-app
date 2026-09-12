export { MedifinderApplicationModule } from './medifinder-application.module';
export {
  MEDIFINDER_CONFIG,
  InjectConfig,
  requireR2,
  type HansApiConfig,
  type MedifinderConfig,
  type R2Config,
} from './config';
export { describeError } from './common/error';

export { SitemapService, type BuildOptions, type BuildResult } from './sitemap/sitemap.service';
export type { CollectProgress } from './sitemap/hospital-collector.service';
export { SitemapWriterService } from './sitemap/sitemap-writer.service';
export { R2UploaderService } from './storage/r2-uploader.service';
export type { SitemapFile } from './sitemap/sitemap-file';
export { outputDir } from './sitemap/output-dir';
export {
  LANGS,
  LANGS_BY_TIER,
  TIERS,
  URLS_PER_FILE,
  DEFAULT_LANG,
  type Lang,
  type Tier,
} from './sitemap/sitemap-plan';
