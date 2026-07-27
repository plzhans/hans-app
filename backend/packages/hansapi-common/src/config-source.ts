import { loadEnv } from './env';
import type { AppEnv, DotenvLoader, EnvSource } from './env';
import { loadRawConfig } from './app-config';

/**
 * 병합된 설정 tree(config/<환경>.yaml + 환경변수 __계층) 위의 **경로 타입 게터**.
 * C#/Java 의 IConfiguration/Environment 처럼 값을 꺼낸다.
 *
 * **EnvSource 를 확장한다(superset).** 그래서 기존 `requireString(source,'KEY')` 나
 * `forRoot(source: EnvSource)` 는 ConfigSource 를 그대로 받아 동작하고, 준비된 계층부터
 * `cfg.getString('path')` 스타일로 옮기면 된다 — 카스케이드 없는 점진 이전.
 *
 * 경로는 'a.b.c' 또는 'a:b:c'. 개별 값은 여기서 바로 꺼내고(getString 등),
 * 복잡·응집된 설정(mail 등)만 이 게터로 값을 뽑아 자기 도메인 객체를 만든다.
 *
 * **읽기 시점**: 필요한 값은 부팅 때 한 번 읽어 고정해 쓴다(요청마다 getX 를 부르지 않는다 —
 * 경로 탐색 비용). getX 는 값이 없으면 부팅을 거부하고, getXOrDefault 는 기본값을 준다.
 */
export interface ConfigSource extends EnvSource {
  /** 원시값(객체·배열·스칼라). 없으면 undefined. 하위 구조를 통째로 받을 때 쓴다. */
  getValue(path: string): unknown;

  /** 필수 문자열. 없거나 비면 부팅 거부. */
  getString(path: string): string;
  /** 없으면 기본값(기본 빈 문자). */
  getStringOrDefault(path: string, fallback?: string): string;

  /** 필수 숫자. 숫자가 아니면 던진다. */
  getNumber(path: string): number;
  getNumberOrDefault(path: string, fallback: number): number;

  /** true/false 또는 'true'/'false' 문자열. */
  getBool(path: string): boolean;
  getBoolOrDefault(path: string, fallback: boolean): boolean;
}

/** 'a.b.c' / 'a:b:c' 경로를 따라 tree 를 내려간다. */
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

/** 값이 실제로 있는가(undefined/null/빈문자 아님). */
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

/**
 * 설정 접근자를 만든다. EnvSource(계층형 .env 로드) 위에 yaml + 경로 게터를 얹는다.
 *
 * 순서: loadEnv 가 .env 를 process.env 에 올린 **뒤에** yaml+env tree 를 만든다
 * (환경변수 오버라이드를 읽어야 하므로). EnvSource 부분(get/env/files)은 loadEnv 결과에
 * 그대로 위임해 기존 동작을 100% 보존한다.
 *
 * @param appDir 바이너리(main.js)가 있는 디렉터리. 보통 __dirname.
 * @param loader dotenv 의 config. common 이 dotenv 에 직접 의존하지 않기 위해 주입받는다.
 */
export function createConfigSource(
  appDir: string,
  env: AppEnv,
  loader: DotenvLoader,
): ConfigSource {
  const envSource = loadEnv(appDir, env, loader);
  const tree = loadRawConfig(appDir, env);

  return {
    // EnvSource 부분 — process.env 기반 기존 동작 그대로 위임.
    env: envSource.env,
    files: envSource.files,
    get: (key) => envSource.get(key),

    // 경로 게터 — yaml+env tree 위에서.
    getValue: (path) => getByPath(tree, path),

    getString: (path) => {
      const raw = getByPath(tree, path);
      if (!present(raw)) {
        throw new Error(`필수 설정이 없다: ${path}`);
      }
      return String(raw).trim();
    },
    getStringOrDefault: (path, fallback = '') => {
      const raw = getByPath(tree, path);
      return present(raw) ? String(raw).trim() : fallback;
    },

    getNumber: (path) => {
      const raw = getByPath(tree, path);
      if (!present(raw)) {
        throw new Error(`필수 설정이 없다: ${path}`);
      }
      return toNumber(raw, path);
    },
    getNumberOrDefault: (path, fallback) => {
      const raw = getByPath(tree, path);
      return present(raw) ? toNumber(raw, path) : fallback;
    },

    getBool: (path) => {
      const raw = getByPath(tree, path);
      if (!present(raw)) {
        throw new Error(`필수 설정이 없다: ${path}`);
      }
      return toBool(raw, path);
    },
    getBoolOrDefault: (path, fallback) => {
      const raw = getByPath(tree, path);
      return present(raw) ? toBool(raw, path) : fallback;
    },
  };
}
