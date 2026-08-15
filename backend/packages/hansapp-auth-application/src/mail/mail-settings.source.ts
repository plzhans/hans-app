import { Inject, Injectable, Logger } from '@nestjs/common';
import type { EmailSettings, EmailSettingsSource } from '@hansapp/email-sender';

import { SettingCache } from '../setting/setting-cache.service';
import { MAIL_CONFIG, type MailConfig } from './mail.config';

/**
 * 발송기에 설정을 대 준다. **값은 DB(env_setting)에서 온다.**
 *
 * 발송기(@hansapp/email-sender)는 값이 어디서 오는지 모르고, AuthEmailService 는 본문만
 * 만든다. 그 사이를 잇는 것이 이 클래스 하나라 — 출처를 바꾸는 일이 여기서 끝난다.
 *
 * **부를 때마다 읽는다.** SettingCache 가 5분 캐시를 들고 있어 DB 를 매번 때리지 않으면서도,
 * 관리 화면에서 바꾼 값이 재시작 없이 먹는다.
 *
 * 기본값이 여기 있는 이유는 설정 파일을 걷어내기 때문이다 — 아무것도 없을 때 무엇이 되는지는
 * 이제 코드만 말할 수 있다.
 */
@Injectable()
export class MailSettingsSource implements EmailSettingsSource {
  private readonly logger = new Logger(MailSettingsSource.name);
  /** 강제 차단 안내를 한 번만 남긴다. 메일 한 통마다 찍으면 로그가 그것만 남는다. */
  private warned = false;

  constructor(
    private readonly settings: SettingCache,
    @Inject(MAIL_CONFIG) private readonly config: MailConfig,
  ) {}

  async load(): Promise<EmailSettings> {
    /*
      **꺼짐이 기본이다.** 설정을 덜 채운 환경이 바깥으로 메일을 뿌리는 사고보다,
      켜기를 잊어 안 나가는 쪽이 되돌리기 쉽다.
    */
    /*
      **설정 파일이 DB 를 이기는 유일한 자리다.** 로컬에서 develop DB 를 보며 개발할 때
      실제 사용자에게 메일이 나가는 것을 막는다. 화면에서 끄면 develop 서버까지 같이 꺼지므로
      이 서버에서만 듣는 스위치가 따로 필요하다.
    */
    if (this.config.forceDisabled) {
      if (!this.warned) {
        this.warned = true;
        this.logger.warn(
          'mail.forceDisabled=true — sending is blocked regardless of the database setting. Bodies go to the console.',
        );
      }
      return { enabled: false, from: DEFAULT_FROM, smtp: null };
    }

    const enabled = await this.settings.getBoolean('mail.enabled', false);
    const from = await this.settings.getString('mail.from');
    const host = await this.settings.getString('mail.smtp.host');

    return {
      enabled,
      // `??` 다 — 관리자가 일부러 빈 값으로 뒀다면 그 뜻을 존중할 자리가 아니다(발송이 깨진다).
      from: from || DEFAULT_FROM,
      // host 가 없으면 보낼 곳이 없다. 나머지를 읽어 봐야 의미가 없다.
      smtp: host
        ? {
            host,
            port: await this.settings.getNumber('mail.smtp.port', 587),
            secure: await this.settings.getBoolean('mail.smtp.secure', false),
            user: (await this.settings.getString('mail.smtp.user')) || undefined,
            password: (await this.settings.getString('mail.smtp.password')) || undefined,
          }
        : null,
    };
  }
}

/** 보내는 사람을 안 정했을 때. 메일이 아예 안 나가는 것보다 낫다. */
const DEFAULT_FROM = 'HansApp <no-reply@plzhans.com>';
