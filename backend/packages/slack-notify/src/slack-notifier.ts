/**
 * 슬랙으로 한 줄 알림을 보낸다. 이 패키지는 hansapp 도메인을 알지 못한다 —
 * "무엇을 알릴지" 는 부르는 쪽이 정하고, 여기서는 "어떻게 보낼지" 만 다룬다.
 *
 * [전송 수단이 둘인 이유]
 * 슬랙은 두 가지 방법으로 메시지를 넣을 수 있는데, **되돌려주는 것이 다르다.**
 *
 *   chat.postMessage (봇 토큰)  메시지 id(ts)를 준다 → 나중에 스레드로 답글을 달 수 있다
 *   Incoming Webhook            응답이 문자열 'ok' 뿐이다 → 보낸 메시지를 다시 가리킬 수 없다
 *
 * 서버 시작 알림에 종료 알림을 스레드로 매달려면 ts 가 있어야 하므로 **토큰을 우선한다.**
 * 토큰이 없으면 웹훅으로 떨어지고, 그때는 시작·종료가 서로 무관한 별개 메시지가 된다.
 *
 * [실패 방향]
 * **어떤 경우에도 던지지 않는다.** 이 패키지를 쓰는 곳은 부팅 끝자락과 종료 훅인데,
 * 알림이 안 갔다는 이유로 서버가 못 뜨거나 종료가 막히면 안 된다. 실패는 onError 로만
 * 알리고 undefined 를 돌려준다.
 */

/** 보낸 메시지의 신원. 스레드 답글을 달려면 채널과 ts 가 둘 다 필요하다. */
export interface SlackMessageRef {
  readonly channel: string;
  readonly ts: string;
}

/**
 * Block Kit 블록. **모양은 이 패키지가 정하지 않는다** — 스키마가 넓고 계속 늘어나는데
 * 여기서 타입으로 좁혀 봐야 슬랙이 새 블록을 내놓을 때마다 이 패키지를 고쳐야 한다.
 */
export type SlackBlock = Readonly<Record<string, unknown>>;

/**
 * 색 막대가 붙는 묶음. 블록만으로는 왼쪽 색 띠를 만들 수 없어서 attachment 를 쓴다.
 * (슬랙이 attachment 를 legacy 로 부르지만 색 막대는 아직 이것뿐이다.)
 */
export interface SlackAttachment {
  /** `#2eb886` 같은 hex. 왼쪽 세로 띠 색이 된다. */
  readonly color?: string;
  readonly blocks?: readonly SlackBlock[];
}

export interface SlackMessage {
  /**
   * 슬랙 mrkdwn. 링크는 `<url|텍스트>`, 굵게는 `*텍스트*`.
   *
   * blocks·attachments 를 같이 주면 채널에는 그쪽이 그려지고 **이 값은 알림 미리보기로 남는다**
   * (모바일 푸시·채널 목록에 뜨는 한 줄). 그래서 비워 두면 안 된다.
   */
  readonly text: string;
  /** 색 막대가 필요한 본문. 있으면 채널에는 이쪽이 그려진다. */
  readonly attachments?: readonly SlackAttachment[];
  /**
   * 이 메시지에 답글로 달 대상. 웹훅 전송에서는 무시된다(스레드를 지정할 수 없다).
   */
  readonly replyTo?: SlackMessageRef;
  /**
   * 답글을 **채널에도 함께 띄운다**(reply_broadcast). 스레드를 열지 않아도 보이게 하려는
   * 것이라, 스레드에 쌓이는 진행 상황이 아니라 **결론에만** 쓴다 — 전부 띄우면 스레드로
   * 묶은 의미가 없어진다.
   *
   * replyTo 가 없으면 무시된다. 답글이 아닌 메시지는 원래 채널에 뜨기 때문이다.
   */
  readonly broadcast?: boolean;
}

export type SlackTransport = 'bot-token' | 'webhook';

export interface SlackNotifierOptions {
  /** 봇 토큰(xoxb-). channel 과 함께 있어야 chat.postMessage 를 쓴다. */
  readonly botToken?: string;
  /** 채널 id(C…) 또는 #이름. 봇 토큰 전송에서만 쓰인다. */
  readonly channel?: string;
  /** Incoming Webhook URL. 봇 토큰이 없을 때의 폴백. */
  readonly webhookUrl?: string;
  /** 응답을 기다리는 시간. 종료 훅을 붙잡고 있으면 안 되므로 짧게 잡는다. */
  readonly timeoutMs?: number;
  /** 전송 실패 통보. 던지지 않는 대신 이걸로 알린다. */
  readonly onError?: (message: string, error?: unknown) => void;
}

