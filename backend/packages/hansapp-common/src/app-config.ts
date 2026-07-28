import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load } from 'js-yaml';

import { CONFIG_DIR, findRootDir } from './env';

/**
 * `config/<name>.yaml` 을 읽어 설정 객체(섹션 트리)로 만든다. yaml 공급자의 원천이다 —
 * 병합·`${}` 치환은 config-source 의 build 단계가 담당한다(여기선 파일 읽기만).
 *
 * **baseDir:** 개발은 findRootDir 이 마커(pnpm-workspace.yaml)로 워크스페이스 루트(backend)를
 * 찾고, 배포 번들엔 마커가 없어 cwd(배포 경로)로 떨어진다. env.ts 의 경로 탐색과 같은 규칙이라
 * 개발은 어느 하위 폴더에서 띄워도, 배포는 cwd 기준으로 같은 자리를 집는다.
 *
 * @param appDir 바이너리(main.js)가 있는 디렉터리. 보통 __dirname.
 * @param name   yaml 파일 이름(확장자 제외). 'app'(공통 구조) 또는 환경 이름(오버라이드).
 */
export function loadYamlObject(
  appDir: string,
  name: string,
): Record<string, unknown> {
  const base = findRootDir(appDir) ?? process.cwd();
  const yamlPath = join(base, CONFIG_DIR, `${name}.yaml`);

  return existsSync(yamlPath)
    ? ((load(readFileSync(yamlPath, 'utf8')) as Record<string, unknown>) ?? {})
    : {};
}
