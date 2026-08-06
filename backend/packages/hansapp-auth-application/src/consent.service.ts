import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConsentType } from '@hansapp/data';

import { AUTH_CONFIG, type AuthConfig } from './auth.config';
import { UserConsentRepository } from './repository/user-consent.repository';

/** 가입 요청이 실어 보내는 동의. 판(version)은 화면이 실제로 보여준 문서의 시행일이다. */
export interface ConsentInput {
  /** 만 14세 이상이라는 자기 선언. 본인확인이 없으므로 나이를 검증하지는 못한다. */
  readonly age: boolean;
  /** 동의한 이용약관의 판(예: '2026-08-06'). */
  readonly termsVersion: string;
  /** 동의한 개인정보처리방침의 판. */
  readonly privacyVersion: string;
}

/** 동의 기록에 함께 남기는 접속 정보. */
export interface ConsentMeta {
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

/**
 * 가입 동의의 검증과 기록.
 *
 * **클릭 자체는 검증할 수 없다.** 사람이 체크박스를 눌렀다는 것을 증명하는 수단은 없다.
 * 서버가 할 수 있는 일은 셋뿐이고, 이 클래스가 그 셋을 맡는다.
 *
 *   1. **요구한다** — 동의 없이 온 요청을 거절한다. 화면에서만 막으면 API 를 직접 부르는
 *      경로가 남는데, 그러면 "우리가 동의를 안 받고 가입시킨" 계정이 생긴다.
 *   2. **판을 대조한다** — 화면이 보여준 판과 서버의 현재 판이 같은지 본다.
 *   3. **기록한다** — 누가·언제·어느 판에·어디에서. 이것이 입증 자료다.
 *
 * 법이 요구하는 것도 "클릭을 증명하라" 가 아니라 **"동의를 받았음을 입증하라"** 이고,
 * 실무의 입증은 이 기록으로 한다.
 *
 * **이용자가 스스로 동의 값을 위조하는 경우는 걱정하지 않는다.** 그것은 본인이 동의했다고
 * 주장하며 보낸 요청이라, 처리자의 책임 관점에서는 문제가 되지 않는다.
 */
@Injectable()
export class ConsentService {
  constructor(
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    private readonly consents: UserConsentRepository,
  ) {}

  /**
   * 계정을 만들기 **전에** 부른다. 통과하지 못하면 계정이 생기지 않는다.
   *
   * 판이 다르면 거절하는 이유: 배포 직후 브라우저가 옛 번들을 들고 있으면 화면에는 옛 조문이
   * 떠 있다. 그대로 받아 새 판에 동의한 것으로 기록하면 **기록과 실제로 읽은 글이 어긋난다.**
   * 그럴 바에는 새로고침을 시키는 편이 정직하다.
   */
  assertValid(input: ConsentInput | undefined): asserts input is ConsentInput {
    if (!input) {
      throw new BadRequestException('Consent is required.');
    }
    if (!input.age) {
      throw new BadRequestException('Age confirmation is required.');
    }
    const { terms, privacy } = this.config.consentVersions;
    if (input.termsVersion !== terms || input.privacyVersion !== privacy) {
      // 사용자가 고칠 수 있는 상황이라(새로고침) 사유를 구분해 준다.
      throw new BadRequestException(
        'Terms have been updated. Please reload and review them again.',
      );
    }
  }

  /**
   * 계정을 만든 **뒤에** 부른다. 세 항목을 한 번에 남긴다.
   *
   * 기록에 실패해도 가입을 되돌리지는 않는다 — 이미 계정이 생긴 뒤라 되돌리면 이용자가
   * "가입이 안 된" 것으로 보게 되는데, 실제로 잃은 것은 우리 쪽 증빙이다. 대신 예외를
   * 그대로 올려 로그에 남도록 둔다(호출부가 감싸지 않는다).
   */
  async record(
    userId: number,
    input: ConsentInput,
    meta: ConsentMeta,
  ): Promise<void> {
    const ip = meta.ip ?? null;
    const userAgent = meta.userAgent ?? null;
    await this.consents.createMany([
      {
        userId,
        type: ConsentType.TERMS,
        version: input.termsVersion,
        ip,
        userAgent,
      },
      {
        userId,
        type: ConsentType.PRIVACY,
        version: input.privacyVersion,
        ip,
        userAgent,
      },
      // 연령 확인은 문서가 아니라 자기 선언이라 판이 없다.
      { userId, type: ConsentType.AGE_14, version: '-', ip, userAgent },
    ]);
  }
}
