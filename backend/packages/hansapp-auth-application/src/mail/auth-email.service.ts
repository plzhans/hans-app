import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { EmailSender } from '@hansapp/email-sender';
import { EmailVerifyPurpose } from '@hansapp/data';

import { MAIL_CONFIG } from './mail.config';
import type { MailConfig } from './mail.config';

/**
 * 지원 언어. **한국어와 영어만 한다.**
 *
 * 한 언어를 늘리면 파일이 아니라 문구 표가 늘어난다(템플릿은 언어 중립이다).
 * 그래도 번역을 유지할 손이 필요하므로, 실제로 쓰는 사람이 생길 때 늘린다 —
 * 반쯤 번역된 표는 없느니만 못하다.
 */
type Locale = 'ko' | 'en';

/**
 * 언어를 못 정했을 때 쓸 값. 한국 서비스라 ko 다.
 * 다만 **다른 언어를 명시한 요청은 en 으로 보낸다**(resolveLocale 참고).
 */
const DEFAULT_LOCALE: Locale = 'ko';

/** 화면에 보여줄 제공자 이름. 모르는 값은 그대로 쓴다. */
const PROVIDER_LABEL: Record<string, string> = {
  GOOGLE: 'Google',
  NAVER: '네이버',
  KAKAO: '카카오',
  LINE: 'LINE',
};

// ---- 인증 코드(OTP) 메일 ----

/** 코드 메일 문구. 가입 인증과 비밀번호 재설정이 같은 템플릿에 서로 다른 값을 넣는다. */
interface CodeStrings {
  subject: string;
  heading: string;
  /** 본문 한 문단. 왜 이 코드가 왔는지. */
  message: string;
  /** 코드 박스 아래 유효기간 안내. 분 수가 이미 박혀 온다. */
  expiresNote: string;
  /** "본인이 요청하지 않았다면 …" */
  securityNote: string;
  /** 받은편지함 미리보기 한 줄. */
  preheader: string;
}

const CODE_I18N: Record<
  Locale,
  Record<EmailVerifyPurpose, (appName: string, code: string, minutes: string) => CodeStrings>
> = {
  ko: {
    SIGNUP: (n, c, m) => ({
      subject: `[${n}] 이메일 인증 코드`,
      heading: '이메일 인증 코드',
      message: `<strong>${n}</strong> 가입을 마치려면 아래 인증 코드를 입력해 주세요.`,
      expiresNote: `이 코드는 <strong style="color: #475569">${m}분</strong> 동안만 유효합니다.`,
      securityNote:
        '<strong style="color: #475569">본인이 요청하지 않았다면</strong> 이 메일을 무시하세요. 계정은 만들어지지 않습니다.',
      preheader: `${n} 이메일 인증 코드는 ${c} 입니다. ${m}분 안에 입력해 주세요.`,
    }),
    PASSWORD_RESET: (n, c, m) => ({
      subject: `[${n}] 비밀번호 재설정 코드`,
      heading: '비밀번호 재설정 코드',
      message: `<strong>${n}</strong> 계정의 비밀번호 재설정 요청을 받았습니다. 아래 인증 코드를 입력해 새 비밀번호를 설정해 주세요.`,
      expiresNote: `이 코드는 <strong style="color: #475569">${m}분</strong> 동안만 유효합니다.`,
      securityNote:
        '<strong style="color: #475569">본인이 요청하지 않았다면</strong> 이 메일을 무시하세요. 비밀번호는 변경되지 않으며, 계정은 안전합니다. 다만 이런 메일이 반복된다면 비밀번호를 바꾸시길 권합니다.',
      preheader: `${n} 비밀번호 재설정 코드는 ${c} 입니다. ${m}분 안에 입력해 주세요.`,
    }),
  },
  en: {
    SIGNUP: (n, c, m) => ({
      subject: `[${n}] Email verification code`,
      heading: 'Email verification code',
      message: `Enter the code below to finish creating your <strong>${n}</strong> account.`,
      expiresNote: `This code is valid for <strong style="color: #475569">${m} minutes</strong>.`,
      securityNote:
        '<strong style="color: #475569">If you didn’t request this</strong>, ignore this email. No account will be created.',
      preheader: `Your ${n} verification code is ${c}. It expires in ${m} minutes.`,
    }),
    PASSWORD_RESET: (n, c, m) => ({
      subject: `[${n}] Password reset code`,
      heading: 'Password reset code',
      message: `We received a request to reset the password for your <strong>${n}</strong> account. Enter the code below to set a new password.`,
      expiresNote: `This code is valid for <strong style="color: #475569">${m} minutes</strong>.`,
      securityNote:
        '<strong style="color: #475569">If you didn’t request this</strong>, ignore this email. Your password stays unchanged and your account is safe. If these emails keep coming, change your password.',
      preheader: `Your ${n} password reset code is ${c}. It expires in ${m} minutes.`,
    }),
  },
};

