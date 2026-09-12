/**
 * 이 CLI 가 받는 값. 전부 환경변수다.
 *
 * hans-api 의 설정 체계(config.yaml + env_setting)를 쓰지 않는다. MediFinder 는 그 시스템의
 * 일부가 아니라 외부 소비자라, 자기 자격증명을 자기가 들고 있어야 한다.
 */
import path from 'node:path';

import { config as loadDotenv } from 'dotenv';

import type { MedifinderConfig } from '@medifinder/admin-application';

/** 고를 수 있는 환경. 레포의 다른 곳(APP_ENVS)과 같은 이름을 쓴다. */
export const APP_ENVS = ['develop', 'production'] as const;
export type AppEnv = (typeof APP_ENVS)[number];

export function isAppEnv(value: string): value is AppEnv {
  return (APP_ENVS as readonly string[]).includes(value);
}

export function loadConfig(appEnv: AppEnv): MedifinderConfig {
  /*
    **medifinder/backend/config/ 에서 읽는다. 현재 작업 디렉터리가 아니다.**

    hansapp 의 backend/config/ 와 같은 자리·같은 이름 규칙이다 — env 파일은 config/ 바로
    밑에 평면으로 두고, 환경별 .env.<환경> 과 개인 오버라이드 .env.<환경>.local 이 있다.
    시크릿은 sops 로 .enc 를 만들어 커밋한다.

    cwd 기본값을 쓰지 않는 이유는 어디서 부르느냐에 따라 설정이 달라 보이기 때문이다 —
    같은 명령이 자리에 따라 다르게 도는 것은 디버깅할 수 없다.
    **환경 이름은 파일 안에 없다** — 어느 파일을 읽을지 정하는 값이 그 파일 안에 있으면
    둘이 어긋났을 때 무엇이 맞는지 알 수 없다.

    이미 들어 있는 환경변수는 덮지 않는다(dotenv 기본). CI 는 파일 없이 환경변수로만 준다.
  */
  const configDir = path.resolve(__dirname, '..', '..', '..', 'config');
  // 개인 오버라이드가 먼저다 — dotenv 는 이미 들어 있는 값을 덮지 않으므로 먼저 읽은 쪽이 이긴다.
  loadDotenv({ path: path.join(configDir, `.env.${appEnv}.local`) });
  loadDotenv({ path: path.join(configDir, `.env.${appEnv}`) });

  return {
    api: {
      baseUrl: required('HANSAPP_BASE_URL'),
      serviceKey: required('HANSAPP_SERVER_KEY'),
    },
    siteUrl: required('MEDIFINDER_SITE_URL'),
    appEnv,
  };
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
  ].join('\n');
}

/** 앞 8자만 남긴다. 어느 키인지는 알아볼 수 있고 훔쳐 쓸 수는 없다. */
function mask(value: string): string {
  return value.length <= 8 ? '********' : `${value.slice(0, 8)}…`;
}
