import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Injectable, Logger } from '@nestjs/common';

import type { SitemapFile } from './sitemap-file';

/** 이 디렉터리에서 우리 것으로 간주하는 파일. 지울 때와 올릴 때 같은 기준을 쓴다. */
const OURS = /^sitemap[\w-]*\.xml$/;

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

  async write(dir: string, files: SitemapFile[]): Promise<string> {
    const target = path.resolve(dir);
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
    const target = path.resolve(dir);
    const names = await readdir(target);
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
