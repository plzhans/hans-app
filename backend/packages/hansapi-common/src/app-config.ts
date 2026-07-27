import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load } from 'js-yaml';
import merge from 'lodash.merge';

import { CONFIG_DIR, findRootDir } from './env';
import type { AppEnv } from './env';

/**
 * 환경변수를 계층 객체로 편다. .NET 의 `Section__Key` 규칙과 같은 발상이다.
 *
 *   PORT               → { port }
 *   TRUST_PROXY        → { trustProxy }               (단일 _ 는 세그먼트 안에서 camelCase)
 *   DATABASE__URL      → { database: { url } }         (__ 는 계층 경계)
 *   MAIL__SMTP__HOST   → { mail: { smtp: { host } } }
 *
 * **왜 이 파일 하나에서만 process.env 를 읽나:** 이렇게 한 번 계층 객체로 만든 뒤
 * yaml 위에 얹으면, 앱 코드는 process.env 를 직접 안 보고 검증된 설정 객체만 본다.
 *
 * **시스템 env(PATH 등)도 함께 펴진다.** 걸러내지 않는다 — 소비 계층이 ConfigSource 의
 * getX 로 **필요한 경로만** 읽으므로, 안 읽는 키는 tree 에 남아도 최종 설정에 영향이 없다.
 * .NET 이 모든 env 를 설정 소스로 두고 바인딩만 선별하는 것과 같다.
 */
export function expandEnv(env: NodeJS.ProcessEnv): Record<string, unknown> {
  const camel = (segment: string): string =>
    segment
      .toLowerCase()
      .replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

  const out: Record<string, unknown> = {};
  for (const [rawKey, value] of Object.entries(env)) {
    if (value === undefined) {
      continue;
    }
    const segments = rawKey.split('__').map(camel);
    let node = out;
    while (segments.length > 1) {
      const key = segments.shift() as string;
      const next = node[key];
      node =
        typeof next === 'object' && next !== null
          ? (next as Record<string, unknown>)
          : (node[key] = {});
    }
    node[segments[0]] = value;
  }
  return out;
}

/**
 * `config/<환경>.yaml` 을 읽고 환경변수(__ 계층)를 위에 얹어 원시 설정 객체를 만든다.
 * **검증은 하지 않는다** — 어떤 키가 필수인지는 이 설정을 쓰는 각 앱의 zod 스키마가
 * 판단한다(env.ts 의 EnvSource 와 같은 원칙: common 은 키를 모른다).
 *
 * 병합 우선순위(낮음 → 높음):
 *   1. config/<환경>.yaml     비밀 아닌 기본값. 커밋된다.
 *   2. process.env            시크릿·오버라이드(.env 는 미리 dotenv 로 로드돼 있어야 한다)
 *
 * **baseDir:** 개발은 findRootDir 이 마커(pnpm-workspace.yaml)로 워크스페이스 루트(backend)를
 * 찾고, 배포 번들엔 마커가 없어 cwd(배포 경로)로 떨어진다. env.ts 의 경로 탐색과 같은 규칙이라
 * 개발은 어느 하위 폴더에서 띄워도, 배포는 cwd 기준으로 같은 자리를 집는다.
 *
 * **호출 순서 주의:** process.env 를 읽으므로, 시크릿을 담은 .env 는 이 함수 전에 로드해야
 * 한다(main 에서 loadEnv 뒤에 부른다).
 *
 * @param appDir 바이너리(main.js)가 있는 디렉터리. 보통 __dirname.
 */
export function loadRawConfig(
  appDir: string,
  env: AppEnv,
): Record<string, unknown> {
  const base = findRootDir(appDir) ?? process.cwd();
  const yamlPath = join(base, CONFIG_DIR, `${env}.yaml`);

  const fromYaml = existsSync(yamlPath)
    ? ((load(readFileSync(yamlPath, 'utf8')) as Record<string, unknown>) ?? {})
    : {};

  // lodash.merge 는 깊게 병합한다(중첩 키를 통째로 갈아치우지 않는다). env 가 뒤라 이긴다.
  return merge({}, fromYaml, expandEnv(process.env));
}