/** 코드 메일의 언어별 공용 조각. */
const CODE_SHELL: Record<
  Locale,
  {
    greeting: string;
    neverAskNote: (appName: string) => string;
    footerLegal: string;
  }
> = {
  ko: {
    greeting: '안녕하세요',
    neverAskNote: (n) =>
      `${n} 는 어떤 경우에도 이 코드를 묻지 않습니다. 코드를 다른 사람과 공유하지 마세요.`,
    footerLegal: '이 메일은 발신 전용입니다.',
  },
  en: {
    greeting: 'Hello',
    neverAskNote: (n) => `${n} will never ask you for this code. Do not share it with anyone.`,
    footerLegal: 'This mailbox is not monitored.',
  },
};

// ---- 계정 알림 메일 ----

/**
 * 계정 알림 메일의 종류. **코드를 주는 메일이 아니라 사실을 알리는 메일이다** —
 * 받은 사람이 "내가 안 했는데?" 를 알아차리는 것이 유일한 목적이라, 본문은 짧고
 * 무슨 일이 언제 있었는지만 담는다. 넷이 한 템플릿(account-notice)을 나눠 쓴다.
 */
export type AccountNoticeKind =
  'SIGNUP_WELCOME' | 'PASSWORD_CHANGED' | 'SOCIAL_LINKED' | 'SOCIAL_UNLINKED';

/**
 * 알림 종류 → 템플릿 파일.
 *
 * **연동과 해제만 한 파일을 같이 쓴다.** 마크업이 글자 하나까지 같고 문구만 다르기 때문이다.
 * 나머지는 구조가 갈린다 — 가입 축하에는 경고 박스가 없고, 비밀번호 변경에는 제공자 줄이 없다.
 * 그 차이를 조건으로 넣는 대신 파일로 가른다.
 */
const NOTICE_TEMPLATE: Record<AccountNoticeKind, string> = {
  SIGNUP_WELCOME: 'signup-welcome',
  PASSWORD_CHANGED: 'password-changed',
  SOCIAL_LINKED: 'social-changed',
  SOCIAL_UNLINKED: 'social-changed',
};

/** 코드 메일 템플릿. 가입 인증과 비밀번호 재설정이 같이 쓴다. */
const CODE_TEMPLATE = 'verification-code';

/**
 * 이 서비스가 쓰는 템플릿 전부. **부팅 검사가 이 목록을 본다**(onModuleInit).
 * 템플릿을 새로 만들면 여기에도 올려야 한다 — 안 올리면 검사망 밖에 남는다.
 */
const ALL_TEMPLATES = [CODE_TEMPLATE, ...new Set(Object.values(NOTICE_TEMPLATE))];

/** 알림 문구. `provider` 는 소셜 알림에서만 채워진다. */
interface NoticeStrings {
  subject: string;
  heading: string;
  message: string;
  ctaLabel: string;
  /**
   * "본인이 아니라면 …". 보안 알림 셋만 호박색 경고 박스로 띄운다.
   * **가입 축하 템플릿에는 그 자리가 아예 없어** 이 값이 비어 있다.
   */
  alertNote: string;
  /** 경고 박스 아래 회색 각주. */
  closingNote: string;
}

