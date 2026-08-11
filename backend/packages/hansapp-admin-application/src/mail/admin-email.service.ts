import { Inject, Injectable, Logger } from '@nestjs/common';
import { EmailSender, EMAIL_SETTINGS_SOURCE } from '@hansapp/email-sender';
import type { EmailSettingsSource } from '@hansapp/email-sender';

import { ADMIN_MAIL_CONFIG, type AdminMailConfig } from './admin-mail.config';

/**
 * 메일 한 통의 결말.
 *
 * **"안 보냈다" 와 "보내려다 실패했다" 를 가른다.** 화면이 할 말이 다르기 때문이다 —
 * 앞은 메일 설정을 켜라는 뜻이고, 뒤는 주소나 SMTP 를 의심해야 한다는 뜻이다.
 */
export type AdminMailOutcome = 'SENT' | 'MAIL_DISABLED' | 'SEND_FAILED';

/** 무슨 일로 비밀번호가 실려 나가는가. 문구만 갈리고 나머지는 같다. */
type Occasion = 'CREATED' | 'RESET';

const SUBJECT: Record<Occasion, string> = {
  CREATED: '관리자 계정이 만들어졌습니다',
  RESET: '관리자 비밀번호가 초기화되었습니다',
};

const INTRO: Record<Occasion, (appName: string) => string> = {
  CREATED: (n) =>
    `<strong>${n}</strong> 관리자 콘솔 계정이 만들어졌습니다. 아래 값으로 로그인하세요.`,
  RESET: (n) =>
    `<strong>${n}</strong> 관리자 콘솔 계정의 비밀번호가 다른 관리자에 의해 초기화되었습니다. ` +
    `기존 로그인은 모두 끊겼고, 아래 값으로 다시 로그인하세요.`,
};

const INTRO_TEXT: Record<Occasion, (appName: string) => string> = {
  CREATED: (n) => `${n} 관리자 콘솔 계정이 만들어졌습니다.`,
  RESET: (n) =>
    `${n} 관리자 콘솔 계정의 비밀번호가 초기화되었습니다. 기존 로그인은 모두 끊겼습니다.`,
};

/** 비밀번호 칸의 이름. 만든 것과 다시 낸 것은 받는 사람이 갈라 읽어야 한다. */
const PASSWORD_LABEL: Record<Occasion, string> = {
  CREATED: '임시 비밀번호',
  RESET: '새 임시 비밀번호',
};

@Injectable()
export class AdminEmailService {
  private readonly logger = new Logger(AdminEmailService.name);

  constructor(
    private readonly sender: EmailSender,
    @Inject(EMAIL_SETTINGS_SOURCE)
    private readonly settings: EmailSettingsSource,
    @Inject(ADMIN_MAIL_CONFIG) private readonly config: AdminMailConfig,
  ) {}

  /** 새로 만든 관리자에게 계정과 임시 비밀번호를 알린다. */
  sendAccountCreated(input: MailInput): Promise<AdminMailOutcome> {
    return this.sendPassword('CREATED', input);
  }

  /**
   * 비밀번호를 초기화한 관리자에게 새 값을 알린다.
   *
   * **본인이 비밀번호를 잃어버린 상황이다.** 콘솔에 못 들어오는 사람에게 닿는 통로는
   * 메일뿐이라, 여기서 메일이 안 나가면 초기화해 준 관리자가 다른 방법으로 건네야 한다 —
   * 그래서 나갔는지 여부를 반드시 돌려준다.
   */
  sendPasswordReset(input: MailInput): Promise<AdminMailOutcome> {
    return this.sendPassword('RESET', input);
  }

  /**
   * 비밀번호를 잊은 관리자에게 **재설정 링크**를 보낸다.
   *
   * **여기만 비밀번호를 담지 않는다.** 값을 정하는 것은 링크 너머의 본인이고, 이 메일이
   * 하는 일은 "그 화면으로 가는 열쇠" 를 건네는 것뿐이다.
   *
   * 콘솔 주소를 모르면(설정 미비) 보내지 않는다 — 링크 없는 재설정 메일은 받는 사람이
   * 할 수 있는 것이 없다.
   */
  async sendPasswordResetLink(input: {
    email: string;
    name: string | null;
    /** 티켓 토큰. 링크의 쿼리로 실린다. */
    token: string;
    /** 이 시각이 지나면 링크가 죽는다. 본문에 남은 시간을 적는다. */
    expiresAt: Date;
  }): Promise<AdminMailOutcome> {
    const settings = await this.settings.load();
    const deliverable = settings.enabled && !!settings.smtp;

    const { appName, consoleUrl } = this.config;
    if (!consoleUrl) {
      this.logger.error(
        'apps-admin-api.externalUrl 이 비어 있어 재설정 링크를 만들 수 없다 — 메일을 보내지 않는다.',
      );
      return 'SEND_FAILED';
    }

    const link = `${consoleUrl}/reset-password?token=${encodeURIComponent(input.token)}`;
    const minutes = Math.max(
      1,
      Math.round((input.expiresAt.getTime() - Date.now()) / 60_000),
    );
    const greeting = input.name?.trim() || input.email;

    try {
      // 꺼져 있어도 부른다 — 본문(링크 포함)이 콘솔에 찍혀 로컬에서 흐름을 이어 볼 수 있다.
      await this.sender.send({
        to: input.email,
        subject: `[${appName}] 관리자 비밀번호 재설정`,
        html: resetHtml({ appName, greeting, link, minutes }),
        text: resetText({ appName, greeting, link, minutes }),
      });
      return deliverable ? 'SENT' : 'MAIL_DISABLED';
    } catch (error) {
      this.logger.error(
        `관리자 비밀번호 재설정 메일 발송 실패: to=${input.email} ${String(error)}`,
      );
      return 'SEND_FAILED';
    }
  }

