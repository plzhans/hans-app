import { Command } from 'commander';
import { ConfigSource } from '@hansapp/common';
import { AppService, UserTier } from '@hansapp/auth-application';
import type { UserTierInfo } from '@hansapp/auth-application';

import { withAuthContext } from '../context';
import { addExamples } from '../help';
import { printJson } from '../output';

/**
 * 사용자 관리 커맨드. **운영자 전용 동작만** 둔다.
 *
 * 등급(tier)은 앱 생성 한도를 정하는 값이라 본인이 올릴 수 있으면 한도가 의미를 잃는다.
 * 그래서 포털웹·API 에는 통로가 없고 여기서만 바꾼다.
 */

const TIERS = Object.values(UserTier);

/** 컨텍스트를 띄우고 이메일을 userId 로 바꿔 넘긴다. */
async function run<T>(
  source: ConfigSource,
  email: string | undefined,
  action: (apps: AppService, userId: number) => Promise<T>,
): Promise<T> {
  const target = email?.trim();
  if (!target) {
    throw new Error('--email <email> is required.');
  }
  return withAuthContext(source, async (context) => {
    const apps = context.get(AppService);
    // app 커맨드와 같은 이유로 실패 메시지에 입력값·환경을 담는다(--env 를 틀리면 바로 여기 걸린다).
    const userId = await apps.resolveUserIdByEmail(target).catch(() => {
      throw new Error(
        [
          `User not found: "${target}"`,
          `  Environment : ${source.env} (change it with --env)`,
          '  Check       : that environment must have an account registered with this email.',
        ].join('\n'),
      );
    });
    return action(apps, userId);
  });
}

/** 한도는 null 이 무제한이다. JSON 에 그대로 내면 읽는 사람이 헷갈린다. */
function present(info: UserTierInfo) {
  return {
    email: info.email,
    tier: info.tier,
    appLimit: info.appLimit ?? 'unlimited',
    appCount: info.appCount,
  };
}

export function userCommand(source: ConfigSource): Command {
  const user = new Command('user').description('사용자 관리 (운영자용)');

  addExamples(
    user
      .command('show')
      .description('사용자의 등급과 앱 사용량을 본다')
      .requiredOption('--email <email>', '대상 사용자 이메일')
      .action(async (options: { email: string }) => {
        const info = await run(source, options.email, (apps, userId) => apps.getUserTier(userId));
        printJson(present(info), true);
      }),
    ['hansapp-cli user show --email me@example.com'],
  );

  addExamples(
    user
      .command('tier')
      .description(`사용자 등급을 바꾼다. 앱 생성 한도가 따라 바뀐다`)
      .requiredOption('--email <email>', '대상 사용자 이메일')
      .requiredOption('--tier <tier>', `등급: ${TIERS.join(' | ')}`)
      .action(async (options: { email: string; tier: string }) => {
        // enum 값과 정확히 맞춰야 Prisma 가 받는다. 대소문자만 관대하게 처리한다.
        const tier = options.tier.trim().toUpperCase() as UserTier;
        if (!TIERS.includes(tier)) {
          throw new Error(`Unknown --tier: ${options.tier} (${TIERS.join(' | ')})`);
        }
        const info = await run(source, options.email, (apps, userId) =>
          apps.setUserTier(userId, tier),
        );
        printJson(present(info), true);
      }),
    [
      'hansapp-cli user tier --email me@example.com --tier UNLIMITED',
      'hansapp-cli user tier --email me@example.com --tier BASIC',
    ],
  );

  return user;
}
