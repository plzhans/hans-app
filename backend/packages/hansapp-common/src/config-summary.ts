import type { ConfigSource } from './config-source';

/**
 * 부팅 시 계산된 설정 요약을 **한 줄씩** log 콜백으로 남긴다(멀티라인 한 덩어리보다 가독이 좋다).
 * **시크릿은 마스킹**한다 — DB/Redis/ES URL 은 자격증명(user:pass)을 떼고 host[/db] 만,
 * 서비스키는 앞 5글자 + `*****`. OAuth clientId 는 비밀이 아니라(리다이렉트에 노출) opts.oauth 면 그대로 남긴다.
 *
 * log 콜백을 받아 출력 대상을 앱이 정한다(서버/배치=NestJS Logger, CLI=stderr 로 stdout 오염 방지).
 */
export function logConfigSummary(
  cfg: ConfigSource,
  log: (line: string) => void,
  opts: { oauth?: boolean; llm?: boolean } = {},
): void {
  const endpoint = (raw: string): string => {
    if (!raw) return '(empty)';
    try {
      const u = new URL(raw);
      return `${u.host}${u.pathname}`;
    } catch {
      return '(missing)';
    }
  };
  /**
   * **뒤** 5글자만 남긴다. 다른 마스킹(mask)이 앞을 남기는 것과 반대인데, 이 값들은 접두사가
   * 고정이라 앞을 보여 줘 봐야 아무것도 구별되지 않기 때문이다 — `sk-ant-api03-`(API 키)와
   * `sk-ant-oat01-`(구독 토큰)은 그 자체가 종류 표시일 뿐이고, 종류는 이미 줄 이름
   * (`anthropic.apiKey` / `anthropic.authToken`)이 말하고 있다.
   *
   * 알고 싶은 것은 **키를 두 개 갖고 있을 때 그중 어느 쪽이 물려 있나**이고, 그건 꼬리에서만
   * 갈린다. 짧은 값은 통째로 가린다 — 5글자가 전체의 큰 몫이면 노출이 된다.
   */
  const maskKey = (raw: string): string => {
    if (!raw) return '(empty)';
    return raw.length > 20 ? `*****${raw.slice(-5)}` : '*****';
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
    **메일은 여기서 안 찍는다.** 값이 DB(env_setting)에 있어서 설정 파일을 요약해 봐야
    실제로 쓰이는 값이 아니다 — 부팅 시점 요약이 런타임에 바뀌는 값을 말하면 거짓이 된다.
    무엇이 설정돼 있는지는 관리 화면에서 본다.
  */
  if (opts.oauth) {
    const idOr = (raw: string): string => raw || '(empty)';
    log(`Config OAuth google : ${idOr(s('google.clientId'))}`);
    log(`Config OAuth naver  : ${idOr(s('naver.clientId'))}`);
    log(`Config OAuth kakao  : ${idOr(s('kakao.clientId'))}`);
    log(`Config OAuth line   : ${idOr(s('line.clientId'))}`);
  }
  if (opts.llm) {
    /*
      **자격증명이 둘이라 어느 쪽으로 나가는지를 찍는다.** apiKey(배포)와
      authToken(로컬 구독)이 동시에 있을 수 있고 그때는 키가 이기는데, 값만 나열하면
      "둘 다 있음" 까지만 보이고 정작 무엇으로 호출하는지는 안 보인다.

      로컬에서 구독으로 돌리려고 토큰을 넣었는데 셸에 API 키가 남아 있어 조용히 과금되는
      상황이 이 한 줄로 드러난다.
    */
    const provider = s('llm.defaultProvider') || 'anthropic';
    const apiKey = s('llm.anthropic.apiKey');
    const authToken = s('llm.anthropic.authToken');
    const inUse = apiKey ? 'apiKey' : authToken ? 'authToken' : null;

    log(
      `Config LLM : ${provider} / ${s('llm.anthropic.defaultModel') || '(empty)'}`,
    );
    const tag = (name: string): string => (inUse === name ? '  (Actived)' : '');
    log(`Config LLM anthropic.apiKey    : ${maskKey(apiKey)}${tag('apiKey')}`);
    log(
      `Config LLM anthropic.authToken : ${maskKey(authToken)}${tag('authToken')}`,
    );
    if (!inUse) {
      // 여기서 부팅을 막지는 않는다(AI 만 꺼지고 병원 검색은 돌아야 한다). 대신 조용히
      // 넘어가지 않는다 — 요청이 와서 503 이 날 때까지 모르면 원인을 찾는 데만 시간이 든다.
      log('Config LLM : ⚠️ 자격증명 없음 — AI 검색은 503 을 낸다');
    }
  }
  /*
    **서비스키도 여기서 안 찍는다.** 메일과 같은 이유다 — 값이 DB(env_setting)에 있어서
    설정 파일 요약은 실제로 쓰이는 값이 아니다. 무엇이 설정돼 있는지는 관리 화면에서 본다.
  */
}
