import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  HealthcareHospitalDoc,
  HealthcareHospitalIndexer,
  HEALTHCARE_HOSPITAL_ALIAS,
  SearchSchemaService,
  SEARCH_CONFIG,
  type SearchConfig,
} from '@hansapp/search';

import { buildHealthcareHospitalDoc } from './healthcare-index-doc';
import { HealthcareIndexRepository } from './healthcare-index.repository';

/** ES 색인 결과. API sync 의 SyncResult(totalCount/upserted…)와 다른 개념이라 이름을 가른다. */
export interface IndexResult {
  /** DB 에서 읽어 처리 시도한 총 건수. total = indexed + failed + skipped 로 맞아떨어진다. */
  total: number;
  /** ES 가 색인에 성공한 건수 */
  indexed: number;
  /** ES 로 보냈으나 문서가 거부된 건수(매핑 오류 등) */
  failed: number;
  /** 문서 **변환** 실패로 ES 에 보내지도 못하고 건너뛴 건수. 0 보다 크면 데이터/코드 문제 신호다. */
  skipped: number;
}

/**
 * 색인 진행 콜백. target 은 지금 색인 중인 **실제 인덱스명**이다 — reindex 는 매번 새 버전
 * 인덱스(name-vN)에 넣으므로, 어디에 색인 중인지 화면에 보여줄 수 있게 넘긴다.
 */
export type IndexProgress = (
  processed: number,
  total: number,
  target: string,
) => void;

/** blue-green 재색인 결과. IndexResult(색인 통계) + 스왑/정리 정보. */
export interface ReindexResult extends IndexResult {
  /** 이번에 새로 만들어 색인한 버전 인덱스명(name-vN). */
  newIndex: string;
  /** 검증(가드)을 통과해 alias 를 newIndex 로 스왑했는가. false 면 라이브는 옛 인덱스 그대로다. */
  swapped: boolean;
  /** 스왑 성공 후 삭제한 옛 버전 인덱스들. 스왑 안 했으면 빈 배열. */
  droppedIndices: string[];
}

/**
 * 재색인 스왑 가드. 새 인덱스에 **활성 대상의 이 비율 이상**이 실제 색인됐을 때만 alias 를 넘긴다.
 * 버그·ES 장애로 몇 건만 들어간 인덱스로 라이브를 갈아치우는 사고를 막는다(1 = 전건 성공 요구).
 */
const SWAP_MIN_SUCCESS_RATIO = 0.95;

/**
 * 병원 ES 색인 오케스트레이션. **DB(healthcare_*) → 문서 조립 → ES 반영**을 잇는다.
 *
 * 계층 경계가 여기서 만난다:
 *   · DB 읽기        HealthcareIndexRepository (Prisma, admin 소유)
 *   · 문서 조립       buildHealthcareHospitalDoc (스키마 정본, @hansapp/search 소유)
 *   · ES 쓰기        HealthcareHospitalIndexer (ES 프리미티브, @hansapp/search 소유)
 *
 * 통합빌드(HealthcareBuildService)의 다음 단계라 그 옆(admin/healthcare)에 둔다. 외부 API 를
 * 안 쓰므로 서비스키가 없어도 돈다 — 필요한 건 DB + ES 뿐이다.
 */
@Injectable()
export class HealthcareIndexService {
  private readonly logger = new Logger(HealthcareIndexService.name);

  constructor(
    private readonly repo: HealthcareIndexRepository,
    private readonly indexer: HealthcareHospitalIndexer,
    // 버전 인덱스 생성·alias 스왑·옛 버전 정리. 순수 ES/스키마라 search 가 소유한다.
    private readonly schema: SearchSchemaService,
    @Inject(SEARCH_CONFIG) private readonly config: SearchConfig,
  ) {}

  /** 색인 대상 alias 의 **물리 이름**(env 접두사 포함, develop-healthcare_hospital). 진행 표시·상태용. */
  get indexName(): string {
    return this.indexer.indexName;
  }

