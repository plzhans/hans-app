import { Injectable } from '@nestjs/common';
import type { EmailSettings, EmailSettingsSource } from '@hansapp/email-sender';

import { SettingService } from '../setting/setting.service';

/**
 * 발송기에 설정을 대 준다. **값은 DB(env_setting)에서 온다.**
 *
 * 발송기(@hansapp/email-sender)는 값이 어디서 오는지 모르고, AuthEmailService 는 본문만
 * 만든다. 그 사이를 잇는 것이 이 클래스 하나라 — 출처를 바꾸는 일이 여기서 끝난다.
 *
 * **부를 때마다 읽는다.** SettingService 가 5분 캐시를 들고 있어 DB 를 매번 때리지 않으면서도,
 * 관리 화면에서 바꾼 값이 재시작 없이 먹는다.
 *
 * 기본값이 여기 있는 이유는 설정 파일을 걷어내기 때문이다 — 아무것도 없을 때 무엇이 되는지는
 * 이제 코드만 말할 수 있다.
 */
@Injectable()
export class MailSettingsSource implements EmailSettingsSource {
  constructor(private readonly settings: SettingService) {}

  async load(): Promise<EmailSettings> {
    /*
      **꺼짐이 기본이다.** 설정을 덜 채운 환경이 바깥으로 메일을 뿌리는 사고보다,
      켜기를 잊어 안 나가는 쪽이 되돌리기 쉽다.
    */
    const enabled = await this.settings.getBoolean('mail.enabled', false);
    const from = await this.settings.getString('mail.from');
    const host = await this.settings.getString('mail.smtp.host');

    return {
      enabled,
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
