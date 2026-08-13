/**
 * 메일 발송기.
 *
 * **한 통 보내는 일만 한다.** 템플릿·다국어·인증 코드 같은 것은 이 패키지가 모른다 —
 * 부르는 쪽이 본문을 다 만들어 넘기고, 여기서는 SMTP 접속과 재연결만 책임진다.
 *
 * 값의 출처도 모른다. `EmailSettingsSource` 를 구현해 넘기면 설정 파일이든 DB 든
 * 발송기를 건드리지 않고 갈아끼울 수 있다.
 */
export { EmailSender, describeEmailSettings } from './email-sender';
export type { EmailMessage } from './email-sender';
export { EMAIL_SETTINGS_SOURCE } from './email-settings';
export type { EmailSettings, EmailSettingsSource, SmtpSettings } from './email-settings';