const NOTICE_I18N: Record<
  Locale,
  Record<AccountNoticeKind, (appName: string, provider: string) => NoticeStrings>
> = {
  ko: {
    SIGNUP_WELCOME: (n) => ({
      subject: `[${n}] 가입을 환영합니다`,
      heading: '가입이 완료되었습니다',
      message: `${n} 계정이 만들어졌습니다. 이제 하나의 계정으로 모든 서비스를 이용할 수 있습니다.`,
      ctaLabel: '시작하기',
      alertNote: '',
      closingNote: '본인이 가입한 것이 아니라면 이 메일로 회신하지 말고 고객센터로 알려 주세요.',
    }),
    PASSWORD_CHANGED: (n) => ({
      subject: `[${n}] 비밀번호가 변경되었습니다`,
      heading: '비밀번호가 변경되었습니다',
      message: `${n} 계정의 비밀번호가 변경되었습니다. 다음 로그인부터 새 비밀번호를 사용하세요.`,
      ctaLabel: '계정 확인하기',
      alertNote:
        '본인이 변경한 것이 아니라면 즉시 비밀번호를 다시 설정하고 로그인 기기를 모두 로그아웃하세요.',
      closingNote: '본인이 한 일이 맞다면 따로 하실 일은 없습니다.',
    }),
    SOCIAL_LINKED: (n, p) => ({
      subject: `[${n}] ${p} 계정이 연동되었습니다`,
      heading: `${p} 계정이 연동되었습니다`,
      message: `${n} 계정에 ${p} 로그인이 추가되었습니다. 이제 ${p} 로도 로그인할 수 있습니다.`,
      ctaLabel: '연동 상태 확인하기',
      alertNote: '본인이 연동한 것이 아니라면 즉시 연동을 해제하고 비밀번호를 변경하세요.',
      closingNote: '본인이 한 일이 맞다면 따로 하실 일은 없습니다.',
    }),
    SOCIAL_UNLINKED: (n, p) => ({
      subject: `[${n}] ${p} 연동이 해제되었습니다`,
      heading: `${p} 연동이 해제되었습니다`,
      message: `${n} 계정에서 ${p} 로그인이 제거되었습니다. 더 이상 ${p} 로 로그인할 수 없습니다.`,
      ctaLabel: '연동 상태 확인하기',
      alertNote: '본인이 해제한 것이 아니라면 즉시 비밀번호를 변경하고 연동 상태를 확인하세요.',
      closingNote: '본인이 한 일이 맞다면 따로 하실 일은 없습니다.',
    }),
  },
  en: {
    SIGNUP_WELCOME: (n) => ({
      subject: `[${n}] Welcome`,
      heading: 'Your account is ready',
      message: `Your ${n} account has been created. One account now works across every service.`,
      ctaLabel: 'Get started',
      alertNote: '',
      closingNote:
        'If you didn’t sign up, please contact support instead of replying to this email.',
    }),
    PASSWORD_CHANGED: (n) => ({
      subject: `[${n}] Your password was changed`,
      heading: 'Your password was changed',
      message: `The password for your ${n} account has been changed. Use the new password from your next sign-in.`,
      ctaLabel: 'Review your account',
      alertNote:
        'If you didn’t do this, reset your password immediately and sign out of all devices.',
      closingNote: 'If this was you, no action is needed.',
    }),
    SOCIAL_LINKED: (n, p) => ({
      subject: `[${n}] ${p} was linked to your account`,
      heading: `${p} was linked`,
      message: `${p} sign-in was added to your ${n} account. You can now sign in with ${p} as well.`,
      ctaLabel: 'Review linked accounts',
      alertNote: 'If you didn’t do this, unlink it immediately and change your password.',
      closingNote: 'If this was you, no action is needed.',
    }),
    SOCIAL_UNLINKED: (n, p) => ({
      subject: `[${n}] ${p} was unlinked from your account`,
      heading: `${p} was unlinked`,
      message: `${p} sign-in was removed from your ${n} account. You can no longer sign in with ${p}.`,
      ctaLabel: 'Review linked accounts',
      alertNote:
        'If you didn’t do this, change your password and review your linked accounts immediately.',
      closingNote: 'If this was you, no action is needed.',
    }),
  },
};

