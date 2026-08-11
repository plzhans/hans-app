import { Command } from 'commander';
import { ConfigSource } from '@hansapp/common';
import { AdminAuthService } from '@hansapp/admin-application/auth';
import type { AdminUser } from '@hansapp/admin-application/auth';

import { withAdminAuthContext } from '../context';
import { addExamples } from '../help';
import { printJson } from '../output';

/**
 * 관리자 계정 커맨드.
 *
 * **운영에서 계정을 만드는 유일한 통로다.** 가입 화면이 없고, 부팅 시 자동 생성은
 * local·develop 에서만 돈다 — 배포해 놓고 계정을 안 만들었다면 여기로 만든다.
 *
 * 관리자 계정은 공개 회원(user)과 테이블부터 갈라져 있다 — 포털웹에서 아무리 가입해도
 * 관리자가 되지 않는다.
 */

/** 컨텍스트를 띄우고 인증 서비스를 넘긴다. */
function run<T>(
  source: ConfigSource,
  action: (auth: AdminAuthService) => Promise<T>,
): Promise<T> {
  return withAdminAuthContext(source, (context) =>
    action(context.get(AdminAuthService)),
  );
}

/** 시크릿은 이때만 볼 수 있으므로 눈에 띄게 찍는다(app 커맨드와 같은 관례). */
function printSecret(label: string, value: string): void {
  console.log('');
  console.log(`  ${label} (지금만 확인 가능):`);
  console.log(`  ${value}`);
  console.log('');
}

/**
 * stdin 을 통째로 읽어 비밀번호로 쓴다.
 *
 * **`--password <평문>` 옵션을 두지 않는 이유**가 여기 있다 — 옵션으로 받으면 셸 히스토리와
 * `ps` 출력에 평문이 남는다. `docker login --password-stdin` 과 같은 방식이다.
 *
 * 끝의 개행 하나만 벗긴다. 비밀번호에 공백이 있을 수 있어 trim() 하지 않는다.
 */
async function readPasswordFromStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk as Buffer));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  const password = raw.replace(/\r?\n$/, '');
  if (!password) {
    throw new Error(
      [
        'stdin 에서 비밀번호를 읽지 못했다.',
        "  사용 : printf '%s' '비밀번호' | hansapp-cli admin create <email> --password-stdin",
        '  주의 : 컨테이너에서 돌린다면 docker compose run 에 -T 를 붙여야 파이프가 먹는다.',
      ].join('\n'),
    );
  }
  return password;
}

/** 응답에 비밀번호 해시가 섞이지 않게 볼 것만 고른다. */
function present(admin: AdminUser) {
  return {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
    status: admin.status,
    mustChangePassword: admin.mustChangePassword,
    lastLoginAt: admin.lastLoginAt,
  };
}

/** 첫 로그인에서 비밀번호를 바꿔야 한다는 안내. 발급 커맨드마다 같은 문장을 쓴다. */
function printChangeNotice(): void {
  console.log('  이 계정은 첫 로그인에서 비밀번호를 반드시 바꿔야 한다.');
  console.log('  (바꾸기 전까지 관리자 API 는 403 으로 막힌다.)');
  console.log('');
}

export function adminCommand(source: ConfigSource): Command {
  const admin = new Command('admin').description('관리자 계정 관리 (운영자용)');

  addExamples(
    admin
      .command('create')
      .description('관리자 계정을 만든다(등급은 시스템 관리자로 고정)')
      .argument('<email>', '로그인 이메일')
      .option('--name <name>', '표시 이름')
      .option(
        '--password-stdin',
        '비밀번호를 stdin 에서 읽는다. 생략하면 난수로 발급해 1회 출력한다',
      )
      .action(
        async (
          email: string,
          options: { name?: string; passwordStdin?: boolean },
        ) => {
          const plainPassword = options.passwordStdin
            ? await readPasswordFromStdin()
            : undefined;

          const { admin: created, generatedPassword } = await run(
            source,
            (auth) =>
              auth.createAdmin({
                email,
                name: options.name,
                plainPassword,
              }),
          );

          printJson(present(created), true);
          if (generatedPassword) {
            printSecret('초기 비밀번호', generatedPassword);
          }
          printChangeNotice();
        },
      ),
    [
      'hansapp-cli admin create admin@example.com --name 관리자',
      "printf '%s' 'Str0ng!Pass' | hansapp-cli admin create admin@example.com --password-stdin",
      '# 배포 서버에서: docker compose run --rm -T hansapp-cli admin create admin@example.com',
    ],
  );

  addExamples(
    admin
      .command('remove')
      .description('관리자 계정을 지운다. 세션도 함께 사라진다')
      .argument('<email>', '대상 관리자 이메일')
      .action(async (email: string) => {
        const removed = await run(source, (auth) => auth.removeAdmin(email));
        printJson({ removed: present(removed) }, true);
      }),
    ['hansapp-cli admin remove old-admin@example.com'],
  );

  addExamples(
    admin
      .command('password-reset')
      .description(
        '비밀번호를 난수로 초기화한다. **살아 있는 세션이 모두 끊긴다**',
      )
      .argument('<email>', '대상 관리자 이메일')
      .option(
        '--password-stdin',
        '난수 대신 stdin 의 값을 쓴다(임시 비밀번호를 직접 정할 때)',
      )
      .action(async (email: string, options: { passwordStdin?: boolean }) => {
        const plain = options.passwordStdin
          ? await readPasswordFromStdin()
          : undefined;

        const { admin: updated, generatedPassword } = await run(
          source,
          (auth) => auth.resetPassword(email, plain),
        );

        printJson(present(updated), true);
        if (generatedPassword) {
          printSecret('새 비밀번호', generatedPassword);
        }
        printChangeNotice();
      }),
    [
      'hansapp-cli admin password-reset admin@example.com',
      "printf '%s' 'Temp!Pass1' | hansapp-cli admin password-reset admin@example.com --password-stdin",
    ],
  );

  addExamples(
    admin
      .command('disable')
      .description('계정을 비활성화한다. 살아 있는 세션도 함께 끊는다')
      .argument('<email>', '대상 관리자 이메일')
      .action(async (email: string) => {
        const updated = await run(source, (auth) => auth.disable(email));
        printJson(present(updated), true);
      }),
    ['hansapp-cli admin disable admin@example.com'],
  );

  addExamples(
    admin
      .command('enable')
      .description('비활성화한 계정을 다시 켠다')
      .argument('<email>', '대상 관리자 이메일')
      .action(async (email: string) => {
        const updated = await run(source, (auth) => auth.enable(email));
        printJson(present(updated), true);
      }),
    ['hansapp-cli admin enable admin@example.com'],
  );

  addExamples(
    admin
      .command('list')
      .description('관리자 목록을 본다')
      .action(async () => {
        const admins = await run(source, (auth) => auth.listAdmins());
        printJson(admins.map(present), true);
      }),
    ['hansapp-cli admin list'],
  );

  return admin;
}
