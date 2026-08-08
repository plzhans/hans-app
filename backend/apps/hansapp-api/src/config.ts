import { createConfigSource } from '@hansapp/common';
import type { AppEnv, ConfigSource, DotenvLoader } from '@hansapp/common';

/**
 * 서버의 설정 접근자를 만든다. 계층형 .env(EnvSource) 위에 config/config.yaml + config.<환경>.yaml + 환경변수(__ 계층)를
 * 얹어, 경로로 값을 꺼낸다. 개별 값은 `cfg.getX(path)`, 복잡한 도메인만 객체로 뽑는다.
 * ConfigSource 는 EnvSource 를 확장하므로 기존 `requireString(cfg,...)` 계층에도 그대로 넘긴다.
 *
 * 반환한 접근자에서 **필요한 값은 부팅 시점에 한 번 읽어 고정**해 쓴다. 요청마다 getX 를
 * 부르지 않는다(경로 탐색 비용). 모듈 레벨 유틸은 init 함수로 값을 넘겨받아 굳힌다.
 */
export function loadServerConfig(
  appDir: string,
  env: AppEnv,
  loader: DotenvLoader,
): ConfigSource {
  return createConfigSource(appDir, env, loader);
}