export interface SlackNotifier {
  /** 실제로 고른 전송 수단. 부팅 로그에 남겨 "왜 스레드가 안 달리지" 를 없앤다. */
  readonly transport: SlackTransport;
  /** 스레드 답글을 달 수 있는가(= ts 를 받을 수 있는가). */
  readonly supportsThread: boolean;
  /** 보낸 메시지의 신원. 웹훅이면 성공해도 undefined 다. */
  post(message: SlackMessage): Promise<SlackMessageRef | undefined>;
}

const DEFAULT_TIMEOUT_MS = 5_000;
const CHAT_POST_MESSAGE_URL = 'https://slack.com/api/chat.postMessage';

/** chat.postMessage 응답 중 이 코드가 보는 부분만. */
interface ChatPostMessageResponse {
  ok: boolean;
  ts?: string;
  channel?: string;
  error?: string;
}

/**
 * 설정으로 전송 수단을 고른다. **쓸 수 있는 수단이 없으면 undefined** — 호출부는 이것으로
 * "알림 꺼짐" 을 판단한다. 아무것도 안 하는 더미를 돌려주지 않는 이유는, 꺼져 있다는 사실이
 * 호출부에서 보여야 부팅 로그에 남길 수 있기 때문이다.
 */
export function createSlackNotifier(options: SlackNotifierOptions): SlackNotifier | undefined {
  const botToken = options.botToken?.trim();
  const channel = options.channel?.trim();
  const webhookUrl = options.webhookUrl?.trim();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const onError = options.onError ?? (() => {});

  if (botToken && channel) {
    return {
      transport: 'bot-token',
      supportsThread: true,
      post: (message) => postViaBotToken(botToken, channel, message, timeoutMs, onError),
    };
  }

  // 토큰만 있고 채널이 없으면 chat.postMessage 를 부를 수 없다. 조용히 웹훅으로 떨어지면
  // "토큰을 넣었는데 스레드가 안 달린다" 가 되므로 설정 실수라는 것을 알린다.
  if (botToken && !channel) {
    onError('SLACK_BOT_TOKEN is set but SLACK_CHANNEL is missing — falling back to webhook');
  }

  if (webhookUrl) {
    return {
      transport: 'webhook',
      supportsThread: false,
      post: (message) => postViaWebhook(webhookUrl, message, timeoutMs, onError),
    };
  }

  return undefined;
}

async function postViaBotToken(
  botToken: string,
  channel: string,
  message: SlackMessage,
  timeoutMs: number,
  onError: (message: string, error?: unknown) => void,
): Promise<SlackMessageRef | undefined> {
  try {
    const response = await fetch(CHAT_POST_MESSAGE_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${botToken}`,
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        channel,
        text: message.text,
        ...(message.attachments ? { attachments: message.attachments } : {}),
        // 답글은 원본과 같은 채널에만 달 수 있다. 그래서 replyTo.channel 을 그대로 믿지 않고
        // ts 만 쓴다 — 채널은 설정값이 정본이다.
        ...(message.replyTo
          ? {
              thread_ts: message.replyTo.ts,
              // 답글일 때만 뜻이 있다. 아니면 슬랙이 무시하지만 보내지 않는 편이 깔끔하다.
              ...(message.broadcast ? { reply_broadcast: true } : {}),
            }
          : {}),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    // **슬랙은 실패해도 HTTP 200 을 준다.** 본문의 ok 를 봐야 한다.
    const body = (await response.json()) as ChatPostMessageResponse;
    if (!body.ok) {
      onError(`Slack chat.postMessage failed: ${body.error ?? 'unknown'}`);
      return undefined;
    }
    if (!body.ts || !body.channel) return undefined;
    return { channel: body.channel, ts: body.ts };
  } catch (error) {
    onError('Slack chat.postMessage request failed', error);
    return undefined;
  }
}

async function postViaWebhook(
  webhookUrl: string,
  message: SlackMessage,
  timeoutMs: number,
  onError: (message: string, error?: unknown) => void,
): Promise<SlackMessageRef | undefined> {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        text: message.text,
        ...(message.attachments ? { attachments: message.attachments } : {}),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    // 웹훅은 성공이면 200 에 본문 'ok', 실패면 4xx 에 사유가 담긴다.
    if (!response.ok) {
      onError(`Slack webhook failed: ${response.status} ${await response.text()}`);
    }
  } catch (error) {
    onError('Slack webhook request failed', error);
  }
  // 웹훅은 성공해도 메시지 id 를 주지 않는다.
  return undefined;
}