  /**
   * **논리 이름**(healthcare_hospital). 스키마 op(ensure·createNextVersion·swapAlias)은 이 이름으로
   * INDEX_DEFINITIONS 를 찾고, env 접두사는 SearchSchemaService 가 내부에서 붙인다. 물리 이름을
   * 넘기면 레지스트리 조회가 실패하니(등록되지 않은 인덱스), 스키마 op 에는 반드시 이걸 쓴다.
   */
  readonly logicalName = HEALTHCARE_HOSPITAL_ALIAS;

  /**
   * **in-place 색인.** 활성 병원 전량을 현재 alias 인덱스에 그대로 bulk upsert 한다(라이브 인덱스를
   * 덮어쓴다). 빠르지만 **stale(비활성·삭제된 병원의 잔여 문서)은 지우지 않는다** — 그건 reindex 다.
   */
  syncAll(onProgress?: IndexProgress): Promise<IndexResult> {
    return this.indexAll(this.indexer.indexName, onProgress);
  }

  /**
   * **무중단 재색인(blue-green).** 새 버전 인덱스에 전량 색인한 뒤 검증에 통과하면 alias 를 원자
   * 스왑하고 옛 버전을 전부 지운다. **stale 이 구조적으로 남지 않는다**(새 인덱스는 활성 DB 그대로).
   *
   * 흐름: 새 버전 생성(라이브 무손상) → 그 인덱스에 색인 → 가드(대부분 색인됐나) → 통과 시 스왑 →
   * 옛 버전 삭제. **가드 실패 시 스왑하지 않고 새 인덱스만 버린다** — 라이브(옛 인덱스)는 그대로라
   * 깨진 색인이 서비스를 망가뜨릴 수 없다(in-place sweep 방식의 "몇 건만 색인 → 전체 삭제" 함정 제거).
   */
  async reindex(onProgress?: IndexProgress): Promise<ReindexResult> {
    // 스키마 op 은 **논리 이름**으로 부른다(env 접두사는 SearchSchemaService 가 내부에서 붙인다).
    // 1) 새 버전 인덱스 생성 — 라이브 alias 는 건드리지 않는다. 반환은 물리 인덱스명.
    const newIndex = await this.schema.createNextVersion(this.logicalName);

    // 2) 전량을 새 인덱스에 색인.
    const result = await this.indexAll(newIndex, onProgress);

    // 3) 가드: 활성 대상의 대부분이 실제로 색인됐을 때만 스왑한다.
    const healthy =
      result.total > 0 &&
      result.indexed >= result.total * SWAP_MIN_SUCCESS_RATIO;
    if (!healthy) {
      this.logger.error(
        `재색인 결과 비정상(indexed=${result.indexed}/${result.total}, failed=${result.failed}, skipped=${result.skipped}) — alias 스왑 중단. 새 인덱스 ${newIndex} 를 삭제하고 라이브는 옛 인덱스로 유지한다.`,
      );
      await this.schema.dropIndex(newIndex);
      return { ...result, newIndex, swapped: false, droppedIndices: [] };
    }

    // 4) alias 원자 스왑(논리 이름). 반환값은 방금 물러난 라이브 인덱스(직전 alias 대상).
    const previous = await this.schema.swapAlias(this.logicalName, newIndex);

    // 5) **직전 라이브 인덱스만** 삭제한다. 그보다 오래된 버전(v1 등)은 다른 목적으로 살아있을 수
    //    있으므로 건드리지 않는다 — 스왑이 alias 에서 뗀 것만 정리한다.
    for (const old of previous) {
      await this.schema.dropIndex(old);
    }

    return { ...result, newIndex, swapped: true, droppedIndices: previous };
  }

