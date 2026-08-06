import merge from 'lodash.merge';

import { loadYamlObject } from './app-config';
import { normalizeConnectionUrl } from './connection-url';
import { loadEnv } from './env';
import type { AppEnv, DotenvLoader } from './env';

/**
 * 설정 공급자. **빌드 단계에서만** 쓰인다 — 각 공급자가 자기 설정 조각(섹션 트리)을 내놓고,
 * buildConfigTree 가 우선순위대로 하나의 트리로 합친다. 그 뒤 ${} 치환까지 끝난 계산된
 * 트리만 ConfigSource 가 읽는다. .NET ConfigurationBuilder 의 Provider 와 같다.
 */
export interface ConfigProvider {
  /** 이 공급자가 기여하는 설정 섹션(중첩 객체). */
  load(): Record<string, unknown>;
}

/** yaml 공급자. config/<name>.yaml 을 섹션 트리로 읽는다(name='config.<환경>'). */
export function yamlProvider(appDir: string, name: string): ConfigProvider {
  return { load: () => loadYamlObject(appDir, name) };
}

/**
 * 빌드 1단계: 공급자들을 우선순위대로(앞=낮음, 뒤=높음) 깊게 병합한다. 뒤 공급자가 이긴다.
 */
export function buildConfigTree(
  providers: ConfigProvider[],
): Record<string, unknown> {
  const tree: Record<string, unknown> = {};
  for (const provider of providers) {
    // lodash.merge 는 깊게 병합한다(중첩 섹션을 통째로 갈아치우지 않는다).
    merge(tree, provider.load());
  }
  return tree;
}

/**
 * `${VAR}` / `${VAR:기본값}` 자리표시자. VAR 는 대문자·숫자·밑줄. **Spring `${...}` 과 같다** —
 * 콜론은 이름과 기본값을 가르는 구분자일 뿐이고, bash 처럼 `:-` 와 `-` 로 의미가 갈리지 않는다.
 *
 * yaml 이 구조의 단일 원천이고, env 값은 이 자리표시자로만 주입된다 — 그래서 시크릿 env 이름을
 * 바꾸거나 sops 를 다시 만들 필요가 없다(yaml 경로는 중첩, env 이름은 그대로).
 */
const PLACEHOLDER = /\$\{([A-Z0-9_]+)(?::([^}]*))?\}/g;

/**
 * bash 습관으로 쓴 `${VAR:-기본값}`. 이 문법에서는 `-` 가 **기본값의 첫 글자로 먹혀** 조용히
 * `-기본값` 이 된다 — 부팅은 되고 값만 틀리므로 한참 뒤에나 안다. 그래서 부팅을 막는다.
 *
 * 대가: 음수로 시작하는 기본값(`${N:-1}` 로 -1 을 주기)을 못 쓴다. 지금 설정엔 포트·TTL·횟수뿐이라
 * 그런 값이 없고, 실수를 잡는 쪽이 훨씬 이득이라 감수한다. 필요해지면 그때 이스케이프를 만든다.
 */
const BASH_PLACEHOLDER = /\$\{[A-Z0-9_]+:-/;

/**
 * **기본값은 키가 없을 때만 쓴다. 빈 문자열은 어엿한 값이다**(Spring 이 null 만 보는 것과 같다).
 *
 * `.env` 의 `SSL_CERTIFICATE=` 는 '경로를 안 정했다' 가 아니라 '**끄겠다**' 는 뜻이다. 빈값을
 * 미설정과 같이 보면 그 의사를 표현할 방법이 사라져 yaml 기본값이 되살아난다 — TLS 처럼
 * 빈값에 의미가 걸린 설정이 조용히 켜진다.
 *
 * 그래서 기본값을 원하면 `.env` 에서 **줄을 지워야** 한다. 비워 두는 것으로는 안 된다.
 *
 * @param path 오류에 찍을 yaml 경로. 어느 줄을 고쳐야 하는지가 메시지에 있어야 한다.
 */
function interpolateString(
  raw: string,
  env: NodeJS.ProcessEnv,
  path: string,
): string {
  if (BASH_PLACEHOLDER.test(raw)) {
    throw new Error(
      `설정 ${path} 에 bash 문법 \${VAR:-기본값} 이 있다: ${raw}\n` +
        '이 프로젝트는 Spring 문법을 쓴다 — 콜론 하나로 붙일 것: ${VAR:기본값}. ' +
        '(기본값은 env 에 키가 없을 때만 쓰인다. 빈값은 값으로 인정된다.)',
    );
  }
  return raw.replace(PLACEHOLDER, (_, name: string, fallback?: string) => {
    const value = env[name];
    return value !== undefined ? value : (fallback ?? '');
  });
}

/** 빌드 2단계: 트리의 모든 문자열 값에서 ${VAR} 를 process.env 로 치환한다(재귀). */
function interpolate(
  node: unknown,
  env: NodeJS.ProcessEnv,
  path = '',
): unknown {
  if (typeof node === 'string') {
    return interpolateString(node, env, path);
  }
  const at = (key: string | number): string =>
    path ? `${path}.${key}` : String(key);
  if (Array.isArray(node)) {
    return node.map((item, index) => interpolate(item, env, at(index)));
  }
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      out[key] = interpolate(value, env, at(key));
    }
    return out;
  }
  return node;
}