/**
 * 알림 메일의 언어별 공용 조각.
 *
 * `nameSuffix` 는 인사말 뒤에 붙는 이름 조각이다. **경칭이 언어마다 달라서**
 * 부르는 쪽에서 만들지 않고 여기서 붙인다 — 한국어는 '님' 이 필요하고 영어는 이름만 온다.
 */
const NOTICE_SHELL: Record<
  Locale,
  {
    greeting: string;
    nameSuffix: (name: string) => string;
    /** 가입 축하의 정보 박스 라벨. 여기만 시각 대신 이메일이 들어간다. */
    accountLabel: string;
    /** 나머지 알림의 정보 박스 라벨(처리 시각). */
    timeLabel: string;
    /** 소셜 알림에만 뜨는 줄. */
    providerLabel: string;
    footerLegal: string;
  }
> = {
  ko: {
    greeting: '안녕하세요',
    nameSuffix: (n) => ` ${n} 님`,
    accountLabel: '가입한 이메일',
    timeLabel: '처리 시각',
    providerLabel: '소셜 계정',
    footerLegal: '이 메일은 발신 전용입니다.',
  },
  en: {
    greeting: 'Hello',
    nameSuffix: (n) => ` ${n}`,
    accountLabel: 'Account email',
    timeLabel: 'When',
    providerLabel: 'Provider',
    footerLegal: 'This mailbox is not monitored.',
  },
};

/** 알림 메일의 '처리 시각'. 서비스 기준 시간대(KST)로 고정해 적는다. */
function formatNoticeTime(locale: Locale, at: Date): string {
  const tag = locale === 'ko' ? 'ko-KR' : 'en-US';
  return `${at.toLocaleString(tag, {
    timeZone: 'Asia/Seoul',
    dateStyle: 'medium',
    timeStyle: 'short',
  })} (KST)`;
}

/** 플레인텍스트 대체본을 만들 때 우리 문구의 강조 태그를 걷어낸다. */
function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '');
}

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
export class AuthEmailService implements OnModuleInit {
  private readonly logger = new Logger(AuthEmailService.name);
  private readonly templateDir = resolve(__dirname, 'templates');
  private readonly cache = new Map<string, string>();
  constructor(
    @Inject(MAIL_CONFIG) private readonly config: MailConfig,
    private readonly sender: EmailSender,
  ) {}

  /**
   * 템플릿을 전부 읽어 캐시에 올린다. **하나라도 없으면 여기서 부팅을 세운다.**
   *
   * 템플릿은 `.html` 이라 tsc 가 dist 로 옮겨 주지 않는다 — 패키지 build 스크립트의
   * `cp` 단계가 옮긴다. 그 단계가 빠지거나 경로가 어긋나면 **로컬은 멀쩡하고 배포만
   * 깨진다**(로컬은 SMTP 미설정이라 발송을 건너뛰어 렌더까지 가지도 않는다).
   *
   * 그래서 첫 발송 때가 아니라 부팅 때 확인한다. 컨테이너가 안 뜨면 배포가 실패하고
   * 롤백되지만, 조용히 뜨면 **가입하려던 사람이 대신 실패한다.** 앞쪽에서 터지는 편이 낫다.
   */
  onModuleInit(): void {
    const missing: string[] = [];
    for (const name of ALL_TEMPLATES) {
      try {
        this.loadTemplate(name);
      } catch {
        missing.push(`${name}.html`);
      }
    }
    if (missing.length > 0) {
      throw new Error(
        `Mail templates are missing from the build: ${missing.join(', ')} ` +
          `(looked in ${this.templateDir}). ` +
          `Check the "cp src/mail/templates/*.html" step in @hansapp/auth-application build.`,
      );
    }
    this.logger.log(`메일 템플릿 ${ALL_TEMPLATES.length}개 로드`);
  }

