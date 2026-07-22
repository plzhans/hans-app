import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import { Inject, Injectable, Logger } from '@nestjs/common';
import type { estypes } from '@elastic/elasticsearch';

import { ElasticsearchService } from '../elasticsearch.service';
import { SEARCH_CONFIG, type SearchConfig } from '../search.config';
import {
  COMPONENT_TEMPLATE_FILENAME,
  COMPONENT_TEMPLATE_NAME,
  INDEX_DEFINITIONS,
  aliasOf,
  indexPatternOf,
  initialIndexOf,
  resolveSchemaDir,
} from './index';

/** 정본 JSON 파일을 실행 시점에 읽어 파싱한다. */
async function readTemplate(file: string): Promise<Record<string, unknown>> {
  return JSON.parse(await fs.readFile(file, 'utf8')) as Record<string, unknown>;
}

/** import 결과 — 인덱스별 한 행. */
export interface IndexImportRow {
  name: string;
  aliasTarget: string;
  /** alias 가 새로 만들어졌으면 그 인덱스명, 이미 있었으면 undefined. */
  createdIndex?: string;
}

export interface SchemaImportResult {
  componentTemplate: string;
  indices: IndexImportRow[];
}

/** status — 인덱스별 한 행. */
export interface IndexStatusRow {
  name: string;
  aliasExists: boolean;
  /** alias 가 가리키는 실제 인덱스들(보통 1개). */
  indices: string[];
  indexTemplateExists: boolean;
  docCount?: number;
}

export interface SchemaStatus {
  componentTemplateExists: boolean;
  indices: IndexStatusRow[];
}

/**
 * ES 스키마/설정 관리. 코드 정본(schema/*.json)을 ES 에 적용하고, 살아있는 상태를 덤프하고,
 * 통째로 리셋한다. **데이터(문서)는 건드리지 않는다** — 그건 HealthcareHospitalIndexService 다.
 *
 * **여러 인덱스를 함께 다룬다.** INDEX_DEFINITIONS 를 순회하므로, 인덱스가 늘면(pharmacy…)
 * 이 서비스는 바뀌지 않고 레지스트리에 한 줄만 추가하면 된다.
 */
@Injectable()
export class SearchSchemaService {
  private readonly logger = new Logger(SearchSchemaService.name);

  /** 정본 JSON 을 읽어올 디렉터리(설정 우선, 없으면 패키지 동봉본). */
  readonly schemaDir: string;

  constructor(
    private readonly es: ElasticsearchService,
    @Inject(SEARCH_CONFIG) config: SearchConfig,
  ) {
    this.schemaDir = resolveSchemaDir(config.schemaDir);
  }

  private get client() {
    return this.es.client;
  }

  /** import 이 읽을 정본 파일 절대경로 목록(CLI 헤더 표시용). */
  templateFiles(): string[] {
    return [
      path.join(this.schemaDir, COMPONENT_TEMPLATE_FILENAME),
      ...INDEX_DEFINITIONS.map((d) =>
        path.join(this.schemaDir, d.templateFilename),
      ),
    ];
  }

  /**
   * 정본 적용(멱등). 공유 컴포넌트 템플릿 + 각 인덱스 템플릿을 올리고,
   * alias 가 없는 인덱스는 name-v1 을 만들어 연결한다. alias 가 이미 있으면 인덱스는 그대로 둔다.
   */
  async import(): Promise<SchemaImportResult> {
    await this.putComponentTemplate();

    const rows: IndexImportRow[] = [];
    for (const def of INDEX_DEFINITIONS) {
      await this.putIndexTemplate(def);
      rows.push(await this.createIndexIfMissing(def));
    }

    return { componentTemplate: COMPONENT_TEMPLATE_NAME, indices: rows };
  }

  /**
   * **한 인덱스만** 없으면 만든다(sync 가 자기 인덱스에 대해 색인 전에 호출).
   * alias 가 이미 있으면 아무것도 안 하고 undefined. 없으면 그 인덱스용 템플릿(공유 컴포넌트 +
   * 인덱스 템플릿)까지 올린 뒤 name-v1 을 만들고, **생성한 행을 반환**한다(createdIndex 채워짐).
   */
  async ensure(name: string): Promise<IndexImportRow | undefined> {
    const def = INDEX_DEFINITIONS.find((d) => d.name === name);
    if (!def) {
      throw new Error(`등록되지 않은 인덱스: ${name}`);
    }
    if (await this.client.indices.existsAlias({ name: aliasOf(def.name) })) {
      return undefined;
    }
    await this.putComponentTemplate();
    await this.putIndexTemplate(def);
    return this.createIndexIfMissing(def);
  }

  private async putComponentTemplate(): Promise<void> {
    await this.client.cluster.putComponentTemplate({
      name: COMPONENT_TEMPLATE_NAME,
      ...(await readTemplate(
        path.join(this.schemaDir, COMPONENT_TEMPLATE_FILENAME),
      )),
    } as estypes.ClusterPutComponentTemplateRequest);
    this.logger.log(`component template '${COMPONENT_TEMPLATE_NAME}' 적용`);
  }

  private async putIndexTemplate(def: {
    name: string;
    templateFilename: string;
  }): Promise<void> {
    await this.client.indices.putIndexTemplate({
      name: def.name,
      ...(await readTemplate(path.join(this.schemaDir, def.templateFilename))),
    });
    this.logger.log(`index template '${def.name}' 적용`);
  }