/**
 * 계산된 섹션 트리의 **읽기 전용 표면**. .NET IConfiguration/IConfigurationSection 과 같다.
 *
 * 트리를 '.' / ':' 로 잘라 순회한다. 끝값은 타입 게터로(getString 등), 섹션(하위 트리)은
 * getSection(이어서 탐색) 또는 getValue(원시 객체)로 — **값이든 객체든 필요한 형태로** 꺼낸다.
 *
 * 필요한 값은 부팅 때 한 번 읽어 고정해 쓴다(요청마다 getX 를 부르지 않는다 — 순회 비용).
 */
export interface ConfigSource {
  readonly env: AppEnv;

  /** 하위 섹션을 다시 ConfigSource 로. 없으면 빈 섹션(널 아님, C# GetSection 과 같다). */
  getSection(path: string): ConfigSource;
  /** 그 자리 원시값. 섹션(객체)이든 끝값이든 그대로. 없으면 undefined. */
  getValue(path: string): unknown;

  /** 필수 문자열. 없거나 비면 부팅 거부. */
  getString(path: string): string;
  /** 없으면 기본값(기본 빈 문자). */
  getStringOrDefault(path: string, fallback?: string): string;

  /**
   * 접속 URL. getString 과 같되 자격증명 구간을 규격에 맞게 인코딩해 돌려준다.
   * .env 에는 실제 비밀번호가 그대로 적히므로(사람 기준), 파서에 넘기기 전 여기서 바꾼다.
   * 자세한 규칙은 normalizeConnectionUrl 참고.
   */
  getUrl(path: string): string;
  getUrlOrDefault(path: string, fallback?: string): string;

  /** 필수 숫자. 숫자가 아니면 던진다. */
  getNumber(path: string): number;
  getNumberOrDefault(path: string, fallback: number): number;

  /** true/false 또는 'true'/'false' 문자열. */
  getBool(path: string): boolean;
  getBoolOrDefault(path: string, fallback: boolean): boolean;

  /** 문자열 배열. yaml 리스트 그대로, 또는 콤마 문자열을 쪼갠다. 없으면 빈 배열. */
  getStringArray(path: string): readonly string[];

  /** 기간을 초로. '30s'·'5m'·'1h'·'7d'(단위 없으면 초). 없거나 형식이 틀리면 던진다. */
  getDurationSec(path: string): number;
  getDurationSecOrDefault(path: string, fallbackSec: number): number;
}

/** 'a.b.c' / 'a:b:c' 경로를 따라 섹션 트리를 내려간다. */
function getByPath(tree: unknown, path: string): unknown {
  return path
    .split(/[.:]/)
    .reduce<unknown>(
      (node, key) =>
        node && typeof node === 'object'
          ? (node as Record<string, unknown>)[key]
          : undefined,
      tree,
    );
}

function present(raw: unknown): boolean {
  return (
    raw !== undefined &&
    raw !== null &&
    !(typeof raw === 'string' && raw.trim() === '')
  );
}

function toNumber(raw: unknown, path: string): number {
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n)) {
    throw new Error(`설정 ${path} 는 숫자여야 한다. 받은 값: ${String(raw)}`);
  }
  return n;
}

function toBool(raw: unknown, path: string): boolean {
  if (typeof raw === 'boolean') {
    return raw;
  }
  const v = String(raw).trim().toLowerCase();
  if (v === 'true') return true;
  if (v === 'false') return false;
  throw new Error(
    `설정 ${path} 는 true/false 여야 한다. 받은 값: ${String(raw)}`,
  );
}

function toStringArray(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

const DURATION_UNIT: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
};

function toDurationSec(raw: unknown, path: string): number {
  const matched = /^(\d+)\s*([smhd])?$/.exec(String(raw).trim());
  if (!matched) {
    throw new Error(
      `설정 ${path} 는 기간(예: 30s, 5m, 1h, 7d)이어야 한다. 받은 값: ${String(raw)}`,
    );
  }
  return Number(matched[1]) * DURATION_UNIT[matched[2] ?? 's'];
}

