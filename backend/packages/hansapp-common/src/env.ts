import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

/**
 * 지원하는 실행 환경. env 파일명(<환경>.env)과 1:1 대응한다.
 *
 * **GitHub Environment 이름과도 같다.** 예전엔 앱은 dev|prod, GitHub 은 develop|production 이라
 * 배포 스크립트가 그 사이를 번역했다. 이제 그 번역이 없다.
 * 번역이 있는 곳에는 반드시 어긋나는 순간이 온다 — 그리고 그게 어긋나면 **엉뚱한 DB 에
 * 붙는다.** 이름을 하나로 두면 번역할 게 없어진다.
 */
export const APP_ENVS = ['local', 'develop', 'production'] as const;
export type AppEnv = (typeof APP_ENVS)[number];

/**
 * **기본 환경을 두지 않는다.** APP_ENV 가 없으면 부팅을 거부한다.
 *
 * APP_ENV 는 설정 파일을 고르는 값에 그치지 않는다 — Redis 키 네임스페이스와
 * Elasticsearch 인덱스 별칭이 여기서 파생된다(둘 다 환경들이 한 대를 공유한다).
 * 그래서 기본값을 잘못 잡으면 **엉뚱한 환경의 데이터를 건드린다.**
 *
 *   기본값을 develop 으로  → APP_ENV 를 빠뜨린 production 이 develop 데이터를 쓴다
 *   기본값을 production 으로 → 로컬에서 무심코 띄운 앱이 운영 인덱스를 재색인한다
 *
 * 어느 쪽으로 떨어져도 손해라면 떨어지지 않는 것이 맞다. 안 뜨는 편이 조용히
 * 잘못된 곳에 쓰는 것보다 낫다.
 */

export function isAppEnv(value: string): value is AppEnv {
  return (APP_ENVS as readonly string[]).includes(value);
}

/**
 * 환경 이름을 정한다. 우선순위: 인자 > APP_ENV 환경변수. **기본값은 없다.**
 * 없거나 지원하지 않는 이름이면 즉시 실패시킨다 — 엉뚱한 환경의 데이터를 건드리는 것보다 낫다.
 *
 * 배포에서는 도커가 env 파일을 읽어 환경변수로 주입한다(compose 의 env_file). 그래서
 * 이 함수가 도는 시점에 APP_ENV 가 이미 process.env 에 있다 — 파일을 먼저 읽을 필요가 없다.
 */
export function resolveAppEnv(explicit?: string): AppEnv {
  const value = explicit ?? process.env.APP_ENV;
  if (!value) {
    throw new Error(
      `APP_ENV 가 없다. 가능한 값: ${APP_ENVS.join(', ')}. ` +
        'env 파일(config/.env)이나 환경변수로 지정할 것.',
    );
  }
  if (!isAppEnv(value)) {
    throw new Error(
      `알 수 없는 환경: ${value}. 가능한 값: ${APP_ENVS.join(', ')}`,
    );
  }
  return value;
}

/**
 * 설정 값의 원본. 계층을 다 쌓은 결과다.
 *
 * 이 모듈은 **어떤 키가 있어야 하는지 모른다.** 필수값 검증은 그 설정을 실제로 쓰는
 * 계층이 한다(@hansapp/data 는 DATABASE_URL, @hansapp/admin-application 은 KRDATA_SERVICE_KEY).
 * 서버가 쓰지도 않는 서비스키 때문에 부팅에 실패하면 안 되기 때문이다.
 */
export interface EnvSource {
  readonly env: AppEnv;

  /** 실제로 읽은 파일들. 우선순위 순. 하나도 없을 수 있다(환경변수 주입 배포). */
  readonly files: readonly string[];

  /** 값 조회. 없으면 undefined. */
  get(key: string): string | undefined;
}

/**
 * 워크스페이스 루트(backend). **개발용 도구 전용이다 — 런타임 코드는 쓰면 안 된다.**
 *
 * 배포된 앱은 워크스페이스 밖에서 돈다. 번들에는 dist 와 node_modules 만 있고
 * pnpm-workspace.yaml 이 없다. 여기서 던지면 앱이 부팅조차 못 한다.
 * 앱이 설정을 찾을 때는 envFiles(cwd·바이너리 기준)를 쓴다.
 *
 * 쓰는 곳: CLI 의 i18n export 가 backend/temp/ 를 찾을 때.
 *
 * **cwd 로 찾으면 안 된다.** CLI 는 `pnpm --filter hansapp-cli start` 로 도는데 그러면
 * cwd 가 apps/hansapp-cli 다. **깊이를 세도 안 된다.** commands/ 같은 하위 폴더에서 부르면
 * 한 단계 어긋나 backend/apps/temp/ 에 파일이 생긴다(실제로 그랬다). 그래서 마커를 찾는다.
 *
 * @param fromDir 아무 파일의 __dirname
 */
