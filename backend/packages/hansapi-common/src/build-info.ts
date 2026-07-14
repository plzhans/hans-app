import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 이 산출물이 무엇인지. dist/build-info.json 은 빌드가 만든다(scripts/ci/build-backend.sh).
 *
 * 숫자(semver)는 사람용 라벨이고 **진짜 신원은 sha 다.**
 * 산출물과 같이 다니므로, 떠 있는 프로세스에 물어보면 자기가 어느 커밋인지 답한다.
 */
export interface BuildInfo {
  /** 0.0.1+a1b2c3d — 표시·로그용 */
  version: string;
  /** 0.0.1-a1b2c3d — docker 태그·파일명용('+' 를 못 쓰는 곳) */
  tagVersion: string;
  semver: string;
  sha: string;
  branch: string;
  builtAt: string;
  node: string;
}

/**
 * 개발 중에는 dist 가 아니라 src 를 직접 실행하므로(swc) build-info.json 이 없다.
 * 그때는 **빌드된 산출물이 아니라는 사실이 드러나야 한다** — sha 자리에 dev 가 찍힌다.
 * 조용히 그럴듯한 sha 로 위장하면 "지금 뭐가 떠 있는지" 를 영영 알 수 없게 된다.
 *
 * semver 만은 package.json 에서 진짜 값을 읽는다. OpenAPI 문서의 version 이 이 값을 쓰는데,
 * 개발 모드에서 스펙을 재생성할 때(openapi:gen 은 src 를 직접 돌린다) 'dev' 가 박혀
 * 커밋되면 곤란하기 때문이다.
 *
 * baseDir 의 한 단계 위가 패키지 루트다 — src/ 로 돌리든 dist/ 로 돌리든 똑같이 성립한다.
 */
function devBuildInfo(baseDir: string): BuildInfo {
  let semver = '0.0.0';
  try {
    const pkg = JSON.parse(
      readFileSync(resolve(baseDir, '../package.json'), 'utf-8'),
    ) as { version?: string };
    semver = pkg.version ?? semver;
  } catch {
    // package.json 을 못 찾아도 버전 조회 때문에 죽지는 않는다.
  }

  return {
    version: `${semver}+dev`,
    tagVersion: `${semver}-dev`,
    semver,
    sha: 'dev',
    branch: 'dev',
    builtAt: '',
    node: process.version.replace(/^v/, ''),
  };
}

const cache = new Map<string, BuildInfo>();

/**
 * build-info.json 을 읽는다.
 *
 * baseDir 는 **부르는 쪽의 __dirname** 이어야 한다. 이 함수가 @hansapi/common 안에 있어서,
 * 여기서 __dirname 을 쓰면 common 의 dist 를 가리키게 된다. 파일은 각 앱의 dist 에 있다.
 */
export function loadBuildInfo(baseDir: string): BuildInfo {
  const hit = cache.get(baseDir);
  if (hit) {
    return hit;
  }

  let info: BuildInfo;
  try {
    info = JSON.parse(
      readFileSync(resolve(baseDir, 'build-info.json'), 'utf-8'),
    ) as BuildInfo;
  } catch {
    info = devBuildInfo(baseDir);
  }

  cache.set(baseDir, info);
  return info;
}

/**
 * `--version` 이면 버전만 찍고 끝낸다. 서버·배치는 실행하지 않는다.
 *
 * **env 로딩보다 먼저** 불러야 한다. 세 앱 모두 모듈 최상위에서 loadEnv 를 하는데,
 * 버전을 물어보는 데 DB 접속정보까지 갖춰져 있어야 할 이유가 없다.
 *
 * 버전 문자열 한 줄만 stdout 으로 낸다. 스크립트에서 그대로 받아 쓸 수 있어야 한다.
 *   VERSION=$(node dist/main --version)
 */
export function exitIfVersionFlag(baseDir: string, argv = process.argv): void {
  if (!argv.includes('--version')) {
    return;
  }
  process.stdout.write(`${loadBuildInfo(baseDir).version}\n`);
  process.exit(0);
}