  /** alias 가 없으면 name-v1 생성 후 연결. 있으면 그대로 둔다. 생성 시에만 createdIndex 채운다. */
  private async createIndexIfMissing(def: {
    name: string;
  }): Promise<IndexImportRow> {
    const alias = aliasOf(def.name);
    if (await this.client.indices.existsAlias({ name: alias })) {
      this.logger.log(`alias '${alias}' 이미 존재 — 인덱스는 그대로 둔다`);
      return { name: def.name, aliasTarget: alias };
    }
    const initial = initialIndexOf(def.name);
    await this.client.indices.create({ index: initial });
    await this.client.indices.putAlias({ index: initial, name: alias });
    this.logger.log(`인덱스 '${initial}' 생성 + alias '${alias}' 연결`);
    return { name: def.name, aliasTarget: alias, createdIndex: initial };
  }

  /**
   * 살아있는 ES 상태를 파일로 덤프한다(배포 실물 백업·비교용). 코드 정본이 아니라
   * **클러스터에 실제 적용된 것**을 내보낸다.
   */
  async export(dir: string): Promise<string[]> {
    await fs.mkdir(dir, { recursive: true });
    const written: string[] = [];

    const write = async (name: string, body: unknown): Promise<void> => {
      const file = path.join(dir, name);
      await fs.writeFile(file, JSON.stringify(body, null, 2) + '\n', 'utf8');
      written.push(file);
    };

    const component = await this.client.cluster.getComponentTemplate({
      name: COMPONENT_TEMPLATE_NAME,
    });
    await write('component-template.hansapi-analysis.json', component);

    for (const def of INDEX_DEFINITIONS) {
      const template = await this.client.indices.getIndexTemplate({
        name: def.name,
      });
      await write(`index-template.${def.name}.json`, template);

      const alias = aliasOf(def.name);
      if (await this.client.indices.existsAlias({ name: alias })) {
        const settings = await this.client.indices.getSettings({
          index: alias,
        });
        await write(`live-settings.${def.name}.json`, settings);
        const mappings = await this.client.indices.getMapping({ index: alias });
        await write(`live-mappings.${def.name}.json`, mappings);
      }
    }

    return written;
  }

  /**
   * 스키마 **삭제**(초기화가 아니라 파괴). 등록된 모든 인덱스·템플릿과 공유 컴포넌트 템플릿을
   * 지운다. 데이터가 통째로 날아가므로 CLI 에서 --yes 로만 부른다.
   */
  async delete(): Promise<void> {
    let deletedIndices = 0;

    for (const def of INDEX_DEFINITIONS) {
      // 실제 인덱스명을 모아 **명시적으로** 지운다 — alias/_all/와일드카드 삭제는 ES 가 막는다.
      // 인덱스를 지우면 그 위 alias 도 함께 사라진다.
      const names = new Set<string>();

      const alias = aliasOf(def.name);
      if (await this.client.indices.existsAlias({ name: alias })) {
        const got = await this.client.indices.getAlias({ name: alias });
        for (const name of Object.keys(got)) {
          names.add(name);
        }
      }
      // **베이스 이름(name)과 버전(name-v*) 둘 다** 훑는다. get 이 와일드카드·alias 를 실제
      // 인덱스명으로 풀어 준다. name 그대로의 맨이름 인덱스(alias 없이 sync 가 자동 생성한 잔재)도
      // 여기서 잡힌다 — 예전엔 name-v* 만 봐서 그 잔재를 못 지웠다.
      const found = await this.client.indices.get(
        { index: [def.name, indexPatternOf(def.name)] },
        { ignore: [404] },
      );
      for (const name of Object.keys(found ?? {})) {
        names.add(name);
      }

      if (names.size > 0) {
        await this.client.indices.delete(
          { index: [...names] },
          { ignore: [404] },
        );
        deletedIndices += names.size;
      }

      await this.client.indices.deleteIndexTemplate(
        { name: def.name },
        { ignore: [404] },
      );
    }

    await this.client.cluster.deleteComponentTemplate(
      { name: COMPONENT_TEMPLATE_NAME },
      { ignore: [404] },
    );
    this.logger.log(
      `스키마 삭제 완료(인덱스 ${deletedIndices}개 + 템플릿 삭제)`,
    );
  }

  /** 현황: 등록된 인덱스별로 alias→인덱스·템플릿·문서 수를 모은다. */
  async status(): Promise<SchemaStatus> {
    const componentTemplateExists = await this.client.cluster
      .existsComponentTemplate({ name: COMPONENT_TEMPLATE_NAME })
      .catch(() => false);

    const rows: IndexStatusRow[] = [];
    for (const def of INDEX_DEFINITIONS) {
      const alias = aliasOf(def.name);
      const aliasExists = await this.client.indices.existsAlias({
        name: alias,
      });

      let indices: string[] = [];
      let docCount: number | undefined;
      if (aliasExists) {
        const got = await this.client.indices.getAlias({ name: alias });
        indices = Object.keys(got);
        const counted = await this.client.count({ index: alias });
        docCount = counted.count;
      }

      const indexTemplateExists = await this.client.indices
        .existsIndexTemplate({ name: def.name })
        .catch(() => false);

      rows.push({
        name: def.name,
        aliasExists,
        indices,
        indexTemplateExists,
        docCount,
      });
    }

    return { componentTemplateExists, indices: rows };
  }
}