  /**
   * 비밀번호를 실어 보낸다.
   *
   * **비밀번호를 메일로 보낸다.** 메일은 안전한 통로가 아니지만, 그 값은 첫 로그인에서
   * 반드시 바뀌고(mustChangePassword) 그 전에는 다른 API 가 열리지 않는다 — 수명이 한 번뿐인
   * 값이라 감수한다. 대신 본문에서 바꾸고 메일을 지우라고 분명히 말한다.
   *
   * **던지지 않는다.** 계정 쪽 일은 이미 끝났고, 메일이 실패했다고 그것을 되돌릴 수는 없다.
   * 무슨 일이 있었는지는 돌려주고, 그다음은 부르는 쪽이 화면에서 말한다.
   */
  private async sendPassword(
    occasion: Occasion,
    input: MailInput,
  ): Promise<AdminMailOutcome> {
    /*
      **보내기 전에 설정을 본다.** 발송기는 꺼져 있으면 본문을 로그로 남기고 조용히 끝내는데
      (곁다리 메일이 본 작업을 깨지 않게 하려는 설계다), 여기서는 그 "안 나갔음" 을
      화면에 전해야 해서 같은 값을 먼저 읽는다. 캐시라 DB 를 두 번 때리지는 않는다.
    */
    const settings = await this.settings.load();
    const deliverable = settings.enabled && !!settings.smtp;

    const { appName, consoleUrl } = this.config;
    const body: Body = {
      ...input,
      occasion,
      appName,
      consoleUrl,
      // 이름이 없으면 이메일로 부른다 — "님," 앞이 비어 있으면 잘못 나간 메일로 보인다.
      greeting: input.name?.trim() || input.email,
    };

    try {
      /*
        **꺼져 있어도 발송기를 부른다.** 그래야 본문이 콘솔에 찍힌다 —
        `mail.forceDisabled` 나 SMTP 미설정으로 막아 둔 환경(로컬 개발)에서 임시 비밀번호를
        거기서 읽어 흐름을 그대로 이어 볼 수 있다. 여기서 잘라내면 그 통로가 막힌다.
      */
      await this.sender.send({
        to: input.email,
        subject: `[${appName}] ${SUBJECT[occasion]}`,
        html: html(body),
        text: text(body),
      });
      // 실제로 나갔는지는 발송기가 아니라 설정이 말해 준다(위 deliverable).
      return deliverable ? 'SENT' : 'MAIL_DISABLED';
    } catch (error) {
      // **본문을 찍지 않는다.** 임시 비밀번호가 그대로 로그에 남는다.
      this.logger.error(
        `관리자 안내 메일 발송 실패(${occasion}): to=${input.email} ${String(error)}`,
      );
      return 'SEND_FAILED';
    }
  }
}

export interface MailInput {
  email: string;
  name: string | null;
  /** 평문. 로그에 남기지 않는다. */
  password: string;
}

interface Body extends MailInput {
  occasion: Occasion;
  appName: string;
  consoleUrl: string;
  greeting: string;
}

/**
 * 본문(HTML). **템플릿 파일을 쓰지 않는다.**
 *
 * 회원 메일은 종류가 여럿이라 파일로 뺐지만, 여기는 문구 몇 줄만 갈리는 한 장이라
 * 파일을 두면 빌드 산출물에 함께 실어 나르는 일까지 딸려 온다 — 그 값이 문구보다 크다.
 */
