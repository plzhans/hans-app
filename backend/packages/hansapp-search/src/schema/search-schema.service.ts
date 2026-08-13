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
  versionIndexOf,
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
 * 통째로 리셋한다. **데이터(문서)는 건드리지 않는다** — 그건 색인 오케스트레이션(admin) 몫이다.
 *
 * **여러 인덱스를 함께 다룬다.** INDEX_DEFINITIONS 를 순회하므로, 인덱스가 늘면(pharmacy…)
 * 이 서비스는 바뀌지 않고 레지스트리에 한 줄만 추가하면 된다.
 */
@Injectable()
export class SearchSchemaService {
  private readonly logger = new Logger(SearchSchemaService.name);

  /** 정본 JSON 을 읽어올 디렉터리(설정 우선, 없으면 패키지 동봉본). */
  readonly schemaDir: string;

  /** 인덱스 이름 접두사. 모든 물리 이름 해석(aliasOf 등)에 넘긴다. */
  private readonly indexPrefix: string;

  constructor(
    private readonly es: ElasticsearchService,
    @Inject(SEARCH_CONFIG) config: SearchConfig,
  ) {
    this.schemaDir = resolveSchemaDir(config.schemaDir);
    this.indexPrefix = config.indexPrefix;
  }

  private get client() {
    return this.es.client;
  }