  /** 인증 코드 메일 발송. code 원문은 여기서만 쓰고 저장하지 않는다. */
  async sendVerificationCode(input: {
    purpose: EmailVerifyPurpose;
    to: string;
    code: string;
    expiresInSec: number;
    /** 표시 이름. 경칭은 언어별로 여기서 붙인다(NOTICE_SHELL.nameSuffix 와 같은 규칙). */
    userName?: string | null;
    locale?: string;
  }): Promise<void> {
    const locale = this.resolveLocale(input.locale);
    const appName = this.config.appName;
    const shell = NOTICE_SHELL[locale];
    const expiresMinutes = Math.max(1, Math.round(input.expiresInSec / 60)).toString();
    const strings = CODE_I18N[locale][input.purpose](appName, input.code, expiresMinutes);

    const html = this.render(
      CODE_TEMPLATE,
      {
        lang: locale,
        appName,
        appUrl: this.config.appUrl,
        code: input.code,
        userNameGreeting: input.userName ? shell.nameSuffix(input.userName) : '',
        copyright: `© ${new Date().getFullYear()} ${appName}`,
        greeting: CODE_SHELL[locale].greeting,
        heading: strings.heading,
        preheader: strings.preheader,
        neverAskNote: CODE_SHELL[locale].neverAskNote(appName),
        footerLegal: CODE_SHELL[locale].footerLegal,
      },
      // 강조 태그가 들어 있는 우리 문구. 사용자 입력이 아니라 이스케이프하지 않는다.
      {
        message: strings.message,
        expiresNote: strings.expiresNote,
        securityNote: strings.securityNote,
      },
    );

    await this.send({
      to: input.to,
      subject: strings.subject,
      html,
      text: `${strings.heading}\n\n${input.code}\n\n${stripTags(
        strings.expiresNote,
      )}\n\n${stripTags(strings.securityNote)}`,
    });
  }

  /**
   * 계정 알림 메일. 가입 완료·비밀번호 변경·소셜 연동/해제가 이 하나를 나눠 쓴다.
   *
   * **실패해도 던지지 않는다.** 알림은 본 흐름의 결과이지 조건이 아니다 — 메일 서버가
   * 흔들린다고 가입이나 비밀번호 변경을 되돌리면, 사용자는 이미 끝난 일을 실패로 본다.
   * 부르는 쪽이 매번 try/catch 를 두지 않도록 여기서 삼키고 로그만 남긴다.
   */
  async sendAccountNotice(input: {
    to: string;
    kind: AccountNoticeKind;
    /** 소셜 연동/해제 알림에서 제공자 이름. 그 외에는 안 쓴다. */
    provider?: string;
    locale?: string;
    /** 표시 이름. 경칭은 언어별로 여기서 붙인다(NOTICE_SHELL.nameSuffix). */
    userName?: string | null;
    /** 처리 시각. 안 주면 지금. */
    at?: Date;
  }): Promise<void> {
    try {
      const locale = this.resolveLocale(input.locale);
      const provider = input.provider ? (PROVIDER_LABEL[input.provider] ?? input.provider) : '';
      const strings = NOTICE_I18N[locale][input.kind](this.config.appName, provider);
      const shell = NOTICE_SHELL[locale];
      const appName = this.config.appName;

      /*
        가입 축하만 정보 박스에 **시각 대신 이메일**을 넣는다. 환영 메일에 "처리 시각" 은
        쓸모가 없고, 나중에 "무슨 주소로 가입했더라" 를 찾을 때가 오히려 실제 용도다.
        나머지 셋은 보안 알림이라 시각이 본인 여부를 가리는 단서다.
      */
      const welcome = input.kind === 'SIGNUP_WELCOME';
      const detailLabel = welcome ? shell.accountLabel : shell.timeLabel;
      const detail = welcome ? input.to : formatNoticeTime(locale, input.at ?? new Date());

      const html = this.render(NOTICE_TEMPLATE[input.kind], {
        lang: locale,
        appName: this.config.appName,
        appUrl: this.config.appUrl,
        ctaUrl: this.config.appUrl,
        userNameGreeting: input.userName ? shell.nameSuffix(input.userName) : '',
        copyright: `© ${new Date().getFullYear()} ${appName}`,
        greeting: shell.greeting,
        providerLabel: shell.providerLabel,
        provider,
        detailLabel,
        detail,
        heading: strings.heading,
        message: strings.message,
        ctaLabel: strings.ctaLabel,
        // 가입 축하 템플릿에는 이 자리가 없다 — 남는 값은 그냥 안 쓰인다.
        alertNote: strings.alertNote,
        closingNote: strings.closingNote,
        footerLegal: shell.footerLegal,
      });

      // 플레인텍스트 대체본. 스팸 필터가 텍스트 파트 없는 메일을 불리하게 본다.
      const lines = [
        strings.heading,
        '',
        strings.message,
        '',
        ...(provider ? [`${shell.providerLabel}: ${provider}`] : []),
        `${detailLabel}: ${detail}`,
        '',
        strings.alertNote || strings.closingNote,
      ];
      await this.send({
        to: input.to,
        subject: strings.subject,
        html,
        text: lines.join('\n'),
      });
    } catch (e) {
      this.logger.warn(
        `계정 알림 메일 발송 실패(무시) kind=${input.kind} to=${input.to}: ${String(e)}`,
      );
    }
  }

