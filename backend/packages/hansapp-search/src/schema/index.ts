// ES 스키마 정본(source of truth)은 JSON 파일이다. **코드에 박지 않고 실행 시점에 읽어** 올린다.
//
// 파일이 있는 디렉터리는 설정(ELASTICSEARCH_SCHEMA_DIR)으로 바꿀 수 있다 — 운영에서 리빌드 없이
// 스키마만 고쳐 재적용하기 위해서다(env.ts 가 config 를 cwd 기준으로 찾는 것과 같은 결).
// 설정이 없으면 **패키지 동봉본**(아래 DEFAULT_SCHEMA_DIR)을 쓴다.
import * as path from 'node:path';

/**
 * 패키지 동봉 정본 디렉터리 = 패키지 루트의 `elasticsearch/`. DB 의 `prisma/` 와 같은 결로
 * **소유 패키지가 자기 스토어 정의를 패키지 루트에 스토어 이름 폴더로** 둔다.
 *
 * **깊이(../../)는 패키지 내부라 안전하다** — src/schema(dev)·dist/schema(prod bundle) 둘 다
 * 패키지 루트의 두 단계 아래이므로 ../../elasticsearch 가 패키지 루트 elasticsearch/ 를 가리킨다.
 * package.json 의 files 에 "elasticsearch" 가 있어 배포 번들에도 실린다.
 * (env 처럼 앱↔백엔드를 **가로지르는** 깊이가 아니라 패키지 안에서 닫혀 있어 재배치에 안 흔들린다.)
 */
export const DEFAULT_SCHEMA_DIR = path.join(
  __dirname,
  '..',
  '..',
  'elasticsearch',
);

/** 공유 분석기 컴포넌트 템플릿 이름(병원 전용이 아니라 공유라 도메인명을 안 붙인다). */
export const COMPONENT_TEMPLATE_NAME = 'hansapp-analysis';

/** 공유 분석기 정본 파일명. */
export const COMPONENT_TEMPLATE_FILENAME =
  'component-template.hansapp-analysis.json';

/** 통합 병원 alias. 병원 데이터 색인(HealthcareHospitalIndexer)이 이 이름으로 upsert 한다. */
export const HEALTHCARE_HOSPITAL_ALIAS = 'healthcare_hospital';

/**
 * 인덱스 정의. **인덱스가 늘어나면(pharmacy·doctor…) 여기에 한 줄 추가**하면
 * import·status·reset·export 가 전부 그 인덱스를 함께 다룬다.
 *
 * 이름 규칙은 DB 테이블명과 맞춘다: 인덱스·템플릿·alias 이름 = `name`, 실제 인덱스는 `name-v1`.
 * 템플릿 파일은 파일명만 갖고, 실제 디렉터리는 설정(schemaDir)으로 실행 시점에 정해진다.
 */
export interface IndexDefinition {
  /** 베이스 이름(= 템플릿 이름 = alias). DB 테이블명과 일치. 예: 'healthcare_hospital' */
  readonly name: string;
  /** 인덱스 템플릿 정본 파일명(디렉터리 제외). */
  readonly templateFilename: string;
}

/** 등록된 인덱스 전체. 새 인덱스는 여기 한 줄(+ 정본 디렉터리에 그 파일). */
export const INDEX_DEFINITIONS: readonly IndexDefinition[] = [
  {
    name: HEALTHCARE_HOSPITAL_ALIAS,
    templateFilename: 'index-template.healthcare_hospital.json',
  },
];

/** 정본 디렉터리 결정: 설정값이 있으면 그걸, 없으면 패키지 동봉본. */
export const resolveSchemaDir = (override?: string): string =>
  override && override.length ? override : DEFAULT_SCHEMA_DIR;

/**
 * 격리 접두사. 물리 인덱스 이름은 `<prefix>-<name>` 이다(develop-healthcare_hospital). 한 ES 클러스터를
 * 여럿이 공유해도 안 겹친다 — 인덱스 이름이 유일한 격리 단위라 **여기 한 곳에서만** 접두사를 붙인다
 * (Redis 의 키 namespace 와 동형). 논리 이름(INDEX_DEFINITIONS.name)은 접두사를 모른다. 새 인덱스가
 * 늘어도 이 함수만 통과하면 자동으로 격리된다.
 *
 * 접두사는 설정에서 온다(ELASTICSEARCH_INDEX_PREFIX → SearchConfig.indexPrefix).
 */
const withPrefix = (name: string, prefix: string): string =>
  `${prefix}-${name}`;

/** alias 이름(물리). 앱·색인은 이 이름으로만 접근한다. */
export const aliasOf = (name: string, prefix: string): string =>
  withPrefix(name, prefix);
/** 특정 버전 인덱스 이름(물리). */
export const versionIndexOf = (
  name: string,
  prefix: string,
  version: number,
): string => `${withPrefix(name, prefix)}-v${version}`;
/** 최초 생성 버전 인덱스. */
export const initialIndexOf = (name: string, prefix: string): string =>
  versionIndexOf(name, prefix, 1);
/** 버전 인덱스 판별 패턴(리셋·조회에서 <prefix>-name-v* 를 훑을 때). */
export const indexPatternOf = (name: string, prefix: string): string =>
  `${withPrefix(name, prefix)}-v*`;