/** 계산된 트리를 감싸 읽기 표면을 만든다(getSection 은 하위 트리로 재귀). */
function sectionOf(tree: unknown, env: AppEnv): ConfigSource {
  const at = (path: string): unknown => getByPath(tree, path);
  return {
    env,
    getSection: (path) => {
      const node = at(path);
      return sectionOf(node && typeof node === 'object' ? node : {}, env);
    },
    getValue: (path) => at(path),
    getString: (path) => {
      const raw = at(path);
      if (!present(raw)) {
        throw new Error(`필수 설정이 없다: ${path}`);
      }
      return String(raw).trim();
    },
    getStringOrDefault: (path, fallback = '') => {
      const raw = at(path);
      return present(raw) ? String(raw).trim() : fallback;
    },
    getUrl: (path) => {
      const raw = at(path);
      if (!present(raw)) {
        throw new Error(`필수 설정이 없다: ${path}`);
      }
      return normalizeConnectionUrl(String(raw).trim());
    },
    getUrlOrDefault: (path, fallback = '') => {
      const raw = at(path);
      return present(raw)
        ? normalizeConnectionUrl(String(raw).trim())
        : fallback;
    },
    getNumber: (path) => {
      const raw = at(path);
      if (!present(raw)) {
        throw new Error(`필수 설정이 없다: ${path}`);
      }
      return toNumber(raw, path);
    },
    getNumberOrDefault: (path, fallback) => {
      const raw = at(path);
      return present(raw) ? toNumber(raw, path) : fallback;
    },
    getBool: (path) => {
      const raw = at(path);
      if (!present(raw)) {
        throw new Error(`필수 설정이 없다: ${path}`);
      }
      return toBool(raw, path);
    },
    getBoolOrDefault: (path, fallback) => {
      const raw = at(path);
      return present(raw) ? toBool(raw, path) : fallback;
    },
    getStringArray: (path) => Object.freeze(toStringArray(at(path))),
    getDurationSec: (path) => {
      const raw = at(path);
      if (!present(raw)) {
        throw new Error(`필수 설정이 없다: ${path}`);
      }
      return toDurationSec(raw, path);
    },
    getDurationSecOrDefault: (path, fallbackSec) => {
      const raw = at(path);
      return present(raw) ? toDurationSec(raw, path) : fallbackSec;
    },
  };
}

/**
 * 설정을 빌드해 읽기 표면을 만든다. **빌드(공급자 병합 → ${} 치환 → 계산된 트리)와
 * 읽기(ConfigSource)가 분리**된다. 빌드가 끝나면 트리 하나만 남는다.
 *
 * 순서:
 *   1. loadEnv: .env 계층을 process.env 로 (${} 치환의 값 원천)
 *   2. 로드: config/config.<환경>.yaml (환경별 — 자기완결적, 공통 base 없음)
 *   3. 치환: 트리의 ${VAR} 를 process.env 로 → 계산된 트리
 *
 * yaml 이 **구조의 단일 원천**이다 — 시크릿은 `${DATABASE_URL}` 처럼 자리표시자로 선언되고
 * 빌드 때 채워진다. 그래서 시크릿 env 이름을 안 바꾸고도(sops 그대로) 중첩 섹션을 쓸 수 있다.
 *
 * @param appDir 바이너리(main.js)가 있는 디렉터리. 보통 __dirname.
 * @param loader dotenv 의 config. common 이 dotenv 에 직접 의존하지 않기 위해 주입받는다.
 */
export function createConfigSource(
  appDir: string,
  env: AppEnv,
  loader: DotenvLoader,
): ConfigSource {
  // .env → process.env (${} 치환의 값 원천)
  loadEnv(appDir, env, loader);
  // yaml 두 자리를 본다. 낮은 쪽부터 쌓아 뒤가 이긴다.
  //
  //   config/config.yaml          환경 이름이 없는 자리 — **컨테이너가 여기로 마운트받는다**
  //   config/config.<환경>.yaml    환경별 — 로컬 개발이 쓴다(환경들이 나란히 있어야 하므로)
  //
  // 컨테이너에는 환경이 하나뿐이라 파일 이름이 환경을 말할 이유가 없다. 그래서 이미지에
  // yaml 을 굽지 않고 배포가 그 환경 것을 config.yaml 로 얹는다 — .env 를 config/.env 로
  // 마운트하는 것과 같은 규칙이다. 덕분에 이미지도 compose 도 환경을 모른 채로 있는다.
  //
  // 한쪽만 있는 것이 정상이라 병합할 일이 거의 없지만, 둘 다 있으면 환경별이 이긴다(더 구체적).
  const merged = buildConfigTree([
    yamlProvider(appDir, 'config'),
    yamlProvider(appDir, `config.${env}`),
  ]);

  // 설정 파일이 아예 없으면 여기서 멈춘다. 그대로 두면 "필수 설정이 없다: database.url"
  // 처럼 **결과**만 보이고 원인(yaml 을 못 찾음)이 안 보인다.
  if (Object.keys(merged).length === 0) {
    throw new Error(
      `설정 파일이 없다: config/config.yaml 또는 config/config.${env}.yaml. ` +
        '컨테이너라면 배포가 yaml 을 config/config.yaml 로 마운트했는지 확인할 것.',
    );
  }
  const tree = interpolate(merged, process.env) as Record<string, unknown>;
  return sectionOf(tree, env);
}