  /**
   * 활성 병원 전량을 **지정한 인덱스(target)** 에 bulk upsert 하는 공통 색인 루프. keyset 커서로
   * 배치를 흘리며 문서를 조립해 인덱서에 넘긴다(전량을 메모리에 안 올린다). syncAll(alias)·reindex
   * (새 버전 인덱스)가 이 하나를 공유한다. onProgress(진행, 전체)로 진행률을 흘린다.
   *
   * **한 건의 변환 실패로 전체 색인을 중단하지 않는다.** 8만 건 중 한 병원 데이터가 이상해 buildDoc 이
   * 던져도, 그 건만 건너뛰고(skipped++, warn 로그) 나머지를 계속 색인한다 — 제너레이터 밖으로 예외를
   * 흘리면 bulk 전체가 죽기 때문이다. 대신 **조용히 삼키지 않는다**: 건너뛴 건수를 결과(skipped)로
   * 올리고 병원 id 를 로그로 남긴다. skipped 가 크면 코드/스키마 문제 신호다(호출부가 그 수로 판단).
   *
   * 예외: DB 읽기 실패(loadBatch throw)는 건너뛰지 않는다 — 그건 특정 행이 아니라 연결·쿼리 문제라
   * 계속해봐야 같은 실패다. 그대로 던져 전체를 멈춘다.
   */
  private async indexAll(
    target: string,
    onProgress?: IndexProgress,
  ): Promise<IndexResult> {
    const batchSize = this.config.batchSize;
    const [grandTotal, regionParents] = await Promise.all([
      this.repo.countActive(),
      this.repo.loadRegionParents(),
    ]);

    let processed = 0;
    let skipped = 0;
    // async function* 안에서는 this 가 인스턴스가 아니므로 미리 꺼내 캡처한다.
    const repo = this.repo;
    const logger = this.logger;

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
            onProgress(processed, grandTotal, target);
          }
          let doc: HealthcareHospitalDoc;
          try {
            doc = buildHealthcareHospitalDoc(row, regionParents);
          } catch (error) {
            // 이 한 건만 버리고 계속. 조용히 넘기지 않고 집계+로그로 드러낸다.
            skipped += 1;
            logger.warn(
              `병원 ${row.hospital.id} 문서 변환 실패 — 건너뜀: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
            continue;
          }
          yield doc;
        }
      }
    }

    const { indexed, failed } = await this.indexer.bulkIndex(docs(), target);

    if (onProgress) {
      onProgress(processed, grandTotal, target);
    }

    if (skipped > 0) {
      logger.warn(
        `문서 변환 실패로 ${skipped}건을 건너뛰고 색인했다 — 개별 병원 id 는 위 경고 로그 참고.`,
      );
    }

    return { total: processed, indexed, failed, skipped };
  }

  /**
   * **대사(reconcile).** sync(upsert) 뒤에 붙여, **DB 에 없거나 비활성이 된 병원 문서를 정리**한다.
   * 활성 병원 id 집합을 "유지 대상"으로 삼아, ES 에서 그 집합에 없는 문서를 지운다(집합 차집합).
   * 하드 삭제(행 사라짐)와 status≠active(비활성) 를 **한 번에** 잡는다 — 활성 아닌 건 전부 걸린다.
   *
   * **활성 id 가 0건이면 대사를 건너뛴다** — DB 조회가 빈 집합을 주면 ES 를 통째로 비우는 사고가
   * 나기 때문이다(정상적으로 활성 병원이 0인 상황은 없다). 삭제 건수 반환(스킵 시 0).
   */
  async reconcile(): Promise<number> {
    const keepIds = await this.repo.loadActiveIds();
    if (keepIds.size === 0) {
      this.logger.error(
        '활성 병원 id 가 0건 — 대사를 건너뛴다(ES 전체 삭제 방지). DB 조회를 확인하라.',
      );
      return 0;
    }
    const removed = await this.indexer.deleteAbsent(keepIds);
    if (removed > 0) {
      this.logger.log(`대사: DB 에 없는(비활성 포함) 문서 ${removed}건 삭제`);
    }
    return removed;
  }

  /** alias 인덱스의 문서를 전량 비운다(인덱스·매핑은 그대로). 삭제 건수 반환. */
  clearData(): Promise<number> {
    return this.indexer.clearData();
  }

  /** 특정 병원 1건 색인. 없으면(비활성/미존재) found:false. */
  async syncOne(id: number): Promise<{ found: boolean }> {
    const row = await this.repo.loadOne(id);
    if (!row) {
      return { found: false };
    }
    const regionParents = await this.repo.loadRegionParents();
    await this.indexer.indexOne(buildHealthcareHospitalDoc(row, regionParents));
    return { found: true };
  }

  /** 특정 병원 1건 삭제. 없어도 조용히 지나간다. */
  deleteOne(id: number): Promise<{ deleted: boolean }> {
    return this.indexer.deleteOne(id);
  }
}
