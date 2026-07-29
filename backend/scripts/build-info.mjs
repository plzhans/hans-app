// 산출물의 신원(dist/build-info.json)을 만든다.
//
//   node ../../scripts/build-info.mjs        (앱 패키지 디렉터리에서 — pnpm 이 그렇게 부른다)
//
// 각 앱의 `build` 스크립트 끝에 붙어 있어 **로컬 빌드와 도커 빌드가 같은 파일을 만든다.**
// 예전에는 Dockerfile 안에 `node -e "..."` 로 박혀 있었는데 세 가지가 문제였다.
//
//   - 로컬 `pnpm build` 로는 안 생겨서, 로컬로 띄우면 버전이 dev 로 찍혔다(이미지와 동작이 달랐다)
//   - api·batch Dockerfile 에 같은 코드가 두 벌 있었다
//   - 셸이 JS 문자열에 값을 보간해 이스케이프가 얽혔고, BuildInfo 의 tagVersion·branch 를
//     빠뜨린 것도 아무도 못 봤다(타입 검사가 닿지 않는 자리라서)
//
// [sha 를 어디서 얻나]
// 도커 빌드 컨텍스트에는 .git 이 없다(.dockerignore). 그래서 GIT_SHA·GIT_BRANCH 를
// 환경변수로 받고, 없으면 git 에 물어보고, 그것도 안 되면 dev 로 둔다.
// **없는 값을 그럴듯하게 지어내지 않는다** — 빌드된 산출물이 아니라는 사실이 드러나야
// "지금 뭐가 떠 있나" 를 답할 수 있다.
//
// [버전을 계산하지 않는다]
// package.json 의 version 은 "마지막으로 릴리스한 버전"(개발 중에는 <다음>-dev)이고
// 그 판단은 사람과 release-please 의 몫이다. 여기서는 읽어서 sha 를 붙일 뿐이다.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** git 에 물어본다. .git 이 없거나 git 이 없으면 undefined. */
function git(...args) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return undefined;
  }
}

const pkgDir = process.cwd();
const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf-8'));

const semver = pkg.version ?? '0.0.0';
const sha = process.env.GIT_SHA || git('rev-parse', 'HEAD') || 'dev';
const branch =
  process.env.GIT_BRANCH || git('rev-parse', '--abbrev-ref', 'HEAD') || 'dev';

// 짧은 sha. 'dev'·'unknown' 처럼 sha 가 아닌 값은 그대로 둔다(자르면 뜻이 사라진다).
const short = /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 7) : sha;

const info = {
  version: `${semver}+${short}`,
  // '+' 를 못 쓰는 곳(도커 태그·파일명)용.
  tagVersion: `${semver}-${short}`,
  semver,
  sha,
  branch,
  builtAt: new Date().toISOString(),
  node: process.version.replace(/^v/, ''),
};

// 출력 위치는 앱의 dist. tsconfig 의 outDir 과 맞춘다.
const out = join(pkgDir, 'dist', 'build-info.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(info, null, 2)}\n`);

console.log(`  build-info  ${info.version}  (${branch})`);
