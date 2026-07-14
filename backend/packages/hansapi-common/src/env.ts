import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

/** 지원하는 실행 환경. env 파일명(.env.<환경>)과 1:1 대응한다. */
export const APP_ENVS = ['local', 'dev', 'prod'] as const;
export type AppEnv = (typeof APP_ENVS)[number];

/**
 * 기본 환경. 아직 로컬 DB 가 없어 공유 개발 DB(dev)를 본다.
 * 로컬 도커 MySQL 을 붙이면 'local' 로 바꾼다.
 */
export const DEFAULT_APP_ENV: AppEnv = 'dev';

export function isAppEnv(value: string): value is AppEnv {
  return (APP_ENVS as readonly string[]).includes(value);
}

/**
 * 환경 이름을 정한다. 우선순위: 인자 > APP_ENV 환경변수 > 기본값.
 * 지원하지 않는 이름이면 즉시 실패시킨다. 엉뚱한 DB 에 붙는 것보다 낫다.
 */
export function resolveAppEnv(explicit?: string): AppEnv {
  const value = explicit ?? process.env.APP_ENV ?? DEFAULT_APP_ENV;
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
 * 계층이 한다(@hansapi/data 는 DATABASE_URL, @hansapi/admin-application 은 KRDATA_SERVICE_KEY).
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
 * env 파일들이 있는 디렉토리. 모든 앱이 backend/env/ 를 공유한다.
 * DB 접속정보를 앱마다 중복시키지 않도록 특정 앱이 소유하지 않는다.
 *
 * @param appDir 실행 중인 파일의 디렉토리(__dirname). <backend>/apps/<앱>/{src|dist} 를 전제한다.
 */
export function envDir(appDir: string): string {
  return resolve(appDir, '../../../env');
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
 *   1. process.env          컨테이너·CI 가 주입한 값        ← 파일이 절대 못 덮는다
 *   2. ENV_FILE             배포에서 지정한 절대경로 (선택)
 *   3. .env.<환경>.local    개인 오버라이드 (gitignore)
 *   4. .env.<환경>          환경별 설정
 *   5. .env                 공통 기본값
 *
 * 파일이 하나도 없어도 에러가 아니다. 쿠버네티스처럼 환경변수를 직접 주입하는 배포에서는
 * env 파일이 이미지에 들어가지 않기 때문이다. 값이 비었는지는 각 계층이 판단한다.
 *
 * process.env 를 읽는 곳은 여기 하나뿐이다. 다른 코드는 EnvSource 를 통해서만 설정을 본다.
 */
export function loadEnv(
  appDir: string,
  env: AppEnv,
  loader: DotenvLoader,
): EnvSource {
  const dir = envDir(appDir);

  const candidates = [
    process.env.ENV_FILE,
    resolve(dir, `.env.${env}.local`),
    resolve(dir, `.env.${env}`),
    resolve(dir, '.env'),
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

/**
 * 필수 설정을 꺼낸다. 없으면 부팅을 거부한다.
 * 커맨드를 실행하는 순간이 아니라 앱이 뜨기 전에 죽어야 한다.
 */
export function requireString(source: EnvSource, key: string): string {
  const value = source.get(key)?.trim();
  if (!value) {
    const origin =
      source.files.length > 0
        ? `읽은 파일: ${source.files.join(', ')}`
        : '읽은 env 파일이 없다. 환경변수로 주입했다면 값이 비어 있는지 확인하라.';
    throw new Error(
      `환경(${source.env})에 필수 설정이 없다: ${key}\n${origin}\nenv/.env.example 을 참고하라.`,
    );
  }
  return value;
}

/** 선택 설정. 없으면 undefined. */
export function optionalString(
  source: EnvSource,
  key: string,
): string | undefined {
  return source.get(key)?.trim() || undefined;
}

/** 숫자 설정. 없으면 기본값. 숫자가 아니면 부팅을 거부한다. */
export function optionalNumber(
  source: EnvSource,
  key: string,
  fallback: number,
): number {
  const raw = optionalString(source, key);
  if (raw === undefined) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`설정 ${key} 는 숫자여야 한다. 받은 값: ${raw}`);
  }
  return value;
}
