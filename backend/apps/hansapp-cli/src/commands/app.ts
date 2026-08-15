import { Command } from 'commander';
import { ConfigSource } from '@hansapp/common';
import { AppService, AppStatus } from '@hansapp/auth-application';
import type { AppClient, CreateClientInput } from '@hansapp/auth-application';

import { withAuthContext } from '../context';
import { addExamples } from '../help';
import { printJson } from '../output';

/**
 * 앱(개발자 플랫폼) 관리 커맨드. 포털웹 콘솔로 하던 등록·발급을 터미널에서 한다.
 *
 * 모든 동작은 **AppService 를 그대로 재사용**한다 — 등급별 앱 한도, 키 상한, 캐시 무효화,
 * 키·clientId 형식이 콘솔과 완전히 같다. CLI 는 파싱과 출력만 한다.
 *
 * 로그인 컨텍스트가 없으므로 **소유자를 --owner 이메일로 지정**한다(HANSAPP_CLI_OWNER 로 기본값).
 */

interface OwnerOptions {
  owner?: string;
}

/** 모든 하위 커맨드에 붙는 소유자 옵션. */
function withOwner(command: Command): Command {
  return command.option(
    '--owner <email>',
    '앱 소유자 이메일. 생략하면 HANSAPP_CLI_OWNER 환경변수를 쓴다',
    process.env.HANSAPP_CLI_OWNER,
  );
}

/** 반복 옵션 수집기(--origin a --origin b). */
function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

/**
 * 컨텍스트를 띄우고 소유자 이메일을 userId 로 바꿔 넘긴다.
 *
 * 실패 메시지에 **입력값·출처·환경**을 모두 담는다. 이메일이 옵션에서 왔는지 환경변수에서
 * 왔는지 모르면(특히 HANSAPP_CLI_OWNER 가 조용히 쓰일 때) "내가 준 적 없는 이메일"로 실패해
 * 원인을 짚기 어렵다.
 */
async function run<T>(
  source: ConfigSource,
  owner: string | undefined,
  action: (apps: AppService, userId: number) => Promise<T>,
): Promise<T> {
  const email = owner?.trim();
  if (!email) {
    throw new Error(
      'No owner email. Pass --owner <email> or set the HANSAPP_CLI_OWNER environment variable.',
    );
  }
  // 값이 어디서 왔는지 밝힌다(옵션 우선, 없으면 환경변수).
  const from =
    email === process.env.HANSAPP_CLI_OWNER?.trim() ? 'HANSAPP_CLI_OWNER 환경변수' : '--owner 옵션';

  return withAuthContext(source, async (context) => {
    const apps = context.get(AppService);
    const userId = await apps.resolveUserIdByEmail(email).catch(() => {
      throw new Error(
        [
          `User not found: "${email}"`,
          `  Source      : ${from}`,
          `  Environment : ${source.env} (change it with --env)`,
          '  Check       : that environment must have an account registered with this email.',
          '                Sign up (or sign in with a social account) on the portal first, or pass the right email.',
        ].join('\n'),
      );
    });
    return action(apps, userId);
  });
}

/** 시크릿은 이때만 볼 수 있으므로 눈에 띄게 찍는다. */
function printSecret(label: string, value: string): void {
  console.log('');
  console.log(`  ${label} (지금만 확인 가능):`);
  console.log(`  ${value}`);
  console.log('');
}

/** 클라이언트의 origins/redirectUris 에 값을 **더한다**(기존 유지, 중복 제거). */
async function appendToClient(
  source: ConfigSource,
  owner: string | undefined,
  appId: number,
  clientPk: number,
  field: 'origins' | 'redirectUris',
  values: string[],
): Promise<void> {
  if (values.length === 0) {
    throw new Error('Nothing to add. Specify --add <url>.');
  }
  const result = await run(source, owner, async (apps, userId) => {
    const clients = await apps.listClients(userId, appId);
    const client = clients.find((c) => c.id === clientPk);
    if (!client) {
      throw new Error(`Client not found: ${clientPk}`);
    }
    const current = (client[field] as string[] | null) ?? [];
    const merged = Array.from(new Set([...current, ...values]));
    await apps.updateClient(userId, appId, clientPk, { [field]: merged });
    return { clientId: client.clientId, [field]: merged };
  });
  printJson(result, true);
}