  /** import 이 읽을 정본 파일 절대경로 목록(CLI 헤더 표시용). */
  templateFiles(): string[] {
    return [
      path.join(this.schemaDir, COMPONENT_TEMPLATE_FILENAME),
      ...INDEX_DEFINITIONS.map((d) => path.join(this.schemaDir, d.templateFilename)),
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
    if (
      await this.client.indices.existsAlias({
        name: aliasOf(def.name, this.indexPrefix),
      })
    ) {
      return undefined;
    }
    await this.putComponentTemplate();
    await this.putIndexTemplate(def);
    return this.createIndexIfMissing(def);
  }

  // ── blue-green 재색인용 ────────────────────────────────────────────────
  //
  // 무중단 재색인은 라이브 alias 를 건드리지 않고 **새 버전 인덱스**에 전량 색인한 뒤, 검증에
  // 통과하면 alias 를 원자 스왑한다. 색인·문서 조립은 admin(HealthcareIndexService)이 하고,
  // 여기는 그 오케스트레이션이 쓰는 인덱스/alias 프리미티브만 제공한다.

  /**
   * 다음 버전 인덱스를 만든다(name-v{max+1}, 하나도 없으면 -v1). 새 인덱스에 매핑이 붙도록
   * 템플릿을 먼저 올린다. **alias 는 건드리지 않는다** — 색인이 끝난 뒤 swapAlias 로 교체한다.
   */
  async createNextVersion(name: string): Promise<string> {
    const def = INDEX_DEFINITIONS.find((d) => d.name === name);
    if (!def) {
      throw new Error(`등록되지 않은 인덱스: ${name}`);
    }
    // 시작 전에 거른다 — 맨이름 인덱스가 있으면 어차피 마지막 swapAlias 에서 실패한다.
    // 8만 건 색인을 헛으로 돌리지 말고 여기서 즉시 던진다.
    await this.assertNotBareIndex(aliasOf(name, this.indexPrefix));
    await this.putComponentTemplate();
    await this.putIndexTemplate(def);

    const versions = await this.listVersions(name);
    const next = (versions.at(-1) ?? 0) + 1;
    const index = versionIndexOf(name, this.indexPrefix, next);
    // 인덱스 템플릿(index_patterns: <env>-name-v*)이 생성 시점에 매핑을 붙인다(-v1 생성과 동일 경로).
    await this.client.indices.create({ index });
    this.logger.log(`새 버전 인덱스 생성: ${index}`);
    return index;
  }

  /**
   * alias 를 toIndex 로 **원자 교체**한다(updateAliases 라 조회 다운타임이 없다). 기존에 가리키던
   * 인덱스에서는 뗀다. alias 가 아직 없으면(최초 색인) 그냥 붙인다.
   *
   * **직전에 가리키던 인덱스명들을 반환한다** — 호출부가 "방금 물러난 라이브 인덱스"만 골라 지우게.
   * 다른 버전(v1 등)은 다른 목적으로 살아있을 수 있으므로 여기서 임의로 손대지 않는다.
   */
  async swapAlias(name: string, toIndex: string): Promise<string[]> {
    const alias = aliasOf(name, this.indexPrefix);
    const actions: estypes.IndicesUpdateAliasesAction[] = [{ add: { index: toIndex, alias } }];
    const previous: string[] = [];
    if (await this.client.indices.existsAlias({ name: alias })) {
      const got = await this.client.indices.getAlias({ name: alias });
      for (const old of Object.keys(got)) {
        if (old !== toIndex) {
          previous.push(old);
          actions.push({ remove: { index: old, alias } });
        }
      }
    }
    await this.client.indices.updateAliases({ actions });
    this.logger.log(`alias '${alias}' → '${toIndex}' 원자 교체`);
    return previous;
  }

  /** 인덱스 1개 삭제(없어도 조용히). 스왑 후 직전 라이브 인덱스 정리·가드 실패 시 새 버전 되돌리기에 쓴다. */
  async dropIndex(index: string): Promise<void> {
    await this.client.indices.delete({ index }, { ignore: [404] });
    this.logger.log(`인덱스 삭제: ${index}`);
  }

  /**
   * name 이 정상 상태(alias 이거나 아예 없음)인지 확인한다. **접미사 없는 맨이름 실제 인덱스**로
   * 존재하면(require_alias 이전 잔재) 같은 이름의 alias 를 만들 수 없어 색인이 불가하므로 즉시 던진다
   * — 색인을 다 돌리고 swapAlias 에서 실패하지 말고, 시작 전에 알아채게 한다.
   */
  private async assertNotBareIndex(name: string): Promise<void> {
    if (await this.client.indices.existsAlias({ name })) {
      return; // alias — 정상
    }
    if (await this.client.indices.exists({ index: name })) {
      // alias 는 아닌데 그 이름 인덱스가 실재한다 = 맨이름 잔재.
      throw new Error(
        `'${name}' 이 alias 가 아니라 같은 이름의 실제 인덱스로 존재한다(맨이름 잔재) — ` +
          `같은 이름의 alias 를 만들 수 없어 색인할 수 없다. 그 인덱스를 지운 뒤 다시 시도하라 ` +
          `(수동: DELETE /${name}, 또는 전체 정리: es schema delete).`,
      );
    }
    // 둘 다 아니면 아직 아무것도 없음 — 최초 색인이라 정상.
  }

  /**
   * 현재 존재하는 name-v* 인덱스의 버전 번호를 오름차순으로. 없으면 빈 배열.
   * alias 가 무엇을 가리키든 무관하게 **실재하는 버전 인덱스**만 본다(잔재 포함).
   */
  private async listVersions(name: string): Promise<number[]> {
    const found = await this.client.indices.get(
      { index: indexPatternOf(name, this.indexPrefix) },
      { ignore: [404] },
    );
    const re = new RegExp(`^${aliasOf(name, this.indexPrefix)}-v(\\d+)$`);
    const versions: number[] = [];
    for (const index of Object.keys(found ?? {})) {
      const m = re.exec(index);
      if (m) {
        versions.push(Number(m[1]));
      }
    }
    return versions.sort((a, b) => a - b);
  }

  private async putComponentTemplate(): Promise<void> {
    await this.client.cluster.putComponentTemplate({
      name: COMPONENT_TEMPLATE_NAME,
      ...(await readTemplate(path.join(this.schemaDir, COMPONENT_TEMPLATE_FILENAME))),
    } as estypes.ClusterPutComponentTemplateRequest);
    this.logger.log(`component template '${COMPONENT_TEMPLATE_NAME}' 적용`);
  }

  private async putIndexTemplate(def: { name: string; templateFilename: string }): Promise<void> {
    const templateName = aliasOf(def.name, this.indexPrefix);
    const body = await readTemplate(path.join(this.schemaDir, def.templateFilename));
    // 물리 인덱스가 env 접두사를 가지므로, 템플릿의 index_patterns 도 그 패턴으로 덮어쓴다.
    // (정본 파일엔 논리이름 `name-v*` 로 두고, 적용 시점에 `<env>-name-v*` 로 맞춘다.)
    body.index_patterns = [indexPatternOf(def.name, this.indexPrefix)];
    await this.client.indices.putIndexTemplate({ name: templateName, ...body });
    this.logger.log(`index template '${templateName}' 적용`);
  }

  /** alias 가 없으면 name-v1 생성 후 연결. 있으면 그대로 둔다. 생성 시에만 createdIndex 채운다. */
  private async createIndexIfMissing(def: { name: string }): Promise<IndexImportRow> {
    const alias = aliasOf(def.name, this.indexPrefix);
    if (await this.client.indices.existsAlias({ name: alias })) {
      this.logger.log(`alias '${alias}' 이미 존재 — 인덱스는 그대로 둔다`);
      return { name: def.name, aliasTarget: alias };
    }
    // alias 를 새로 만들어야 하는데, 그 이름 맨이름 인덱스가 있으면 못 만든다 — 먼저 걸러 명확히 던진다.
    await this.assertNotBareIndex(alias);
    const initial = initialIndexOf(def.name, this.indexPrefix);
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
    await write('component-template.hansapp-analysis.json', component);

    for (const def of INDEX_DEFINITIONS) {
      const template = await this.client.indices.getIndexTemplate({
        name: aliasOf(def.name, this.indexPrefix),
      });
      await write(`index-template.${def.name}.json`, template);

      const alias = aliasOf(def.name, this.indexPrefix);
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

      const alias = aliasOf(def.name, this.indexPrefix);
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
        {
          index: [aliasOf(def.name, this.indexPrefix), indexPatternOf(def.name, this.indexPrefix)],
        },
        { ignore: [404] },
      );
      for (const name of Object.keys(found ?? {})) {
        names.add(name);
      }

      if (names.size > 0) {
        await this.client.indices.delete({ index: [...names] }, { ignore: [404] });
        deletedIndices += names.size;
      }

      await this.client.indices.deleteIndexTemplate(
        { name: aliasOf(def.name, this.indexPrefix) },
        { ignore: [404] },
      );
    }

    await this.client.cluster.deleteComponentTemplate(
      { name: COMPONENT_TEMPLATE_NAME },
      { ignore: [404] },
    );
    this.logger.log(`스키마 삭제 완료(인덱스 ${deletedIndices}개 + 템플릿 삭제)`);
  }

  /** 현황: 등록된 인덱스별로 alias→인덱스·템플릿·문서 수를 모은다. */
  async status(): Promise<SchemaStatus> {
    const componentTemplateExists = await this.client.cluster
      .existsComponentTemplate({ name: COMPONENT_TEMPLATE_NAME })
      .catch(() => false);

    const rows: IndexStatusRow[] = [];
    for (const def of INDEX_DEFINITIONS) {
      const alias = aliasOf(def.name, this.indexPrefix);
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
        .existsIndexTemplate({ name: aliasOf(def.name, this.indexPrefix) })
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
