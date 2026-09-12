/**
 * 이 CLI 가 받는 값. 전부 환경변수다.
 *
 * hans-api 의 설정 체계(config.yaml + env_setting)를 쓰지 않는다. MediFinder 는 그 시스템의
 * 일부가 아니라 외부 소비자라, 자기 자격증명을 자기가 들고 있어야 한다.
 */
import path from 'node:path';

import { config as loadDotenv } from 'dotenv';

import type { MedifinderConfig, R2Config } from '@medifinder/admin-application';

export function loadConfig(): MedifinderConfig {
  /*
    **.env 는 이 앱 디렉터리에서 읽는다. 현재 작업 디렉터리가 아니다.**

    `pnpm medifinder-cli` 는 backend/ 에서 도는데 .env 는 앱 옆에 둔다. cwd 기본값을
    그대로 쓰면 어디서 부르느냐에 따라 설정이 달라 보인다 — 같은 명령이 자리에 따라
    다르게 도는 것은 디버깅할 수 없다.

    이미 들어 있는 환경변수는 덮지 않는다(dotenv 기본). CI 는 .env 없이 환경변수로만 준다.
  */
  loadDotenv({ path: path.resolve(__dirname, '..', '.env') });

  return {
    api: {
      baseUrl: required('HANSAPP_BASE_URL'),
      serviceKey: required('HANSAPP_SERVER_KEY'),
    },
    siteUrl: required('MEDIFINDER_SITE_URL'),
    appEnv: required('MEDIFINDER_APP_ENV'),
    r2: optionalR2(),
  };
}

/**
 * R2 설정은 다 있을 때만 만든다.
 *
 * **하나라도 빠지면 통째로 없는 것으로 본다.** 반쯤 채워진 자격증명으로 업로드를 시도하면
 * SigV4 서명이 엉뚱하게 성립해 403 만 보게 된다 — 어느 값이 틀렸는지 응답에 안 나온다.
 * 만들기(build)는 이 값이 없어도 돌아야 하므로 여기서 던지지 않는다.
 */
function optionalR2(): R2Config | undefined {
  const accountId = process.env.R2_ACCOUNT_ID;
  const bucket = process.env.R2_BUCKET;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
    return undefined;
  }
  return { accountId, bucket, accessKeyId, secretAccessKey };
}

/**
 * 없으면 여기서 죽는다.
 *
 * 기본값을 두지 않는 이유는, 자격증명이 빠진 채로 돌면 API 가 401 을 주고 사이트맵은
 * 만들어지지 않는데 그 사실이 로그 한 줄로만 남기 때문이다. 시작할 때 죽는 편이 낫다.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

/** 어느 설정으로 도는지 stderr 에 남긴다. 자격증명은 있고 없음만 밝힌다. */
export function describeConfig(config: MedifinderConfig): string {
  return [
    `api  ${config.api.baseUrl}  (serviceKey ${mask(config.api.serviceKey)})`,
    `site ${config.siteUrl}`,
    `env  ${config.appEnv}`,
    `r2   ${config.r2 ? `${config.r2.bucket}/${config.appEnv}` : '(설정 없음 — 업로드 불가)'}`,
  ].join('\n');
}

/** 앞 8자만 남긴다. 어느 키인지는 알아볼 수 있고 훔쳐 쓸 수는 없다. */
function mask(value: string): string {
  return value.length <= 8 ? '********' : `${value.slice(0, 8)}…`;
}
