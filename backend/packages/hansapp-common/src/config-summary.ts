import type { ConfigSource } from './config-source';

/**
 * 부팅 시 계산된 설정 요약을 **한 줄씩** log 콜백으로 남긴다(멀티라인 한 덩어리보다 가독이 좋다).
 * **시크릿은 마스킹**한다 — DB/Redis/ES URL 은 자격증명(user:pass)을 떼고 host[/db] 만 남긴다.
 *
 * **여기 나오는 것은 설정 파일 값뿐이다.** 메일·서비스키·OAuth·LLM 은 DB(env_setting)로
 * 옮겨서 부팅 시점에 요약해 봐야 실제로 쓰이는 값이 아니다 — 무엇이 물려 있는지는 관리
 * 화면에서 본다. 부팅 로그가 런타임에 바뀌는 값을 말하면 그 순간부터 거짓이 된다.
 *
 * log 콜백을 받아 출력 대상을 앱이 정한다(서버/배치=NestJS Logger, CLI=stderr 로 stdout 오염 방지).
 */
export function logConfigSummary(cfg: ConfigSource, log: (line: string) => void): void {
  const endpoint = (raw: string): string => {
    if (!raw) return '(empty)';
    try {
      const u = new URL(raw);
      return `${u.host}${u.pathname}`;
    } catch {
      return '(missing)';
    }
  };
  const s = (path: string): string => cfg.getStringOrDefault(path);
  // 요약도 앱이 실제로 쓰는 형태(자격증명 인코딩 후)를 보여줘야 한다. 원문을 그대로 파싱하면
  // 비밀번호의 `#` 하나에 (missing) 이 찍혀 "설정이 빠졌다" 로 오독하게 된다.
  const u = (path: string): string => cfg.getUrlOrDefault(path);

  log(`Config AppEnv : ${cfg.env}`);
  log(`Config Database : ${endpoint(u('database.url'))}`);
  log(`Config Redis: ${endpoint(u('redis.url'))}`);
  // 인덱스 접두사도 같이 남긴다. 이게 어긋나면 붙기는 붙고 **빈 인덱스를 조회**하는데,
  // 주소만 찍혀 있으면 정상으로 보인다. 미설정 시 환경 이름으로 떨어지는 것도 여기서 보인다.
  log(
    `Config Elasticsearch : ${endpoint(u('elasticsearch.url'))} (index prefix: ${
      s('elasticsearch.indexPrefix') || cfg.env
    })`,
  );
  /*
    **메일 설정은 여기서 안 찍는다.** 값이 DB(env_setting)에 있어서 설정 파일을 요약해 봐야
    실제로 쓰이는 값이 아니다 — 부팅 시점 요약이 런타임에 바뀌는 값을 말하면 거짓이 된다.
    무엇이 설정돼 있는지는 관리 화면에서 본다.

    다만 **강제 차단은 찍는다.** 이건 설정 파일에만 있는 값이라 부팅에 확정되고, 켜 두면
    화면에서 아무리 켜도 메일이 안 나가서 "왜 안 오지" 를 가장 오래 헤매게 되는 자리다.
  */
  if (cfg.getBoolOrDefault('mail.forceDisabled')) {
    log(
      'Config Mail : ⚠️ Force-disabled (mail.forceDisabled) — no mail is sent regardless of DB settings',
    );
  }
  /*
    **OAuth 도 여기서 안 찍는다.** 메일·서비스키와 같은 이유다 — 값이 DB(env_setting)에
    있어서 설정 파일 요약은 실제로 쓰이는 값이 아니다.
  */
  /*
    **LLM 도 여기서 안 찍는다.** 자격증명·모델·한도가 DB(env_setting)에 있어 설정 파일
    요약은 실제로 쓰이는 값이 아니다. 무엇이 물려 있는지는 관리 화면에서 본다.
  */
  /*
    **서비스키도 여기서 안 찍는다.** 메일과 같은 이유다 — 값이 DB(env_setting)에 있어서
    설정 파일 요약은 실제로 쓰이는 값이 아니다. 무엇이 설정돼 있는지는 관리 화면에서 본다.
  */
}
