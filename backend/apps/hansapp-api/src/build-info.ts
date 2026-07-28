import { loadBuildInfo, type BuildInfo } from '@hansapp/common';

export type { BuildInfo };

/**
 * 이 앱의 build-info.json 을 읽는다.
 *
 * __dirname 을 여기서 잡는 이유: 이 파일은 hansapp-api 의 dist 안에 컴파일되므로
 * __dirname 이 곧 이 앱의 dist 다. @hansapp/common 안에서 잡으면 common 의 dist 를 가리킨다.
 */
export function buildInfo(): BuildInfo {
  return loadBuildInfo(__dirname);
}