  /**
   * 요청 언어 → 메일 언어.
   *
   * 우리가 쓰는 말은 둘뿐이라 나머지는 **영어로 보낸다**. 한국어 서비스라고 일본어 요청에
   * 한국어를 보내면 못 읽는 사람에게 못 읽는 말을 보내는 셈이다 — 영어가 그나마 낫다.
   * 언어를 아예 안 알려 준 요청만 기본값(ko)으로 간다.
   */
  private resolveLocale(locale?: string): Locale {
    if (!locale) {
      return DEFAULT_LOCALE;
    }
    return locale.toLowerCase().startsWith('ko') ? 'ko' : 'en';
  }

  /**
   * 템플릿 로드(+캐시) 후 치환. 값은 HTML 이스케이프한다.
   *
   * **치환밖에 없다.** 조건 분기도 반복도 없다 — 그런 게 필요해 보이면 그건 템플릿을
   * 나눌 신호다. HTML 만 열어 봤을 때 무슨 메일인지 읽히지 않으면 유지보수가 안 된다.
   */
  private render(
    base: string,
    vars: Record<string, string>,
    /**
     * 강조 태그가 들어 있는 **우리 문구**. 이스케이프하지 않고 그대로 꽂는다.
     * **사용자 입력을 여기 넣지 말 것** — 이름 같은 값은 vars 로 보내야 한다.
     */
    raw: Record<string, string> = {},
  ): string {
    return this.loadTemplate(base).replace(/\{\{(\w+)\}\}/g, (_m, k: string) =>
      k in raw ? raw[k] : k in vars ? escapeHtml(vars[k]) : '',
    );
  }

  /** 템플릿 로드(+캐시). 없으면 던진다 — 부팅 검사가 이 예외를 잡는다. */
  private loadTemplate(base: string): string {
    let tpl = this.cache.get(base);
    if (tpl === undefined) {
      tpl = readFileSync(resolve(this.templateDir, `${base}.html`), 'utf-8');
      this.cache.set(base, tpl);
    }
    return tpl;
  }

  /**
   * 실제 발송은 @hansapp/email-sender 가 한다.
   *
   * **여기는 본문을 다 만들어 넘기기만 한다** — 꺼져 있거나 SMTP 가 비었을 때의 처리(로그로
   * 대체)도 발송기의 몫이라, 이 계층은 "보냈다/안 보냈다" 를 신경 쓰지 않는다.
   */
  private send(msg: { to: string; subject: string; html: string; text: string }): Promise<void> {
    return this.sender.send(msg);
  }
}
