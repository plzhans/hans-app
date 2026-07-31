import { hostname } from 'node:os';

import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
} from '@nestjs/common';
import {
  createSlackNotifier,
  type SlackBlock,
  type SlackMessageRef,
  type SlackNotifier,
} from '@hansapp/slack-notify';

import {
  SLACK_NOTIFY_CONFIG,
  type SlackNotifyConfig,
} from './slack-notify.config';

/**
 * 시작 알림에 실을 내용. 부르는 쪽(앱)이 자기 신원을 안다.
 *
 * 호스트명과 pid 는 여기 없다 — 프로세스가 스스로 아는 값이라 앱이 넘길 이유가 없다.
 * 접속 주소도 받지 않는다. 앱이 아는 주소는 127.0.0.1:포트 라 채널에서는 쓸모가 없고,
 * 바깥에서 보이는 주소는 앞단(프록시·터널)이 정하므로 앱이 알지 못한다.
 */
export interface ServerStartedDetail {
  /** 앱 이름. 한 채널에 여러 앱이 올라오므로 이것으로 구분한다. */
  readonly name: string;
  /** local·develop·production */
  readonly environment: string;
  /** 0.8.0+a1b2c3d — 무엇이 떠 있는지의 진짜 신원은 뒤의 sha 다. */
  readonly version: string;
}

/**
 * 서버가 뜨고 지는 것을 슬랙으로 알린다.
 *
 * [시작 알림의 ts 를 들고 있는 이유]
 * 종료 알림을 시작 알림의 **스레드 답글**로 달기 위해서다. 채널에 뜨고 지는 메시지가
 * 번갈아 쌓이면 "지금 이 종료가 어느 기동에 대한 것인지" 를 눈으로 짚어야 하는데,
 * 스레드로 묶이면 한 프로세스의 일생이 한 덩어리로 보인다.
 *
 * ts 는 봇 토큰(chat.postMessage)으로 보냈을 때만 받을 수 있다. 웹훅으로 떨어지면
 * ref 가 undefined 라 종료 알림이 별개 메시지로 올라간다 — 기능이 죽지는 않는다.
 *
 * [왜 종료를 이 서비스가 스스로 감지하는가]
 * 종료는 신호(SIGTERM)로 오지 앱 코드가 부르는 것이 아니다. Nest 의 종료 훅에 얹으면
 * 프레임워크가 이 메서드를 **기다려 주므로** 메시지가 나가기 전에 프로세스가 죽지 않는다.
 * 앱에서 process.on('SIGTERM') 을 직접 다루면 그 보장을 손으로 다시 만들어야 한다.
 * 단, 훅이 걸리려면 앱이 app.enableShutdownHooks() 를 켜야 한다.
 *
 * [batch·cli 는 조용하다]
 * 이 서비스는 ApplicationModule 에 들어 있어 batch·cli 에도 같이 실린다. 종료 알림은
 * **시작 알림을 보낸 프로세스에서만** 나간다(startedAt 이 기준). 그래서 별도 설정 없이
 * "시작을 알린 놈만 종료도 알린다" 가 성립한다.
 */
@Injectable()
export class SlackNotifyService implements OnApplicationShutdown {
  private readonly logger = new Logger(SlackNotifyService.name);
  private readonly notifier: SlackNotifier | undefined;

  /** 시작 알림의 신원. 웹훅 전송이면 성공해도 undefined 다. */
  private startedRef: SlackMessageRef | undefined;
  /** 시작 알림을 보낸 시각. **종료 알림을 보낼지의 기준이기도 하다.** */
  private startedAt: number | undefined;
  private startedDetail: ServerStartedDetail | undefined;
  /** 종료 훅이 두 번 불리는 경우(신호 중복)에 두 번 보내지 않게. */
  private shutdownNotified = false;

  constructor(@Inject(SLACK_NOTIFY_CONFIG) config: SlackNotifyConfig) {
    this.notifier = createSlackNotifier({
      botToken: config.botToken,
      channel: config.channel,
      webhookUrl: config.webhookUrl,
      // 전송 실패는 경고까지만. 알림이 안 갔다고 부팅·종료가 흔들리면 안 된다.
      onError: (message, error) =>
        this.logger.warn(
          error instanceof Error ? `${message}: ${error.message}` : message,
        ),
    });
  }

  /** 설정이 있어 실제로 보낼 수 있는가. 부팅 로그에 남기는 용도. */
  get enabled(): boolean {
    return this.notifier !== undefined;
  }

  /**
   * 켜졌는지·어떻게 보내는지 한 줄. **조용히 꺼져 있는 게 최악이라** 부팅 로그에 남긴다.
   */
  get statusLine(): string {
    if (!this.notifier) {
      return 'Slack notify is disabled (SLACK_BOT_TOKEN / SLACK_WEBHOOK_URL not set)';
    }
    return this.notifier.transport === 'bot-token'
      ? 'Slack notify: chat.postMessage (종료 알림을 스레드로 답니다)'
      : 'Slack notify: incoming webhook (SLACK_BOT_TOKEN 이 없어 스레드는 못 답니다)';
  }