function html(body: Body): string {
  const link = body.consoleUrl
    ? `<p style="margin:0 0 16px"><a href="${escapeHtml(body.consoleUrl)}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#2563eb;color:#ffffff;font-weight:600;text-decoration:none">관리자 콘솔 열기</a></p>`
    : '';

  return `<!doctype html>
<html lang="ko"><body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a">
  <div style="max-width:520px;margin:0 auto;padding:32px;border-radius:16px;background:#ffffff">
    <h1 style="margin:0 0 16px;font-size:18px">${SUBJECT[body.occasion]}</h1>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#475569">
      ${escapeHtml(body.greeting)} 님, ${INTRO[body.occasion](escapeHtml(body.appName))}
    </p>
    <table style="width:100%;margin:0 0 16px;border-collapse:collapse;font-size:14px">
      <tr>
        <td style="padding:8px 0;color:#94a3b8;width:110px">이메일</td>
        <td style="padding:8px 0"><code>${escapeHtml(body.email)}</code></td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#94a3b8">${PASSWORD_LABEL[body.occasion]}</td>
        <td style="padding:8px 0"><code style="font-size:15px;font-weight:700">${escapeHtml(body.password)}</code></td>
      </tr>
    </table>
    ${link}
    <p style="margin:0;padding-top:16px;border-top:1px solid #e2e8f0;font-size:13px;line-height:1.7;color:#64748b">
      <strong style="color:#b45309">첫 로그인에서 비밀번호를 반드시 바꿔야 합니다.</strong>
      바꾸기 전에는 다른 화면이 열리지 않습니다. 비밀번호를 바꾼 뒤에는 이 메일을 지우세요.
    </p>
  </div>
</body></html>`;
}

/** 본문(평문). HTML 을 못 그리는 메일 앱과, 발송이 꺼져 있을 때 로그로 나가는 값이다. */
function text(body: Body): string {
  return [
    `${body.greeting} 님, ${INTRO_TEXT[body.occasion](body.appName)}`,
    '',
    `이메일: ${body.email}`,
    `${PASSWORD_LABEL[body.occasion]}: ${body.password}`,
    ...(body.consoleUrl ? [`관리자 콘솔: ${body.consoleUrl}`] : []),
    '',
    '첫 로그인에서 비밀번호를 반드시 바꿔야 합니다. 바꾸기 전에는 다른 화면이 열리지 않습니다.',
    '비밀번호를 바꾼 뒤에는 이 메일을 지우세요.',
  ].join('\n');
}

interface ResetBody {
  appName: string;
  greeting: string;
  link: string;
  minutes: number;
}

/** 재설정 링크 메일(HTML). **비밀번호가 없다** — 값은 링크 너머에서 본인이 정한다. */
function resetHtml(body: ResetBody): string {
  return `<!doctype html>
<html lang="ko"><body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a">
  <div style="max-width:520px;margin:0 auto;padding:32px;border-radius:16px;background:#ffffff">
    <h1 style="margin:0 0 16px;font-size:18px">비밀번호 재설정</h1>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#475569">
      ${escapeHtml(body.greeting)} 님, <strong>${escapeHtml(body.appName)}</strong> 관리자 콘솔의 비밀번호 재설정 요청을 받았습니다.
      아래 버튼을 눌러 새 비밀번호를 정하세요.
    </p>
    <p style="margin:0 0 16px">
      <a href="${escapeHtml(body.link)}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#2563eb;color:#ffffff;font-weight:600;text-decoration:none">새 비밀번호 정하기</a>
    </p>
    <p style="margin:0 0 16px;font-size:12px;line-height:1.7;color:#94a3b8;word-break:break-all">
      버튼이 안 눌리면 이 주소를 붙여 넣으세요:<br />${escapeHtml(body.link)}
    </p>
    <p style="margin:0;padding-top:16px;border-top:1px solid #e2e8f0;font-size:13px;line-height:1.7;color:#64748b">
      이 링크는 <strong style="color:#475569">${body.minutes}분</strong> 동안, <strong style="color:#475569">한 번만</strong> 쓸 수 있습니다.
      비밀번호를 새로 정하면 <strong style="color:#475569">지금 로그인된 기기가 모두 로그아웃됩니다.</strong><br />
      <strong style="color:#b45309">본인이 요청하지 않았다면</strong> 이 메일을 무시하세요. 비밀번호는 그대로입니다 —
      다만 이런 메일이 반복된다면 다른 관리자에게 알리세요.
    </p>
  </div>
</body></html>`;
}

/** 재설정 링크 메일(평문). 발송이 꺼져 있을 때 로그로 나가는 값이기도 하다. */
function resetText(body: ResetBody): string {
  return [
    `${body.greeting} 님, ${body.appName} 관리자 콘솔의 비밀번호 재설정 요청을 받았습니다.`,
    '',
    '아래 주소에서 새 비밀번호를 정하세요.',
    body.link,
    '',
    `이 링크는 ${body.minutes}분 동안, 한 번만 쓸 수 있습니다.`,
    '비밀번호를 새로 정하면 지금 로그인된 기기가 모두 로그아웃됩니다.',
    '본인이 요청하지 않았다면 이 메일을 무시하세요. 비밀번호는 그대로입니다.',
  ].join('\n');
}

/**
 * HTML 특수문자 이스케이프.
 *
 * **비밀번호가 본문에 들어간다.** 사람이 정한 값이라 `<` 나 `&` 가 섞일 수 있고, 그대로
 * 넣으면 메일에서 글자가 사라지거나 태그로 읽힌다 — 받는 사람은 왜 로그인이 안 되는지 모른다.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
