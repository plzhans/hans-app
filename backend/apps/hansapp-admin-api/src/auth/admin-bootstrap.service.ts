import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ADMIN_AUTH_CONFIG, AdminAuthService } from '@hansapp/admin-application/auth';
import type { AdminAuthConfig } from '@hansapp/admin-application/auth';

import { appEnv } from '../boot-config';

/**
 * 부팅할 때 관리자 계정이 하나도 없으면 기본 계정을 만든다.
 *
 * 관리자 계정을 만드는 통로가 CLI 뿐이라, 새 환경을 세울 때마다 "서버는 떴는데 로그인할
 * 계정이 없는" 상태를 손으로 풀어야 했다. 그 한 단계를 없애려는 것이다.
 *
 * **운영에서는 설정과 무관하게 동작하지 않는다.**
 * 이 기능은 결국 "환경변수를 아는 사람이 관리자 계정을 갖는다" 는 뜻이라, 켜고 끄는 판단을
 * 설정 한 줄에 맡길 수 없다. 환경변수 오타나 잘못 복사한 .env 하나로 운영에 관리자가
 * 생기는 길을 아예 코드에서 끊는다. 운영은 CLI(`hansapp-cli admin create`)로만 만든다.
 *
 * **이 서비스가 앱 계층에 있는 이유**는 "서버가 부팅될 때" 라는 조건 때문이다.
 * AdminAuthModule 은 CLI 도 띄우는데(withAdminAuthContext), `hansapp-cli admin list` 를
 * 쳤다고 계정이 생기면 곤란하다. 계정을 만드는 동작 자체는 응용 계층이 갖고, 그것을
 * 언제 부를지는 서버가 정한다.
 */
@Injectable()
export class AdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger('AdminBootstrap');

  constructor(
    @Inject(ADMIN_AUTH_CONFIG) private readonly config: AdminAuthConfig,
    private readonly auth: AdminAuthService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const { enabled, email, password, name } = this.config.bootstrap;

    if (!enabled) return;

    if (appEnv === 'production') {
      // 조용히 넘어가지 않는다 — 켜 둔 설정이 무시되고 있다는 사실을 알아야 한다.
      this.logger.warn(
        'admin.bootstrap.enabled is on but does nothing in production. ' +
          'Create admin accounts with `hansapp-cli admin create`.',
      );
      return;
    }

    if (!email) {
      this.logger.warn(
        'admin.bootstrap.enabled is on but admin.bootstrap.email is empty — skipping.',
      );
      return;
    }

    // **계정이 하나라도 있으면 아무것도 하지 않는다.** 재부팅마다 계정을 만들거나
    // 비밀번호를 되돌리면 운영자가 바꿔 둔 값이 날아간다.
    if ((await this.auth.countAdmins()) > 0) return;

    try {
      const { admin, generatedPassword } = await this.auth.createAdmin({
        email,
        name,
        // 비어 있으면 응용 계층이 난수를 만들어 돌려준다.
        plainPassword: password || undefined,
      });

      this.logger.log(
        `No admin account existed, so a bootstrap account was created: ${admin.email}`,
      );

      if (generatedPassword) {
        /*
          **난수 비밀번호는 여기서 한 번만 볼 수 있다.** 해시만 저장하므로 다시 꺼낼 수 없다.
          로그에 평문을 찍는 것은 원칙적으로 피해야 하지만, 이 경로는 local·develop 로
          한정돼 있고 그 값으로 처음 로그인하면 곧바로 변경을 강제한다.
          (놓쳤으면 hansapp-cli admin password-reset 으로 다시 발급하면 된다.)
        */
        this.logger.log(
          [
            '',
            '  ┌─────────────────────────────────────────────',
            `  │ Initial password (shown only now): ${generatedPassword}`,
            '  │ The password must be changed on first sign-in.',
            '  └─────────────────────────────────────────────',
            '',
          ].join('\n'),
        );
      } else {
        this.logger.log(
          'The initial password came from admin.bootstrap.password. It must be changed on first sign-in.',
        );
      }
    } catch (error) {
      // 계정을 못 만들었다고 서버를 못 뜨게 할 이유는 없다 — CLI 로 만들면 된다.
      this.logger.error(`Failed to create the bootstrap admin account: ${String(error)}`);
    }
  }
}
