import { Inject, Injectable, Logger } from '@nestjs/common';

import { ElasticsearchService } from '../elasticsearch.service';
import { SEARCH_CONFIG, type SearchConfig } from '../search.config';
import { HEALTHCARE_HOSPITAL_ALIAS } from '../schema/index';
import { HealthcareHospitalIndexRepository } from './healthcare-hospital-index.repository';
import {
  buildHealthcareHospitalDoc,
  HealthcareHospitalDoc,
} from './healthcare-hospital-doc';

export interface SyncResult {
  total: number;
  indexed: number;
  failed: number;
}

/**
 * 병원 데이터 색인. **현재 alias 가 가리키는 인덱스에 in-place 로** upsert 한다.
 * 스키마 버전 교체(v1→v2)는 여기 관심사가 아니다 — 그건 SearchSchemaService 몫이다.
 */
@Injectable()
export class HealthcareHospitalIndexService {
  private readonly logger = new Logger(HealthcareHospitalIndexService.name);

  /** 이 서비스가 색인하는 인덱스(=alias) 이름. sync 가 이 인덱스만 ensure 하도록 노출한다. */
  readonly indexName = HEALTHCARE_HOSPITAL_ALIAS;

  constructor(
    private readonly es: ElasticsearchService,
    private readonly repo: HealthcareHospitalIndexRepository,
    @Inject(SEARCH_CONFIG) private readonly config: SearchConfig,
  ) {}

  private get client() {
    return this.es.client;
  }

  /**
   * 활성 병원 전량을 alias 인덱스에 bulk upsert. keyset 커서로 흘리며 helpers.bulk 가
   * 청크·백프레셔를 처리한다. onProgress(진행, 전체)로 진행률을 흘린다 —
   * 전체는 색인 전에 1회 세어(countActive) 퍼센트를 낼 수 있게 넘긴다.
   */
  async syncAll(
    onProgress?: (processed: number, total: number) => void,
  ): Promise<SyncResult> {
    const alias = HEALTHCARE_HOSPITAL_ALIAS;
    const batchSize = this.config.batchSize;
    const [grandTotal, regionParents] = await Promise.all([
      this.repo.countActive(),
      this.repo.loadRegionParents(),
    ]);

    let processed = 0;
    const repo = this.repo;

    async function* docs(): AsyncGenerator<HealthcareHospitalDoc> {
      let cursor = 0;
      for (;;) {
        const rows = await repo.loadBatch(cursor, batchSize);
        if (rows.length === 0) {
          return;
        }
        cursor = rows[rows.length - 1].hospital.id;
        for (const row of rows) {
          processed += 1;
          if (onProgress && processed % batchSize === 0) {
            onProgress(processed, grandTotal);
          }
          yield buildHealthcareHospitalDoc(row, regionParents);
        }
      }
    }

    const result = await this.client.helpers.bulk<HealthcareHospitalDoc>({
      datasource: docs(),
      // require_alias: alias 가 아닌 곳(맨이름 인덱스·미존재)에 쓰면 ES 가 인덱스를 자동 생성하지
      // 않고 에러를 낸다 — 예전에 alias 없이 색인해 'healthcare_hospital' 맨이름 인덱스가 생긴 사고 방지.
      onDocument: (doc) => ({
        index: { _index: alias, _id: String(doc.id), require_alias: true },
      }),
      refreshOnCompletion: alias,
    });

    if (onProgress) {
      onProgress(processed, grandTotal);
    }

    return {
      total: processed,
      indexed: result.successful,
      failed: result.failed,
    };
  }

  /** alias 인덱스의 문서를 전량 비운다(인덱스·매핑은 그대로). 삭제 건수 반환. */
  async clearData(): Promise<number> {
    const alias = HEALTHCARE_HOSPITAL_ALIAS;
    const result = await this.client.deleteByQuery({
      index: alias,
      query: { match_all: {} },
      refresh: true,
    });
    return Number(result.deleted ?? 0);
  }

  /** 특정 병원 1건 색인. 없으면(비활성/미존재) found:false. */
  async syncOne(id: number): Promise<{ found: boolean }> {
    const row = await this.repo.loadOne(id);
    if (!row) {
      return { found: false };
    }
    const regionParents = await this.repo.loadRegionParents();
    const doc = buildHealthcareHospitalDoc(row, regionParents);
    await this.client.index({
      index: HEALTHCARE_HOSPITAL_ALIAS,
      id: String(id),
      document: doc,
      refresh: true,
    });
    return { found: true };
  }

  /** 특정 병원 1건 삭제. 없어도 조용히 지나간다. */
  async deleteOne(id: number): Promise<{ deleted: boolean }> {
    const result = await this.client.delete(
      { index: HEALTHCARE_HOSPITAL_ALIAS, id: String(id), refresh: true },
      { ignore: [404] },
    );
    return { deleted: result?.result === 'deleted' };
  }
}
