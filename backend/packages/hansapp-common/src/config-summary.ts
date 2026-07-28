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
  opts: { oauth?: boolean } = {},
): void {
  const endpoint = (raw: string): string => {
    if (!raw) return '(미설정)';
    try {
      const u = new URL(raw);
      return `${u.host}${u.pathname}`;
    } catch {
      return '(missing)';
    }
  };
  const mask = (raw: string): string =>
    raw ? `${raw.slice(0, 5)}*****` : '(미설정)';
  const s = (path: string): string => cfg.getStringOrDefault(path);

  log(`Config AppEnv : ${cfg.env}`);
  log(`Config Database : ${endpoint(s('database.url'))}`);
  log(`Config Redis: ${endpoint(s('redis.url'))}`);
  log(`Config Elasticsearch : ${endpoint(s('elasticsearch.url'))}`);
  const mailHost = s('mail.smtp.host');
  log(
    `Config Mail : ${mailHost ? `${s('mail.provider') || 'smtp'} (${mailHost})` : 'inactive — host missing'}`,
  );
  if (opts.oauth) {
    const idOr = (raw: string): string => raw || '(미설정)';
    log(`Config OAuth google : ${idOr(s('google.clientId'))}`);
    log(`Config OAuth naver  : ${idOr(s('naver.clientId'))}`);
    log(`Config OAuth kakao  : ${idOr(s('kakao.clientId'))}`);
    log(`Config OAuth line   : ${idOr(s('line.clientId'))}`);
  }
  log(`Config KRDATA : ${mask(s('krdata.serviceKey'))}`);
  log(`Config JUSO   : ${mask(s('juso.serviceKey'))}`);
}