  /**
   * 부팅 완료를 알린다. 앱이 요청을 받을 준비를 끝낸 뒤 **마지막에** 부른다.
   * 실패해도 던지지 않는다 — 알림 때문에 부팅이 실패하면 안 된다.
   */
  async notifyServerStarted(detail: ServerStartedDetail): Promise<void> {
    // 시각은 알림이 꺼져 있어도 남긴다. 나중에 켜졌을 때 기준이 되는 값이 아니라,
    // "이 프로세스는 시작을 알렸다" 는 표식이므로 notifier 유무와 함께 판단한다.
    this.startedAt = Date.now();
    this.startedDetail = detail;

    if (!this.notifier) return;

    this.startedRef = await this.notifier.post({
      // 채널 밖(모바일 푸시·채널 목록)에는 이 한 줄만 보인다.
      text: `🚀 ${detail.name} 시작 · ${detail.environment} · ${detail.version}`,
      attachments: [
        {
          color: environmentColor(detail.environment),
          blocks: [
            headline('🚀', detail.name, '시작'),
            // 호스트명은 컨테이너에서 컨테이너 id 가 된다 — 여러 대가 떠 있을 때
            // "어느 놈이 재기동했는지" 를 이것으로 짚는다.
            fields([
              ['환경', detail.environment],
              ['버전', detail.version],
              ['호스트', hostname()],
              ['PID', String(process.pid)],
            ]),
            timestampContext('기동', this.startedAt),
          ],
        },
      ],
    });
  }

  /**
   * Nest 가 종료 신호를 받았을 때 부른다(app.enableShutdownHooks() 필요).
   * 시작을 알리지 않은 프로세스는 종료도 알리지 않는다.
   */
  async onApplicationShutdown(signal?: string): Promise<void> {
    if (!this.notifier) return;
    if (this.startedAt === undefined || this.shutdownNotified) return;
    this.shutdownNotified = true;

    const now = Date.now();
    const name = this.startedDetail?.name ?? 'server';
    const environment = this.startedDetail?.environment ?? 'unknown';
    const uptime = formatUptime(now - this.startedAt);

    await this.notifier.post({
      text: `🛑 ${name} 종료 · ${environment} · 가동 ${uptime}`,
      attachments: [
        {
          // **빨강을 쓰지 않는다.** 배포마다 도는 정상 종료라, 사고 색을 매번 칠하면
          // 정작 진짜 사고가 났을 때 눈에 걸리지 않는다.
          color: SHUTDOWN_COLOR,
          blocks: [
            headline('🛑', name, '종료'),
            fields([
              ['환경', environment],
              ['신호', signal ?? 'unknown'],
              ['가동', uptime],
              ['호스트', hostname()],
            ]),
            timestampContext('종료', now),
          ],
        },
      ],
      // ref 가 없으면(웹훅) 스레드 없이 그냥 새 메시지로 나간다.
      replyTo: this.startedRef,
    });
  }
}

/**
 * 종료 색. **빨강이 아니다** — 배포마다 도는 정상 종료라, 사고 색을 매번 칠하면
 * 정작 진짜 사고가 났을 때 눈에 걸리지 않는다.
 */
const SHUTDOWN_COLOR = '#9aa0a6';

/**
 * 기동 색. **production 만 다른 색이다.** develop 은 하루에도 몇 번씩 뜨고 지므로
 * 초록으로 흘려보내도 되지만, 운영이 재기동한 것은 스크롤하다 걸려야 하는 사건이다.
 */
function environmentColor(environment: string): string {
  return environment === 'production' ? '#e8912d' : '#2eb886';
}

/** `🚀  *hansapp-api* 시작` 한 줄. */
function headline(emoji: string, name: string, action: string): SlackBlock {
  return {
    type: 'section',
    text: { type: 'mrkdwn', text: `${emoji}  *${escape(name)}* ${action}` },
  };
}

/** 라벨/값 2열 격자. 슬랙이 알아서 두 칸씩 접는다. */
function fields(pairs: readonly (readonly [string, string])[]): SlackBlock {
  return {
    type: 'section',
    fields: pairs.map(([label, value]) => ({
      type: 'mrkdwn',
      text: `*${label}*\n\`${escape(value)}\``,
    })),
  };
}

/**
 * 작은 회색 글씨로 시각 한 줄.
 *
 * `<!date^…>` 는 **보는 사람의 시간대로 렌더된다.** 서버가 UTC 로 돌아도 한국에서 보면
 * 한국 시간으로 보이므로, 문자열을 직접 만들어 박지 않는다. 파이프 뒤는 이 문법을
 * 이해하지 못하는 클라이언트(메일 알림 등)를 위한 대체 텍스트다.
 */
function timestampContext(label: string, epochMs: number): SlackBlock {
  const epochSeconds = Math.floor(epochMs / 1000);
  const fallback = new Date(epochMs).toISOString();
  return {
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `${label} <!date^${epochSeconds}^{date_short_pretty} {time}|${fallback}>`,
      },
    ],
  };
}

/**
 * 슬랙 mrkdwn 에서 특별한 뜻을 갖는 세 글자만 막는다. 링크·날짜 문법(`<url|text>`,
 * `<!date^…>`)을 우리가 직접 쓰므로, 값에 섞여 들어온 꺾쇠는 반드시 죽여야 한다.
 */
function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** 3h 12m 을 "3시간 12분" 으로. 초 단위는 1분 미만일 때만 쓴다. */
function formatUptime(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}일`);
  if (hours > 0) parts.push(`${hours}시간`);
  if (minutes > 0) parts.push(`${minutes}분`);
  // 1분도 못 살고 죽은 경우가 사실은 제일 봐야 하는 경우다. 초로 보여준다.
  if (parts.length === 0) parts.push(`${totalSeconds}초`);
  return parts.join(' ');
}
