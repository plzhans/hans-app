import merge from 'lodash.merge';

import { loadYamlObject } from './app-config';
import { configDefaultOf } from './config-defaults';
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
export function buildConfigTree(providers: ConfigProvider[]): Record<string, unknown> {
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
function interpolateString(raw: string, env: NodeJS.ProcessEnv, path: string): string {
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
function interpolate(node: unknown, env: NodeJS.ProcessEnv, path = ''): unknown {
  if (typeof node === 'string') {
    return interpolateString(node, env, path);
  }
  const at = (key: string | number): string => (path ? `${path}.${key}` : String(key));
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
 * yaml 경로 한 조각을 환경변수 조각으로. camelCase 와 kebab-case 를 모두 `_` 로 가른다.
 *
 *   logUrl            → LOG_URL
 *   sslCertificateKey → SSL_CERTIFICATE_KEY
 *   apps-api          → APPS_API
 *   v1                → V1        (숫자 앞에는 안 끊는다 — V_1 은 아무도 안 쓴다)
 */
function envSegment(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toUpperCase();
}

/** yaml 경로(`auth.jwt.secret`) → 환경변수 이름(`AUTH_JWT_SECRET`). */
export function envNameOf(path: string): string {
  return path.split('.').map(envSegment).join('_');
}

/**
 * 빌드 3단계: **yaml 에 선언된 모든 끝값을 같은 이름의 환경변수가 덮는다.** Spring 의
 * relaxed binding 과 같은 규칙이고, 덕분에 `${VAR}` 자리표시자를 일일이 적을 필요가 없다 —
 * `auth.jwt.secret` 은 선언만 해 두면 `AUTH_JWT_SECRET` 이 알아서 덮는다.
 *
 * **방향이 핵심이다.** 환경변수 이름을 쪼개 경로를 만들지 않는다(그건 `A_B` 가 `a.b` 인지
 * `a_b` 인지 알 수 없어 애초에 불가능하다). 반대로 **yaml 에 있는 경로에서 환경변수 이름을
 * 계산해 조회**한다. Spring 이 하는 것이 이것이고, 그래서 모호함이 없다.
 *
 * **끝값만 덮는다.** 섹션(객체)은 통째로 못 갈아치운다. 리스트는 끝값이라
 * `AUTH_JWT_ALLOWED_ISSUERS=a,b` 처럼 콤마로 준다(getStringArray 가 쪼갠다).
 *
 * 치환(`${}`)보다 **뒤**에 돈다 — 경로로 콕 집은 쪽이 자리표시자보다 구체적이라 이긴다.
 * 빈 문자열도 값이다(`interpolateString` 의 규칙과 같다). 키가 없을 때만 yaml 값이 남는다.
 *
 * **yaml 에 아예 없는 경로**는 여기서 못 만든다(순회할 잎이 없다). 그쪽은 읽는 순간
 * sectionOf 가 같은 이름으로 한 번 더 본다 — Spring 이 yaml 에 없는 프로퍼티도 env 로
 * 받는 것과 같다. 둘로 나뉜 이유는 sectionOf 주석 참고.
 */
function applyEnvOverrides(
  tree: Record<string, unknown>,
  env: NodeJS.ProcessEnv,
): Record<string, unknown> {
  // 환경변수 이름 → 그 이름을 만들어 낸 yaml 경로. 충돌 검출용이다.
  const claimed = new Map<string, string>();

  const walk = (node: unknown, path: string): unknown => {
    // 객체는 가지다. 배열·null·원시값은 끝값 — 배열까지 끝값으로 두는 건 인덱스 문법
    // (Spring 의 `_0_`)을 들이지 않기 위해서다. 콤마 문자열로 충분하다.
    if (node && typeof node === 'object' && !Array.isArray(node)) {
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(node)) {
        out[key] = walk(value, path ? `${path}.${key}` : key);
      }
      return out;
    }

    const name = envNameOf(path);
    // **두 경로가 같은 환경변수 이름으로 접히면 부팅을 막는다.** 값이 실제로 주입될 때까지
    // 기다리면, 그 환경변수를 처음 쓰는 배포에서야 터진다 — 그것도 둘 중 하나만 조용히
    // 덮인 채로. 이름이 겹친다는 사실 자체가 버그라 설정을 읽는 순간 잡는다.
    const owner = claimed.get(name);
    if (owner !== undefined) {
      throw new Error(
        `설정 경로 ${owner} 와 ${path} 가 같은 환경변수 이름(${name})으로 접힌다.\n` +
          '둘 중 하나의 yaml 키를 바꿀 것 — 지금 상태로는 환경변수로 둘을 구별할 수 없다.',
      );
    }
    claimed.set(name, path);

    const injected = env[name];
    return injected !== undefined ? injected : node;
  };

  return walk(tree, '') as Record<string, unknown>;
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

  /*
    ── *OrDefault 의 기본값은 어디서 오나 ──────────────────────────────────────
    인자를 안 넘기면 **CONFIG_DEFAULTS(config-defaults.ts)에서 경로로 찾는다.** 같은
    기본값이 여러 파일에 복제되는 것을 막으려는 것이다 — auth.cookieSecure 는 실제로
    네 곳에 따로 적혀 있었다. 표에 없는 값만 호출부가 인자로 준다.

    문자열류는 표에도 없으면 빈 문자열이고, 숫자·불리언·기간은 던진다. 그쪽은 조용히
    0·false 로 떨어지면 "설정이 빠진 것" 과 구별이 안 되기 때문이다.
  */

  /** 필수 문자열. 없거나 비면 부팅 거부. */
  getString(path: string): string;
  /** 없으면 기본값 → CONFIG_DEFAULTS → 빈 문자열. */
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
  getNumberOrDefault(path: string, fallback?: number): number;

  /** true/false 또는 'true'/'false' 문자열. */
  getBool(path: string): boolean;
  getBoolOrDefault(path: string, fallback?: boolean): boolean;

  /** 문자열 배열. yaml 리스트 그대로, 또는 콤마 문자열을 쪼갠다. 없으면 빈 배열. */
  getStringArray(path: string): readonly string[];

  /** 기간을 초로. '30s'·'5m'·'1h'·'7d'(단위 없으면 초). 없거나 형식이 틀리면 던진다. */
  getDurationSec(path: string): number;
  getDurationSecOrDefault(path: string, fallbackSec?: number): number;
}

/** 'a.b.c' / 'a:b:c' 경로를 따라 섹션 트리를 내려간다. */
function getByPath(tree: unknown, path: string): unknown {
  return path
    .split(/[.:]/)
    .reduce<unknown>(
      (node, key) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined,
      tree,
    );
}

function present(raw: unknown): boolean {
  return raw !== undefined && raw !== null && !(typeof raw === 'string' && raw.trim() === '');
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
  throw new Error(`설정 ${path} 는 true/false 여야 한다. 받은 값: ${String(raw)}`);
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

/**
 * 계산된 트리의 읽기 표면. **섹션은 접두사일 뿐이다** — getSection 은 하위 트리를 떼어
 * 새 표면을 짓지 않고, 자기 접두사만 기억한 채 조회 때 루트 기준 절대 경로로 편다.
 *
 * 하위 트리를 떼면 안 되는 이유가 실제로 있다. **환경변수 이름은 루트 기준**이어야 한다 —
 * `getSection('auth').getString('jwt.secret')` 도 AUTH_JWT_SECRET 이지 JWT_SECRET 이 아니다.
 * 하위 트리만 넘기면 그 정보가 사라지고, 접두사까지 같이 넘기면 같은 사실을 두 벌로 갖는 게 된다.
 * 접두사 하나만 남기면 둘 다 없어진다.
 *
 * 섹션 인스턴스는 접두사로 메모해 재사용한다. 메서드가 프로토타입에 한 벌만 있으므로
 * 섹션 하나당 필드 세 개짜리 객체가 전부다.
 *
 * **트리에 없는 경로는 환경변수를 한 번 더 본다.** applyEnvOverrides 는 yaml 에 선언된 잎만
 * 순회하므로 yaml 에 아예 없는 경로를 못 만드는데, Spring 은 그런 프로퍼티도 env 로 받는다.
 * 그 몫이 여기다 — 읽는 쪽이 경로를 알고 있으니 이름을 계산할 수 있다.
 *
 * **덮어쓰기를 여기 하나로 몰지 않는 이유**는 트리를 통째로 받아 직접 순회하는 소비자가
 * 있기 때문이다(parseSecretBoxKeys 가 `appSecretEncryption` 섹션을 그렇게 읽는다). 읽기
 * 시점에만 덮으면 그런 자리는 env 를 못 본 채로 지나간다. 그래서 **선언된 잎은 트리에
 * 미리 반영하고(applyEnvOverrides), 선언되지 않은 경로만 여기서 받는다.**
 */
class ConfigSection implements ConfigSource {
  /** 접두사 → 그 섹션. 같은 섹션을 여러 번 부르는 것이 흔해서 한 번 만든 것을 돌려준다. */
  private readonly sections = new Map<string, ConfigSource>();

  constructor(
    private readonly root: unknown,
    readonly env: AppEnv,
    private readonly prefix = '',
  ) {}

  /** 섹션 기준 경로 → 루트 기준 절대 경로. 구분자는 '.' 으로 통일한다(':' 도 받으므로). */
  private absolute(path: string): string {
    const normalized = path.replace(/:/g, '.');
    return this.prefix ? `${this.prefix}.${normalized}` : normalized;
  }

  private at(path: string): unknown {
    const full = this.absolute(path);
    const node = getByPath(this.root, full);
    // null 은 "yaml 이 값 없이 선언한 잎" 이라 이미 applyEnvOverrides 를 거쳤다. 여기서
    // 다시 보지 않는다 — 트리에 자리 자체가 없을 때(undefined)만 env 를 본다.
    return node !== undefined ? node : process.env[envNameOf(full)];
  }

  /** 없으면 던진다. **메시지에는 절대 경로**를 찍는다 — 섹션 기준 이름은 어디를 고칠지 못 알려준다. */
  private required(path: string): unknown {
    const raw = this.at(path);
    if (!present(raw)) {
      throw new Error(`필수 설정이 없다: ${this.absolute(path)}`);
    }
    return raw;
  }

  getSection(path: string): ConfigSource {
    const full = this.absolute(path);
    let section = this.sections.get(full);
    if (!section) {
      // 트리에 그 자리가 있는지 보지 않는다. 없어도 빈 섹션처럼 굴고(조회가 undefined),
      // 환경변수로만 채워진 섹션도 그대로 읽힌다.
      section = new ConfigSection(this.root, this.env, full);
      this.sections.set(full, section);
    }
    return section;
  }

  getValue(path: string): unknown {
    return this.at(path);
  }

  getString(path: string): string {
    return String(this.required(path)).trim();
  }

  /**
   * 인자로 안 넘긴 기본값을 CONFIG_DEFAULTS 에서 찾는다. **키는 루트 기준 절대 경로**라
   * 섹션으로 열어 읽어도 같은 값이 나온다.
   *
   * 표에도 없으면 던진다 — 조용히 0·false 로 떨어지면 "기본값이 그렇다" 와 "등록을
   * 빠뜨렸다" 가 구별되지 않는다.
   */
  private fallbackOf(path: string, given: unknown): unknown {
    if (given !== undefined) return given;
    const absolute = this.absolute(path);
    const found = configDefaultOf(absolute);
    if (found === undefined) {
      throw new Error(
        `설정 기본값이 없다: ${absolute}. ` +
          'config-defaults.ts 에 등록하거나 호출부에서 기본값을 넘길 것.',
      );
    }
    return found;
  }

  getStringOrDefault(path: string, fallback?: string): string {
    const raw = this.at(path);
    if (present(raw)) return String(raw).trim();
    // 문자열은 표에도 없으면 빈 문자열이다 — "미설정" 을 빈값으로 다루는 자리가 많다.
    return String(fallback ?? configDefaultOf(this.absolute(path)) ?? '').trim();
  }

  getUrl(path: string): string {
    return normalizeConnectionUrl(String(this.required(path)).trim());
  }

  getUrlOrDefault(path: string, fallback = ''): string {
    const raw = this.at(path);
    return present(raw) ? normalizeConnectionUrl(String(raw).trim()) : fallback;
  }

  getNumber(path: string): number {
    return toNumber(this.required(path), this.absolute(path));
  }

  getNumberOrDefault(path: string, fallback?: number): number {
    const raw = this.at(path);
    return present(raw)
      ? toNumber(raw, this.absolute(path))
      : toNumber(this.fallbackOf(path, fallback), this.absolute(path));
  }

  getBool(path: string): boolean {
    return toBool(this.required(path), this.absolute(path));
  }

  getBoolOrDefault(path: string, fallback?: boolean): boolean {
    const raw = this.at(path);
    return present(raw)
      ? toBool(raw, this.absolute(path))
      : toBool(this.fallbackOf(path, fallback), this.absolute(path));
  }

  getStringArray(path: string): readonly string[] {
    return Object.freeze(toStringArray(this.at(path)));
  }

  getDurationSec(path: string): number {
    return toDurationSec(this.required(path), this.absolute(path));
  }

  getDurationSecOrDefault(path: string, fallbackSec?: number): number {
    const raw = this.at(path);
    return toDurationSec(
      present(raw) ? raw : this.fallbackOf(path, fallbackSec),
      this.absolute(path),
    );
  }
}

/**
 * 설정을 빌드해 읽기 표면을 만든다. **빌드(공급자 병합 → ${} 치환 → 계산된 트리)와
 * 읽기(ConfigSource)가 분리**된다. 빌드가 끝나면 트리 하나만 남는다.
 *
 * 순서:
 *   1. loadEnv: .env 계층을 process.env 로 (env 값의 원천)
 *   2. 로드: config/config.yaml(정본) → config.<환경>.yaml(달라지는 값만)
 *      → config.<환경>.local.yaml(개인, gitignore). 깊게 병합하고 뒤가 이긴다
 *   3. 치환: 트리의 ${VAR} 를 process.env 로
 *   4. 오버레이: 모든 끝값을 경로에서 계산한 이름의 환경변수가 덮는다 → 계산된 트리
 *      (yaml 에 아예 없는 경로는 읽는 순간 sectionOf 가 같은 이름으로 받는다)
 *
 * yaml 이 **구조의 단일 원천**이다. env 가 값을 주입하는 길은 둘인데, 성격이 다르다:
 *
 *   - **4단계(기본)** — `auth.jwt.secret` 은 선언만 있으면 `AUTH_JWT_SECRET` 이 덮는다.
 *     이름을 적을 필요가 없어 설정이 짧아지고, 경로와 env 이름이 어긋날 수가 없다.
 *   - **3단계(예외)** — 이름이 규칙과 다를 때만 `${VAR}` 로 적는다. 남이 정한 이름
 *     (prisma 가 직접 읽는 `DATABASE_URL`), 경로에서 계산한 이름과 다른 이름을 쓰는
 *     값(`appSecretEncryption.v1: ${APP_SECRET_ENCRYPTION_KEY_V1}`) 이 그런 경우다.
 *
 * 자리표시자가 남아 있어도 4단계는 그대로 돈다 — 경로 이름으로도 덮을 수 있다(그쪽이 이긴다).
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
  // yaml 세 장을 겹쳐 읽는다. 낮은 쪽부터 쌓아 뒤가 이긴다. **.env 계층과 같은 이름 규칙**이다
  // (.env → .env.<환경> → .env.<환경>.local).
  //
  //   config/config.yaml             **정본** — 모든 설정과 그 설명이 여기 다 있다
  //   config/config.<환경>.yaml       그 환경에서 **달라지는 값만**. 설명은 적지 않는다
  //   config/config.<환경>.local.yaml 개인 오버라이드(gitignore). 남의 머신에는 없다
  //
  // **앞의 둘은 있는 것이 정상이다.** 예전엔 환경별 파일이 각자 자기완결적이라 한 장만 읽어도
  // 됐는데, 그러면 같은 설명이 세 벌 있고 값 하나를 이해하려면 세 파일을 diff 떠야 했다.
  // 설명을 한 벌로 모으면서 공통값도 같이 정본으로 올라왔다 — 그래서 환경 파일 혼자서는
  // database.url 부터 없는 반쪽이다.
  //
  // **.local 은 커밋하지 않는다.** 사람마다 다른 값(내 인증서 경로, 내가 켠 Sentry)을 공유
  // 파일에 박으면 서로 고쳐 커밋하게 된다. .env.<환경>.local 과 같은 이유·같은 취급이고,
  // 배포도 나르지 않는다(ci-deploy.sh 는 앞의 두 장만 집는다).
  //
  // 병합은 깊게 일어난다. 다만 **리스트는 인덱스별로 합쳐지므로**(lodash.merge) 정본의
  // 리스트는 비워 두고 값은 환경 파일이 통째로 준다 — config.yaml 머리말에 적어 뒀다.
  //
  // 배포는 이미지에 굽지 않고 두 장 다 마운트한다(infra/*/docker-compose.yml).
  // 기본값이 바뀌었다고 이미지를 다시 말 이유가 없어서다.
  const merged = buildConfigTree([
    yamlProvider(appDir, 'config'),
    yamlProvider(appDir, `config.${env}`),
    yamlProvider(appDir, `config.${env}.local`),
  ]);

  // 설정 파일이 아예 없으면 여기서 멈춘다. 그대로 두면 "필수 설정이 없다: database.url"
  // 처럼 **결과**만 보이고 원인(yaml 을 못 찾음)이 안 보인다.
  if (Object.keys(merged).length === 0) {
    throw new Error(
      `설정 파일이 없다: config/config.yaml 도 config/config.${env}.yaml 도 못 찾았다. ` +
        '컨테이너라면 배포가 두 장 다 마운트했는지 확인할 것 — 환경 파일에는 달라지는 ' +
        '값만 있어 정본(config.yaml)이 빠지면 반쪽짜리 설정이 된다.',
    );
  }
  const interpolated = interpolate(merged, process.env) as Record<string, unknown>;
  const tree = applyEnvOverrides(interpolated, process.env);
  return new ConfigSection(tree, env);
}

/**
 * 이 앱이 없으면 뜨면 안 되는 설정을 부팅 최초에 한 번 검사한다.
 *
 * DI 가 만들다 터지는 것과 다른 점은 **시점과 모양**이다. 여기서 잡으면 Sentry.init 도
 * Nest 컨테이너도 서기 전이라 스택 없이 "무엇이 없는지" 만 나오고, **빠진 것을 한 번에
 * 다 보여준다** — 하나씩 채우며 세 번 재기동하지 않아도 된다.
 *
 * 필요한 값은 앱마다 다르다(관리자 API 는 llm 키가 없어도 된다). 그래서 목록은 공통이
 * 아니라 각 앱의 boot-config 가 가진다.
 *
 * 빈 문자열도 없는 것으로 본다 — 시크릿을 빈값으로 두는 것은 끄겠다는 뜻이 아니라 실수다.
 */
export function requireSettings(cfg: ConfigSource, paths: readonly string[]): void {
  const missing = paths.filter((path) => !cfg.getStringOrDefault(path));
  if (missing.length === 0) return;
  throw new Error(
    `필수 설정이 없다:\n${missing
      .map((path) => `  ${path}  (환경변수 ${envNameOf(path)})`)
      .join('\n')}\n` + 'config/.env.<환경> 또는 config/config.<환경>.yaml 에 채울 것.',
  );
}
