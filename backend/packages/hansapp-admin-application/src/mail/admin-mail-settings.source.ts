import { Inject, Injectable, Logger } from '@nestjs/common';
import type { EmailSettings, EmailSettingsSource } from '@hansapp/email-sender';

import { SettingCache } from '../setting/setting-cache.service';
import { ADMIN_MAIL_CONFIG, type AdminMailConfig } from './admin-mail.config';

/**
 * 발송기에 설정을 대 준다. **값은 DB(env_setting)에서 온다.**
 *
 * **auth 계층의 MailSettingsSource 와 같은 일을 한다.** 그걸 가져다 쓰지 않는 것은
 * 관리자 계층이 회원 인증 계층(@hansapp/auth-application)을 의존하면 안 되기 때문이다 —
 * 읽는 키가 같으니 화면에서 한 번 고치면 두 통로가 함께 따른다.
 *
 * **부를 때마다 읽는다.** SettingCache 가 5분 캐시를 들고 있어 DB 를 매번 때리지 않으면서도,
 * 관리 화면에서 바꾼 값이 재시작 없이 먹는다.
 */
@Injectable()
export class AdminMailSettingsSource implements EmailSettingsSource {
  private readonly logger = new Logger(AdminMailSettingsSource.name);
  /** 강제 차단 안내를 한 번만 남긴다. 메일 한 통마다 찍으면 로그가 그것만 남는다. */
  private warned = false;

  constructor(
    private readonly settings: SettingCache,
    @Inject(ADMIN_MAIL_CONFIG) private readonly config: AdminMailConfig,
  ) {}

  async load(): Promise<EmailSettings> {
    /*
      **설정 파일이 DB 를 이기는 자리다.** 로컬에서 develop DB 를 보며 개발할 때 실제
      관리자에게 메일이 나가는 것을 막는다. 화면에서 끄면 develop 서버까지 같이 꺼지므로
      이 서버에서만 듣는 스위치가 따로 필요하다.
    */
    if (this.config.forceDisabled) {
      if (!this.warned) {
        this.warned = true;
        this.logger.warn(
          'mail.forceDisabled=true — DB 설정과 무관하게 발송을 막는다. 본문은 콘솔로 나간다.',
        );
      }
      return { enabled: false, from: DEFAULT_FROM, smtp: null };
    }

    /*
      **꺼짐이 기본이다.** 설정을 덜 채운 환경이 바깥으로 메일을 뿌리는 사고보다,
      켜기를 잊어 안 나가는 쪽이 되돌리기 쉽다.
    */
    const enabled = await this.settings.getBoolean('mail.enabled', false);
    const from = await this.settings.getString('mail.from');
    const host = await this.settings.getString('mail.smtp.host');

    return {
      enabled,
      // `||` 다 — 빈 값으로 둔 뜻을 존중할 자리가 아니다(발송이 깨진다).
      from: from || DEFAULT_FROM,
      // host 가 없으면 보낼 곳이 없다. 나머지를 읽어 봐야 의미가 없다.
      smtp: host
        ? {
            host,
            port: await this.settings.getNumber('mail.smtp.port', 587),
            secure: await this.settings.getBoolean('mail.smtp.secure', false),
            user:
              (await this.settings.getString('mail.smtp.user')) || undefined,
            password:
              (await this.settings.getString('mail.smtp.password')) ||
              undefined,
          }
        : null,
    };
  }
}

/** 보내는 사람을 안 정했을 때. 메일이 아예 안 나가는 것보다 낫다. */
const DEFAULT_FROM = 'HansApp <no-reply@plzhans.com>';
