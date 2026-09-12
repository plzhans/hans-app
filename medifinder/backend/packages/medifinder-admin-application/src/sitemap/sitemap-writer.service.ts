import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Injectable, Logger } from '@nestjs/common';

import { InjectConfig, type MedifinderConfig } from '../config';
import type { SitemapFile } from './sitemap-file';
import { outputDir } from './output-dir';

/** 이 디렉터리에서 우리 것으로 간주하는 파일. 지울 때와 올릴 때 같은 기준을 쓴다. */
const OURS = /^sitemap[\w-]*\.(xml|json)$/;

/**
 * 만든 사이트맵을 지정한 경로에 쓴다.
 *
 * **쓰기 전에 이전 산출물을 지운다.** 병원이 줄어 조각 수가 5개에서 4개가 되면 지난 회차의
 * `-5` 가 남는데, 올리는 쪽은 디렉터리를 보고 올리므로 인덱스에 없는 파일이 R2 에 쌓이고
 * 그 안의 URL 은 계속 살아 있게 된다.
 */
@Injectable()
export class SitemapWriterService {
  private readonly logger = new Logger(SitemapWriterService.name);

  constructor(@InjectConfig() private readonly config: MedifinderConfig) {}

  /** `--out` 아래의 실제 산출 위치. 쓰는 쪽과 읽는 쪽이 같은 규칙을 쓰게 한 곳에 둔다. */
  resolve(base: string): string {
    return outputDir(base, this.config.appEnv);
  }

  async write(dir: string, files: SitemapFile[]): Promise<string> {
    const target = this.resolve(dir);
    await mkdir(target, { recursive: true });
    await this.clear(target);

    for (const file of files) {
      await writeFile(path.join(target, file.name), file.body, 'utf8');
    }

    this.logger.log(`${target} 에 ${files.length}개 파일을 썼다`);
    return target;
  }

  /** 디렉터리에서 올릴 대상을 이름순으로 읽는다. upload 커맨드가 쓴다. */
  async list(dir: string): Promise<string[]> {
    const target = this.resolve(dir);
    // 환경이 어긋나면 여기서 걸린다 — develop 으로 만든 것을 production 으로 올리려는 경우다.
    const names = await readdir(target).catch(() => {
      throw new Error(
        `No sitemap directory at ${target}. Run "sitemap build" with the same MEDIFINDER_APP_ENV.`,
      );
    });
    return names.filter((name) => OURS.test(name)).sort();
  }

  private async clear(target: string): Promise<void> {
    const names = await readdir(target);
    for (const name of names) {
      if (OURS.test(name)) {
        await rm(path.join(target, name));
      }
    }
  }
}
