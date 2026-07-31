import type { ConfigSource } from '@hansapp/common';

/** 슬랙 알림 설정 주입 토큰 */
export const SLACK_NOTIFY_CONFIG = Symbol('SLACK_NOTIFY_CONFIG');

/**
 * 슬랙 알림 설정. **값이 없으면 알림만 꺼지고 부팅은 정상이다** — 알림은 부가 기능이라
 * 없다고 서버가 못 뜨면 안 된다. 그래서 여기서는 아무것도 검증하지 않는다
 * (ES 설정이 URL 없으면 즉시 실패하는 것과 반대 방향이다).
 */
export interface SlackNotifyConfig {
  /** 봇 토큰(xoxb-). channel 과 함께 있으면 chat.postMessage 를 쓴다. */
  readonly botToken?: string;
  /** 채널 id(C…) 또는 #이름. 봇 토큰 전송에서만 쓰인다. */
  readonly channel?: string;
  /** Incoming Webhook URL. 봇 토큰이 없을 때의 폴백. */
  readonly webhookUrl?: string;
  /**
   * 이 프로세스를 띄운 배포가 만든 슬랙 스레드의 ts. 있으면 기동 알림이 **그 스레드의
   * 답글**로 붙어, 배포 스레드의 마지막 줄이 CI 의 추측이 아니라 앱 본인의 말이 된다.
   *
   * **배포가 `docker compose up` 할 때만 넣는다**(compose 의 environment). 그 값은 컨테이너
   * 생성 시점에 구워지므로, 재부팅이나 크래시 재시작에서도 그대로 살아 있다 — 그래서
   * 값의 유효기간은 SlackNotifyService 가 따로 판단한다.
   */
  readonly deployThreadTimestamp?: string;
}

export function buildSlackNotifyConfig(cfg: ConfigSource): SlackNotifyConfig {
  return Object.freeze({
    botToken: cfg.getStringOrDefault('slack.botToken') || undefined,
    channel: cfg.getStringOrDefault('slack.channel') || undefined,
    webhookUrl: cfg.getStringOrDefault('slack.webhookUrl') || undefined,
    deployThreadTimestamp:
      cfg.getStringOrDefault('slack.deployThreadTimestamp') || undefined,
  });
}