/** 클라이언트를 목록 표시용으로 줄인다(시크릿 해시 등은 빼고). */
function briefClient(c: AppClient) {
  return {
    id: c.id,
    clientId: c.clientId,
    name: c.name,
    type: c.type,
    status: c.status,
    origins: c.origins ?? undefined,
    redirectUris: c.redirectUris ?? undefined,
    config: c.config ?? undefined,
  };
}

export function appCommand(source: ConfigSource): Command {
  const app = new Command('app').description(
    '앱·서비스 키·클라이언트 관리 (포털웹 콘솔과 동일한 규칙)',
  );

  // ---- 앱 ----
  addExamples(
    withOwner(
      app
        .command('create')
        .description('앱을 등록한다(CLI 는 관리자라 기본 승인됨)')
        .requiredOption('--name <name>', '앱 이름(영어·하이픈만)')
        .option('--pending', '미승인(PENDING) 상태로 만든다. 콘솔 사용자 흐름 재현용'),
    ).action(async (options: OwnerOptions & { name: string; pending?: boolean }) => {
      // CLI 로 만든다는 건 관리자 손을 탔다는 뜻이라 기본 ACTIVE 다.
      // 미승인 상태가 필요하면 --pending 을 명시한다.
      const status = options.pending ? AppStatus.PENDING : AppStatus.ACTIVE;
      const created = await run(source, options.owner, (apps, userId) =>
        apps.createApp(userId, options.name, status),
      );
      printJson({ id: created.id, name: created.name, status: created.status }, true);
    }),
    ['hansapp-cli app create --name medifinder --owner me@example.com'],
  );

  addExamples(
    app
      .command('approve')
      .description('앱을 승인한다(PENDING→ACTIVE, 하위 PENDING 키·클라이언트도 함께). 운영자용')
      .requiredOption('--app <id>', '승인할 앱 id', Number)
      .action(async (options: { app: number }) => {
        // 승인은 소유자가 아니라 운영자 행위다 — withOwner 를 붙이지 않는다.
        const app = await withAuthContext(source, (context) =>
          context.get(AppService).approveApp(options.app),
        );
        printJson({ id: app.id, name: app.name, status: app.status }, true);
      }),
    ['hansapp-cli app approve --app 10002'],
  );

  addExamples(
    withOwner(
      app
        .command('request-review')
        .description('앱 심사를 요청한다(콘솔 사용자 행위 미러). PENDING 앱만')
        .requiredOption('--app <id>', '앱 id', Number),
    ).action(async (options: OwnerOptions & { app: number }) => {
      const app = await run(source, options.owner, (svc, userId) =>
        svc.requestReviewApp(userId, options.app),
      );
      printJson(
        {
          id: app.id,
          name: app.name,
          reviewRequestedAt: app.reviewRequestedAt,
        },
        true,
      );
    }),
    ['hansapp-cli app request-review --app 10005'],
  );

  addExamples(
    app
      .command('reject')
      .description('앱 심사를 거절한다(사유 필수). 사용자가 고쳐 재요청한다. 운영자용')
      .requiredOption('--app <id>', '거절할 앱 id', Number)
      .requiredOption('--reason <text>', '거절 사유(사용자에게 노출된다)')
      .action(async (options: { app: number; reason: string }) => {
        const app = await withAuthContext(source, (context) =>
          context.get(AppService).rejectApp(options.app, options.reason),
        );
        printJson({ id: app.id, name: app.name, rejectionReason: app.rejectionReason }, true);
      }),
    ['hansapp-cli app reject --app 10005 --reason "오리진에 운영 도메인이 없습니다"'],
  );

  app
    .command('review-queue')
    .description('심사 요청된 앱 목록(소유자 무관). 운영자 심사 대기함')
    .action(async () => {
      const apps = await withAuthContext(source, (context) =>
        context.get(AppService).listReviewQueue(),
      );
      printJson(
        apps.map((a) => ({
          id: a.id,
          name: a.name,
          createdBy: a.createdBy,
          reviewRequestedAt: a.reviewRequestedAt ?? undefined,
        })),
        true,
      );
    });

  withOwner(app.command('list').description('내 앱 목록')).action(async (options: OwnerOptions) => {
    const apps = await run(source, options.owner, (svc, userId) => svc.listApps(userId));
    printJson(
      apps.map((a) => ({
        id: a.id,
        name: a.name,
        status: a.status,
        deletedAt: a.deletedAt ?? undefined,
      })),
      true,
    );
  });

  withOwner(
    app
      .command('show')
      .description('앱 상세(키·클라이언트 포함)')
      .requiredOption('--app <id>', '앱 id', Number),
  ).action(async (options: OwnerOptions & { app: number }) => {
    const detail = await run(source, options.owner, (svc, userId) =>
      svc.getApp(userId, options.app),
    );
    printJson(
      {
        id: detail.id,
        name: detail.name,
        status: detail.status,
        apiKeyLimit: detail.apiKeyLimit,
        apiKeys: detail.apiKeys.map((k) => ({
          id: k.id,
          name: k.name,
          keyPrefix: k.keyPrefix,
          status: k.status,
        })),
        clients: detail.clients.map(briefClient),
      },
      true,
    );
  });

  addExamples(
    withOwner(
      app
        .command('delete')
        .description('앱을 삭제한다(소프트 삭제 — 하위 키·클라이언트도 비활성)')
        .option('--app <id>', '삭제할 앱 id', Number)
        .option('--all', '내 앱을 **전부** 삭제한다'),
    ).action(async (options: OwnerOptions & { app?: number; all?: boolean }) => {
      if (!options.all && options.app === undefined) {
        throw new Error('Specify either --app <id> or --all.');
      }
      const deleted = await run(source, options.owner, async (svc, userId) => {
        // 대상 결정. --all 은 이미 삭제된 앱을 건너뛴다(중복 호출 방지).
        const apps = options.all ? await svc.listApps(userId) : [];
        const targets = options.all
          ? apps.filter((a) => !a.deletedAt).map((a) => ({ id: a.id, name: a.name }))
          : [{ id: options.app as number, name: undefined }];

        const done: { id: number; name?: string }[] = [];
        for (const t of targets) {
          await svc.deleteApp(userId, t.id);
          done.push(t);
        }
        return done;
      });
      printJson({ deleted: deleted.length, apps: deleted }, true);
    }),
    [
      'hansapp-cli app delete --app 4 --owner me@example.com',
      'hansapp-cli app delete --all --owner me@example.com',
    ],
  );

  // ---- 서비스 키 ----
  addExamples(
    withOwner(
      app
        .command('key')
        .description('서비스 키를 발급한다(원문은 이때만 출력된다)')
        .requiredOption('--app <id>', '앱 id', Number)
        .requiredOption('--name <name>', '키 이름(용도 구분)'),
    ).action(async (options: OwnerOptions & { app: number; name: string }) => {
      const { apiKey, plainKey } = await run(source, options.owner, (svc, userId) =>
        svc.createApiKey(userId, options.app, options.name),
      );
      printJson({ id: apiKey.id, name: apiKey.name, keyPrefix: apiKey.keyPrefix }, true);
      printSecret('서비스 키', plainKey);
    }),
    ['hansapp-cli app key --app 10000 --name server-prod'],
  );

  // ---- 클라이언트 ----
  addExamples(
    withOwner(
      app
        .command('client')
        .description('클라이언트를 등록한다(WEB 은 secret 을 이때만 출력)')
        .requiredOption('--app <id>', '앱 id', Number)
        .requiredOption('--name <name>', '클라이언트 이름(영어·하이픈만)')
        .option('--type <type>', '플랫폼: web | ios | android', 'web')
        .option('--client-id <id>', 'Client ID 직접 지정(비우면 자동 발급)')
        .option('--origin <url>', '[web] 승인된 JavaScript 원본(반복 가능)', collect, [])
        .option('--redirect <url>', '[web] 승인된 리디렉션 URI(반복 가능)', collect, [])
        .option('--bundle-id <id>', '[ios] Bundle ID')
        .option('--team-id <id>', '[ios] Apple Team ID')
        .option('--package <name>', '[android] 패키지명')
        .option('--fingerprint <sha256>', '[android] SHA-256 지문(반복 가능)', collect, []),
    ).action(
      async (
        options: OwnerOptions & {
          app: number;
          name: string;
          type: string;
          clientId?: string;
          origin: string[];
          redirect: string[];
          bundleId?: string;
          teamId?: string;
          package?: string;
          fingerprint: string[];
        },
      ) => {
        const type = options.type.toUpperCase();
        if (!['WEB', 'IOS', 'ANDROID'].includes(type)) {
          throw new Error(`Unknown --type: ${options.type} (web|ios|android)`);
        }
        const input = {
          type,
          name: options.name,
          clientId: options.clientId,
          origins: options.origin,
          redirectUris: options.redirect,
          bundleId: options.bundleId,
          teamId: options.teamId,
          packageName: options.package,
          fingerprints: options.fingerprint,
        } as unknown as CreateClientInput;

        const { client, plainSecret } = await run(source, options.owner, (svc, userId) =>
          svc.createClient(userId, options.app, input),
        );
        printJson(briefClient(client), true);
        if (plainSecret) {
          printSecret('Client Secret', plainSecret);
        }
      },
    ),
    [
      'hansapp-cli app client --app 10000 --name web \\',
      '    --origin https://medifinder.kr --redirect https://medifinder.kr/auth/callback',
    ],
  );

  addExamples(
    withOwner(
      app
        .command('client-delete')
        .description('클라이언트를 삭제한다(하드 삭제 — 앱 삭제와 달리 행이 사라진다)')
        .requiredOption('--app <id>', '앱 id', Number)
        .requiredOption('--client <pk>', '클라이언트 id(내부 pk, app show 로 확인)', Number),
    ).action(async (options: OwnerOptions & { app: number; client: number }) => {
      await run(source, options.owner, (svc, userId) =>
        svc.deleteClient(userId, options.app, options.client),
      );
      printJson({ deleted: options.client }, true);
    }),
    ['hansapp-cli app client-delete --app 10002 --client 100008'],
  );

  // ---- 오리진 / 리디렉션 추가 ----
  addExamples(
    withOwner(
      app
        .command('origin')
        .description('웹 클라이언트에 승인된 JavaScript 원본을 추가한다')
        .requiredOption('--app <id>', '앱 id', Number)
        .requiredOption('--client <pk>', '클라이언트 id(내부 pk)', Number)
        .option('--add <url>', '추가할 오리진(반복 가능)', collect, []),
    ).action(async (options: OwnerOptions & { app: number; client: number; add: string[] }) => {
      await appendToClient(
        source,
        options.owner,
        options.app,
        options.client,
        'origins',
        options.add,
      );
    }),
    ['hansapp-cli app origin --app 10000 --client 100000 --add https://develop.medifinder.kr'],
  );

  addExamples(
    withOwner(
      app
        .command('redirect')
        .description('웹 클라이언트에 승인된 리디렉션 URI 를 추가한다')
        .requiredOption('--app <id>', '앱 id', Number)
        .requiredOption('--client <pk>', '클라이언트 id(내부 pk)', Number)
        .option('--add <url>', '추가할 리디렉션 URI(반복 가능)', collect, []),
    ).action(async (options: OwnerOptions & { app: number; client: number; add: string[] }) => {
      await appendToClient(
        source,
        options.owner,
        options.app,
        options.client,
        'redirectUris',
        options.add,
      );
    }),
    [
      'hansapp-cli app redirect --app 10000 --client 100000 --add https://develop.medifinder.kr/auth/callback',
    ],
  );

  return app;
}
