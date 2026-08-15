import { Inject, Injectable } from '@nestjs/common';
import { ConsentRequiredError } from './error';
import { ConsentType } from '@hansapp/data';

import { AUTH_CONFIG, type AuthConfig } from './auth.config';
import { UserConsentRepository } from './repository/user-consent.repository';

/** 가입 요청이 실어 보내는 동의. 판(version)은 화면이 실제로 보여준 문서의 시행일이다. */
export interface ConsentInput {
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
 * 나이 확인은 받지 않는다 — 본인확인이 없어 검증이 안 되고, 자기 선언을 한 줄 더 받아도 얻는
 * 것이 없다. "만 14세 미만은 가입할 수 없다" 는 규칙은 약관·방침에 남아 있고, 약관에 동의하는
 * 것으로 그 조건에 동의한 것이 된다. (`ConsentType.AGE_14` 은 쓰지 않지만 enum 에 남겨 둔다 —
 * 지우려면 마이그레이션이 하나 더 필요한데 얻는 것이 없다.)
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
      throw new ConsentRequiredError();
    }
    const { terms, privacy } = this.config.consentVersions;
    if (input.termsVersion !== terms || input.privacyVersion !== privacy) {
      // 사용자가 고칠 수 있는 상황이라(새로고침) 사유를 구분해 준다.
      throw new ConsentRequiredError({
        message: 'Terms have been updated. Please reload and review them again.',
      });
    }
  }

  /**
   * 계정을 만든 **뒤에** 부른다. 세 항목을 한 번에 남긴다.
   *
   * 기록에 실패해도 가입을 되돌리지는 않는다 — 이미 계정이 생긴 뒤라 되돌리면 이용자가
   * "가입이 안 된" 것으로 보게 되는데, 실제로 잃은 것은 우리 쪽 증빙이다. 대신 예외를
   * 그대로 올려 로그에 남도록 둔다(호출부가 감싸지 않는다).
   */
  /**
   * 이 회원의 동의 기록. **본인 열람용이다**(개인정보처리방침 제10조).
   *
   * IP·기기는 여기서 걸러 내지 않는다 — 걸러 내는 것은 응답을 만드는 쪽(컨트롤러)의 몫이고,
   * 이 계층은 저장된 그대로를 돌려준다.
   */
  listByUser(userId: number) {
    return this.consents.listByUser(userId);
  }

  /**
   * 앱을 만들기 **전에** 부른다. 통과하지 못하면 앱이 생기지 않는다.
   *
   * 가입 동의(assertValid)와 같은 이유로 판을 대조한다. 다른 점은 받는 시점뿐이다 —
   * API 이용약관의 계약 상대는 회원이 아니라 개발자라(제4조), 앱을 등록하지 않는 사람에게는
   * 물을 일이 없다.
   */
  assertApiTerms(version: string | undefined): asserts version is string {
    if (!version) {
      throw new ConsentRequiredError({ message: 'API terms consent is required.' });
    }
    if (version !== this.config.consentVersions.apiTerms) {
      throw new ConsentRequiredError({
        message: 'API terms have been updated. Please reload and review them again.',
      });
    }
  }

  /**
   * 앱을 만든 **뒤에** 부른다.
   *
   * **앱마다 한 행씩 남는다.** 같은 사람이 앱을 셋 만들면 세 행이다 — 약관이 정하는 이용계약은
   * 앱(애플리케이션) 단위로 성립하므로, 어느 앱을 만들 때 무엇에 동의했는지가 각각 남아야 한다.
   * 사람 단위로 한 행만 두면 두 번째 앱부터는 동의를 받은 기록이 없다.
   */
  async recordApiTerms(userId: number, version: string, meta: ConsentMeta): Promise<void> {
    await this.consents.createMany([
      {
        userId,
        type: ConsentType.API_TERMS,
        version,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      },
    ]);
  }

  async record(userId: number, input: ConsentInput, meta: ConsentMeta): Promise<void> {
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
    ]);
  }
}