export function rootDir(fromDir: string): string {
  const found = findRootDir(fromDir);
  if (!found) {
    throw new Error(
      `워크스페이스 루트를 못 찾았다 (pnpm-workspace.yaml 없음). 시작 위치: ${fromDir}\n` +
        `배포된 서버에서 불렀다면 그게 버그다 — 런타임 코드는 rootDir 을 쓰면 안 된다.`,
    );
  }
  return found;
}

/** rootDir 과 같지만 못 찾으면 undefined. 워크스페이스 안인지 판별할 때 쓴다. */
export function findRootDir(fromDir: string): string | undefined {
  let dir = resolve(fromDir);

  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}

/**
 * 설정에 적힌 **상대경로**를 푼다(인증서·jwt 키처럼 config/ 아래 에셋을 가리키는 값).
 *
 * yaml·env 는 워크스페이스 마커로 base 를 찾는데(findRootDir), 에셋 경로는 그냥 cwd
 * 기준으로 열려서 **같은 설정인데 찾는 기준이 둘**이었다. 그래서 하위 디렉터리에서
 * 띄우면 yaml 은 읽히는데 인증서만 조용히 안 잡혔다 — VSCode 디버그가 그렇게 깨졌다.
 *
 * 배포에는 영향이 없다. 이미지에 마커가 없어 findRootDir 이 undefined 를 주고, cwd(/app)
 * 로 떨어져 지금과 같은 경로가 된다.
 *
 * @param appDir 바이너리가 있는 디렉터리(보통 __dirname). 마커 탐색의 시작점이다.
 */
export function resolveConfigPath(appDir: string, value: string): string {
  if (isAbsolute(value)) {
    return value;
  }
  const cwd = process.cwd();
  const root = findRootDir(appDir);
  // cwd 를 먼저 본다 — 명시적으로 띄운 위치가 이긴다(envFiles 와 같은 규칙).
  for (const base of [cwd, root]) {
    if (!base) continue;
    const path = resolve(base, value);
    if (existsSync(path)) {
      return path;
    }
  }
  // 어디에도 없으면 cwd 기준으로 돌려준다. 없는 파일을 여는 쪽이 에러 메시지가 명확하다.
  return resolve(cwd, value);
}

/** 설정 파일을 모아 두는 디렉터리 이름. */
export const CONFIG_DIR = 'config';

/**
 * 설정 파일을 찾을 자리. **뒤에 있을수록 우선순위가 높다.**
 *
 * ```
 *   <바이너리>/.env                    ← 번들에 같이 담긴 기본값
 *   <바이너리>/.env.<환경>
 *   <cwd>/config/.env                  ← 환경 무시하고 항상 불러들이는 설정(비밀 포함 가능)
 *   <cwd>/config/.env.<환경>           ← 환경별 (예: .env.develop)
 *   <cwd>/.env
 *   <cwd>/.env.<환경>                  ← 로컬 오버라이드용. 가장 높다
 * ```
 *
 * **파일명 규칙: `.env` 로 시작한다.** 항상 불러오는 .env, 환경별 .env.<환경>(.env.develop …),
 * 개인 오버라이드 .env.<환경>.local. **env 파일은 config/ 바로 밑에 평면**으로 둔다.
 *
 * **config/<환경>/ 는 env 파일이 아니라 환경별 에셋(jwt 키·인증서 등)을 모으는 폴더다** —
 * 설정(env·yaml)과 에셋(바이너리)을 구분한다. 배포(deploy-backend.sh)는 config/ 를
 * <배포경로>/config/ 로 그대로 올리므로 개발·서버 어느 쪽이든 같은 자리에서 잡힌다.
 *
 * **깊이를 세서 `../../..` 로 올라가지 않는다.** 예전엔 그렇게 했는데, 그 깊이는 "앱이
 * apps/<앱>/dist 에 있다" 는 **배치 가정**에 묶여 있었다. 배치가 바뀌면 조용히 엉뚱한 곳을
 * 가리키고, 앱이 부팅하다 죽고 나서야 안다. 실제로 그렇게 한 번 깨졌다.
 *
 * 대신 config 후보를 두 base 밑에서 만든다: **실행 위치(cwd)와 워크스페이스 루트.**
 * 워크스페이스 루트는 깊이가 아니라 **마커(pnpm-workspace.yaml)로 찾는다**(findRootDir).
 * 그래서 개발에선 apps/<앱> 이든 backend 든 **어느 하위 폴더에서 띄워도** backend/config 를
 * 정확히 집는다. **배포 번들엔 그 마커가 없어** findRootDir 이 undefined → 배포에서는 자연히
 * cwd 만 남는다(배포는 cwd 를 배포 경로로 맞춰 준다). 개발은 위치에 안 흔들리고, 배포는 그대로.
 *
 *   개발   어디서 띄우든    → <워크스페이스루트>/config/.env.develop  (마커로 루트를 찾음)
 *   서버   cwd = <배포경로>  → <배포경로>/config/.env.develop         (마커 없음 → cwd)
 *
 * ENV_FILE 에 절대경로를 주면 그건 파일 탐색보다 우선한다.
 *
 * @param appDir 바이너리(main.js)가 있는 디렉터리. 보통 __dirname.
 */
