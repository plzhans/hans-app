import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { EmailVerifyPurpose } from '@hansapp/data';

import { MAIL_CONFIG } from './mail.config';
import type { MailConfig } from './mail.config';

/** 용도 → 템플릿 파일 base. locale 접미사(`.ko`/`.en`/…)는 렌더 시 붙인다. */
const TEMPLATE_BASE: Record<EmailVerifyPurpose, string> = {
  SIGNUP: 'email-verification',
  PASSWORD_RESET: 'password-reset',
};

type Locale = 'ko' | 'en' | 'ja' | 'zh';
const DEFAULT_LOCALE: Locale = 'ko';

/** 제목·플레인텍스트(언어별). HTML 본문은 별도 템플릿 파일이 담당한다. */
interface Strings {
  subject: (appName: string) => string;
  text: (code: string, expiresMinutes: string) => string;
}

const I18N: Record<Locale, Record<EmailVerifyPurpose, Strings>> = {
  ko: {
    SIGNUP: {
      subject: (n) => `[${n}] 이메일 인증 코드`,
      text: (c, m) =>
        `인증 코드: ${c}\n\n이 코드는 ${m}분 동안 유효합니다.\n본인이 요청하지 않았다면 이 메일을 무시하세요.`,
    },
    PASSWORD_RESET: {
      subject: (n) => `[${n}] 비밀번호 재설정 코드`,
      text: (c, m) =>
        `비밀번호 재설정 코드: ${c}\n\n이 코드는 ${m}분 동안 유효합니다.\n본인이 요청하지 않았다면 이 메일을 무시하세요.`,
    },
  },
  en: {
    SIGNUP: {
      subject: (n) => `[${n}] Email verification code`,
      text: (c, m) =>
        `Verification code: ${c}\n\nThis code is valid for ${m} minutes.\nIf you didn't request this, ignore this email.`,
    },
    PASSWORD_RESET: {
      subject: (n) => `[${n}] Password reset code`,
      text: (c, m) =>
        `Password reset code: ${c}\n\nThis code is valid for ${m} minutes.\nIf you didn't request this, ignore this email.`,
    },
  },
  ja: {
    SIGNUP: {
      subject: (n) => `[${n}] メール認証コード`,
      text: (c, m) =>
        `認証コード: ${c}\n\nこのコードは${m}分間有効です。\n心当たりがない場合は、このメールを無視してください。`,
    },
    PASSWORD_RESET: {
      subject: (n) => `[${n}] パスワード再設定コード`,
      text: (c, m) =>
        `パスワード再設定コード: ${c}\n\nこのコードは${m}分間有効です。\n心当たりがない場合は、このメールを無視してください。`,
    },
  },
  zh: {
    SIGNUP: {
      subject: (n) => `[${n}] 邮箱验证码`,
      text: (c, m) =>
        `验证码: ${c}\n\n此验证码在 ${m} 分钟内有效。\n如果这不是您本人的操作，请忽略此邮件。`,
    },
    PASSWORD_RESET: {
      subject: (n) => `[${n}] 密码重置验证码`,
      text: (c, m) =>
        `密码重置验证码: ${c}\n\n此验证码在 ${m} 分钟内有效。\n如果这不是您本人的操作，请忽略此邮件。`,
    },
  },
};

/** HTML 특수문자 이스케이프. 치환값은 통제된 값이지만 습관적으로 막는다. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 메일 발송. 인증 코드 메일을 템플릿으로 렌더해 SMTP 로 보낸다.
 *
 * SMTP 설정(host)이 없으면 실제 발송 대신 콘솔에 로깅한다 — 로컬에서 메일 서버 없이도
 * 코드 흐름을 돌릴 수 있다. 템플릿(.html)은 빌드 시 dist 로 복사되며(package.json build),
 * 런타임에 이 파일 기준 상대경로로 읽는다.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly templateDir = resolve(__dirname, 'templates');
  private readonly cache = new Map<string, string>();
  private transporter?: Transporter;

  constructor(@Inject(MAIL_CONFIG) private readonly config: MailConfig) {}

  /** 인증 코드 메일 발송. code 원문은 여기서만 쓰고 저장하지 않는다. */
  async sendVerificationCode(input: {
    purpose: EmailVerifyPurpose;
    to: string;
    code: string;
    expiresInSec: number;
    /** 인사말 뒤 이름 조각(" 홍길동 님"). 없으면 빈 문자열. */
    userNameGreeting?: string;
    locale?: string;
  }): Promise<void> {
    const locale = this.resolveLocale(input.locale);
    const strings = I18N[locale][input.purpose];
    const subject = strings.subject(this.config.appName);
    const expiresMinutes = Math.max(
      1,
      Math.round(input.expiresInSec / 60),
    ).toString();

    const html = this.render(TEMPLATE_BASE[input.purpose], locale, {
      appName: this.config.appName,
      appUrl: this.config.appUrl,
      code: input.code,
      expiresMinutes,
      userNameGreeting: input.userNameGreeting ?? '',
      year: new Date().getFullYear().toString(),
    });
    const text = strings.text(input.code, expiresMinutes);

    await this.send({ to: input.to, subject, html, text });
  }

  /** 지원 로케일이면 그대로, 아니면 기본(ko). */
  private resolveLocale(locale?: string): Locale {
    return locale && locale in I18N ? (locale as Locale) : DEFAULT_LOCALE;
  }

  /** 템플릿 로드(+캐시) 후 {{key}} 치환. 값은 HTML 이스케이프한다. 파일이 없으면 ko 로 폴백. */
  private render(
    base: string,
    locale: Locale,
    vars: Record<string, string>,
  ): string {
    const file = `${base}.${locale}.html`;
    let tpl = this.cache.get(file);
    if (tpl === undefined) {
      try {
        tpl = readFileSync(resolve(this.templateDir, file), 'utf-8');
      } catch {
        tpl = readFileSync(
          resolve(this.templateDir, `${base}.${DEFAULT_LOCALE}.html`),
          'utf-8',
        );
      }
      this.cache.set(file, tpl);
    }
    return tpl.replace(/\{\{(\w+)\}\}/g, (_m, key: string) =>
      key in vars ? escapeHtml(vars[key]) : '',
    );
  }

  private async send(msg: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<void> {
    const t = this.getTransporter();
    if (!t) {
      // SMTP 미설정(로컬)뿐이므로, 개발 편의를 위해 본문(코드 포함)을 콘솔에 찍는다.
      // 운영은 host 가 채워져 이 분기를 타지 않는다.
      this.logger.warn(
        `[mail:dev] SMTP 미설정 → 발송 생략. to=${msg.to} subject="${msg.subject}"\n${msg.text}`,
      );
      return;
    }
    await t.sendMail({
      from: this.config.from,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
    });
  }

  private getTransporter(): Transporter | undefined {
    if (this.transporter) {
      return this.transporter;
    }
    const smtp = this.config.smtp;
    if (!smtp) {
      return undefined;
    }
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
}
