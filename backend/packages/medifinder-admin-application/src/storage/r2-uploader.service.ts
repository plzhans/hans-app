import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { AwsClient } from 'aws4fetch';
import { Injectable, Logger } from '@nestjs/common';

import { InjectConfig, requireR2, type MedifinderConfig, type R2Config } from '../config';

const XML = 'application/xml; charset=utf-8';

/**
 * R2 업로드.
 *
 * R2 는 S3 호환 API 만 제공하고, 그건 SigV4 서명을 요구한다. AWS SDK 전체를 끌어오는 대신
 * 서명만 하는 aws4fetch 를 쓴다 — 우리가 쓰는 것은 PutObject 하나뿐이다.
 */
@Injectable()
export class R2UploaderService {
  private readonly logger = new Logger(R2UploaderService.name);

  constructor(@InjectConfig() private readonly config: MedifinderConfig) {}

  /**
   * 디렉터리의 파일들을 접두사 아래로 올린다.
   *
   * **인덱스(sitemap.xml)를 맨 나중에 올린다.** 먼저 올리면 아직 없는 조각을 가리키는
   * 순간이 생기고, 그 사이에 크롤러가 오면 404 를 본다. 조각이 다 있는 상태에서 인덱스가
   * 바뀌는 편이 안전하다.
   */
  async uploadDir(dir: string, names: string[]): Promise<void> {
    const target = requireR2(this.config);
    const client = this.client(target);
    const endpoint = `https://${target.accountId}.r2.cloudflarestorage.com/${target.bucket}`;

    const ordered = [
      ...names.filter((n) => n !== 'sitemap.xml'),
      ...names.filter((n) => n === 'sitemap.xml'),
    ];

    for (const name of ordered) {
      const body = await readFile(path.join(path.resolve(dir), name), 'utf8');
      const key = `${target.prefix}/${name}`;
      await this.put(client, endpoint, key, body);
      this.logger.log(`업로드 ${key}`);
    }
  }

  private client(target: R2Config): AwsClient {
    return new AwsClient({
      accessKeyId: target.accessKeyId,
      secretAccessKey: target.secretAccessKey,
      // R2 는 리전이 없지만 SigV4 는 요구한다. auto 가 R2 가 받는 값이다.
      region: 'auto',
      service: 's3',
    });
  }

  private async put(client: AwsClient, endpoint: string, key: string, body: string): Promise<void> {
    const res = await client.fetch(`${endpoint}/${key}`, {
      method: 'PUT',
      body,
      headers: { 'content-type': XML },
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`PUT ${key} → HTTP ${res.status} ${res.statusText} ${detail.slice(0, 300)}`);
    }
  }
}
