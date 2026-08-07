import { Inject, Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';

import {
  EMAIL_SETTINGS_SOURCE,
  type EmailSettings,
  type EmailSettingsSource,
  type SmtpSettings,
} from './email-settings';

/** 보낼 것. 본문은 이미 다 만들어져서 온다 — 여기서 문구를 손대지 않는다. */
export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

/**
 * 메일 한 통을 보낸다. **그것만 한다.**
 *
 * 템플릿·다국어·인증 코드 같은 것은 부르는 쪽(응용 계층)의 몫이다. 그래야 메일을 쓰는
 * 계층이 늘어도 nodemailer·SMTP 재연결 같은 것을 계층마다 다시 짜지 않는다.
 */
@Injectable()
export class EmailSender {
  private readonly logger = new Logger(EmailSender.name);

  /**
   * 만들어 둔 접속. **설정이 바뀌면 버린다** — 서명으로 판별한다.
   *
   * 접속을 캐시하지 않으면 메일 한 통마다 TCP·TLS 를 새로 맺는다. 반대로 영원히 들고
   * 있으면 관리 화면에서 SMTP 서버를 바꿔도 옛 서버로 계속 보낸다. 서명이 그 사이를 잡는다.
   */
  private transporter?: Transporter;
  private signature?: string;

  constructor(
    @Inject(EMAIL_SETTINGS_SOURCE)
    private readonly settings: EmailSettingsSource,
  ) {}

  /**
   * 보낸다. **안 보낼 수도 있다** — 꺼져 있거나 접속 정보가 없으면 본문을 로그로 남기고 끝낸다.
   *
   * 던지지 않는 이유는, 메일이 곁다리인 흐름(가입·비밀번호 변경 알림)에서 발송 실패가
   * 본 작업을 되돌리면 안 되기 때문이다. 실제 전송 오류는 그대로 던진다 — 그건 설정 문제가
   * 아니라 장애다.
   */
  async send(msg: EmailMessage): Promise<void> {
    const settings = await this.settings.load();

    /*
      "안 나가는" 이유가 둘(꺼짐 / 접속 정보 없음)이라 로그를 갈라 둔다 —
      뭉치면 어디를 고쳐야 하는지 알 수 없다.
    */
    if (!settings.enabled) {
      this.logger.warn(
        `[mail] 발송이 꺼져 있다 → 생략. to=${msg.to} subject="${msg.subject}"\n${msg.text}`,
      );
      return;
    }

    const transporter = this.resolveTransporter(settings.smtp);
    if (!transporter) {
      // 로컬에서 흐름을 돌려 볼 수 있게 본문(코드 포함)을 그대로 찍는다.
      this.logger.warn(
        `[mail:dev] SMTP 미설정 → 발송 생략. to=${msg.to} subject="${msg.subject}"\n${msg.text}`,
      );
      return;
    }

    await transporter.sendMail({
      from: settings.from,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
    });
  }

  private resolveTransporter(
    smtp: SmtpSettings | null,
  ): Transporter | undefined {
    if (!smtp) {
      // 접속 정보가 사라졌다. 들고 있던 것도 버린다 — 다시 채우면 그때 새로 맺는다.
      this.close();
      return undefined;
    }

    const signature = signatureOf(smtp);
    if (this.transporter && this.signature === signature) {
      return this.transporter;
    }

    this.close();
    this.signature = signature;
    this.transporter = createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.user
        ? { user: smtp.user, pass: smtp.password ?? '' }
        : undefined,
    });
    return this.transporter;
  }

  private close(): void {
    // 풀을 안 닫으면 설정을 바꿀 때마다 소켓이 남는다.
    this.transporter?.close();
    this.transporter = undefined;
    this.signature = undefined;
  }
}

/** 접속에 영향을 주는 값만 모은다. from 이나 enabled 가 바뀐다고 다시 맺을 이유가 없다. */
function signatureOf(smtp: SmtpSettings): string {
  return JSON.stringify([
    smtp.host,
    smtp.port,
    smtp.secure,
    smtp.user ?? '',
    smtp.password ?? '',
  ]);
}

/** 설정에서 발송 가능 여부만 판정한다. 부팅 로그 등 "왜 안 나가나" 를 알리는 자리에 쓴다. */
export function describeEmailSettings(settings: EmailSettings): string {
  if (!settings.enabled) return 'inactive — disabled';
  if (!settings.smtp) return 'inactive — host missing';
  return `smtp (${settings.smtp.host})`;
}