export function envFiles(appDir: string, env: AppEnv): string[] {
  const cwd = process.cwd();
  // 워크스페이스 루트를 마커(pnpm-workspace.yaml)로 찾는다. 개발이면 backend, 배포 번들엔
  // 마커가 없어 undefined. config/ 후보를 만들 base 를 cwd 와 루트(있으면) 둘로 둔다.
  const root = findRootDir(appDir);
  // 루트보다 cwd 가 세다(명시적으로 띄운 위치가 이긴다). 둘이 같으면(예: cwd=backend) 하나로.
  const bases = [
    ...new Set([root, cwd].filter((d): d is string => Boolean(d))),
  ];

  // 한 base 밑 config/ 후보 (낮은→높은). **env 파일은 config/ 바로 밑에 평면으로** 둔다.
  // (config/<환경>/ 은 jwt 키 등 환경별 에셋 폴더라 env 파일과 구분한다.)
  //   config/.env            공통(항상)
  //   config/.env.<환경>      환경별 (예: .env.develop)
  const configAt = (base: string): string[] => [
    join(base, CONFIG_DIR, '.env'),
    join(base, CONFIG_DIR, `.env.${env}`),
  ];
  // 개인 오버라이드(gitignore). 남의 머신에는 없다. 파일 중에서는 가장 세다.
  //   config/.env.<환경>.local  (예: .env.develop.local)
  const localAt = (base: string): string[] => [
    join(base, CONFIG_DIR, `.env.${env}.local`),
  ];

  // 낮은 우선순위부터 쌓고 마지막에 뒤집는다. 위 주석의 표와 순서를 같게 두면
  // "표와 코드 중 어느 쪽이 맞나" 를 고민할 일이 없다.
  const lowToHigh = [
    join(appDir, '.env'),
    join(appDir, `.env.${env}`),
    ...bases.flatMap(configAt),
    join(cwd, '.env'),
    join(cwd, `.env.${env}`),
    ...bases.flatMap(localAt),
    join(cwd, `.env.${env}.local`),
  ];

  return lowToHigh.reverse();
}

/**
 * dotenv 의 config 를 주입받는다. common 이 dotenv 에 의존하지 않기 위해서다.
 * quiet 를 켜지 않으면 dotenv 가 stdout 에 팁을 찍어 JSON 출력을 오염시킨다.
 */
export type DotenvLoader = (options: {
  path: string;
  quiet?: boolean;
}) => unknown;

/**
 * 설정을 계층으로 쌓아 올린다. Spring 의 application.yml + application-{profile}.yml 과 같은 방식이다.
 *
 * dotenv 는 **이미 process.env 에 있는 키를 덮어쓰지 않는다.** 그래서 우선순위가 높은 것부터
 * 읽으면 먼저 채워진 값이 그대로 이긴다.
 *
 *   1. process.env          컨테이너·CI 가 주입한 값     ← 파일이 절대 못 덮는다
 *   2. ENV_FILE             절대경로로 콕 집어 준 파일
 *   3. envFiles()           cwd·바이너리 기준 탐색 (그 주석의 표 참고)
 *
 * 파일이 하나도 없어도 에러가 아니다. 쿠버네티스처럼 환경변수를 직접 주입하는 배포에서는
 * 설정 파일이 이미지에 들어가지 않기 때문이다. 값이 비었는지는 각 계층이 판단한다.
 *
 * process.env 를 읽는 곳은 여기 하나뿐이다. 다른 코드는 EnvSource 를 통해서만 설정을 본다.
 */
export function loadEnv(
  appDir: string,
  env: AppEnv,
  loader: DotenvLoader,
): EnvSource {
  const candidates = [
    // ENV_FILE 은 배포가 절대경로로 콕 집어 주는 값이라 파일 탐색보다 우선한다.
    process.env.ENV_FILE,
    ...envFiles(appDir, env),
  ];

  const files: string[] = [];
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    const path = isAbsolute(candidate)
      ? candidate
      : resolve(process.cwd(), candidate);
    if (!existsSync(path)) {
      continue;
    }
    // override 하지 않는 것이 dotenv 기본 동작이다. 먼저 읽은 값이 이긴다.
    // quiet: dotenv 가 stdout 에 팁을 출력하면 JSON 파이핑이 깨진다.
    loader({ path, quiet: true });
    files.push(path);
  }

  return {
    env,
    files,
    get: (key) => process.env[key],
  };
}
