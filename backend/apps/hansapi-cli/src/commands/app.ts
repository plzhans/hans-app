import { Command } from 'commander';
import { EnvSource } from '@hansapi/common';
import { AppService } from '@hansapi/auth-application';
import type { AppClient, CreateClientInput } from '@hansapi/auth-application';

import { withAuthContext } from '../context';
import { addExamples } from '../help';
import { printJson } from '../output';

/**
 * 앱(개발자 플랫폼) 관리 커맨드. 포털 콘솔로 하던 등록·발급을 터미널에서 한다.
 *
 * 모든 동작은 **AppService 를 그대로 재사용**한다 — 등급별 앱 한도, 키 상한, 캐시 무효화,
 * 키·clientId 형식이 콘솔과 완전히 같다. CLI 는 파싱과 출력만 한다.
 *
 * 로그인 컨텍스트가 없으므로 **소유자를 --owner 이메일로 지정**한다(HANSAPI_CLI_OWNER 로 기본값).
 */

interface OwnerOptions {
  owner?: string;
}

/** 모든 하위 커맨드에 붙는 소유자 옵션. */
function withOwner(command: Command): Command {
  return command.option(
    '--owner <email>',
    '앱 소유자 이메일. 생략하면 HANSAPI_CLI_OWNER 환경변수를 쓴다',
    process.env.HANSAPI_CLI_OWNER,
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
 * 왔는지 모르면(특히 HANSAPI_CLI_OWNER 가 조용히 쓰일 때) "내가 준 적 없는 이메일"로 실패해
 * 원인을 짚기 어렵다.
 */
async function run<T>(
  source: EnvSource,
  owner: string | undefined,
  action: (apps: AppService, userId: number) => Promise<T>,
): Promise<T> {
  const email = owner?.trim();
  if (!email) {
    throw new Error(
      '소유자 이메일이 없다. --owner <email> 로 주거나 HANSAPI_CLI_OWNER 환경변수를 지정하라.',
    );
  }
  // 값이 어디서 왔는지 밝힌다(옵션 우선, 없으면 환경변수).
  const from =
    email === process.env.HANSAPI_CLI_OWNER?.trim()
      ? 'HANSAPI_CLI_OWNER 환경변수'
      : '--owner 옵션';

  return withAuthContext(source, async (context) => {
    const apps = context.get(AppService);
    const userId = await apps.resolveUserIdByEmail(email).catch(() => {
      throw new Error(
        [
          `사용자를 찾을 수 없다: "${email}"`,
          `  값 출처 : ${from}`,
          `  환경    : ${source.env} (--env 로 바꾼다)`,
          '  확인    : 그 환경 DB 에 해당 이메일로 가입된 계정이 있어야 한다.',
          '            포털에서 가입/소셜 로그인을 먼저 하거나, 올바른 이메일을 지정하라.',
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
  source: EnvSource,
  owner: string | undefined,
  appId: number,
  clientPk: number,
  field: 'origins' | 'redirectUris',
  values: string[],
): Promise<void> {
  if (values.length === 0) {
    throw new Error('추가할 값이 없다. --add <url> 를 지정하라.');
  }
  const result = await run(source, owner, async (apps, userId) => {
    const clients = await apps.listClients(userId, appId);
    const client = clients.find((c) => c.id === clientPk);
    if (!client) {
      throw new Error(`클라이언트를 찾을 수 없다: ${clientPk}`);
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

export function appCommand(source: EnvSource): Command {
  const app = new Command('app').description(
    '앱·서비스 키·클라이언트 관리 (포털 콘솔과 동일한 규칙)',
  );

  // ---- 앱 ----
  addExamples(
    withOwner(
      app
        .command('create')
        .description('앱을 등록한다')
        .requiredOption('--name <name>', '앱 이름(영어·하이픈만)'),
    ).action(async (options: OwnerOptions & { name: string }) => {
      const created = await run(source, options.owner, (apps, userId) =>
        apps.createApp(userId, options.name),
      );
      printJson({ id: created.id, name: created.name }, true);
    }),
    ['hansapi-cli app create --name medifinder --owner me@example.com'],
  );

  withOwner(app.command('list').description('내 앱 목록')).action(
    async (options: OwnerOptions) => {
      const apps = await run(source, options.owner, (svc, userId) =>
        svc.listApps(userId),
      );
      printJson(
        apps.map((a) => ({
          id: a.id,
          name: a.name,
          status: a.status,
          deletedAt: a.deletedAt ?? undefined,
        })),
        true,
      );
    },
  );

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
    ).action(
      async (options: OwnerOptions & { app?: number; all?: boolean }) => {
        if (!options.all && options.app === undefined) {
          throw new Error('--app <id> 또는 --all 중 하나를 지정하라.');
        }
        const deleted = await run(
          source,
          options.owner,
          async (svc, userId) => {
            // 대상 결정. --all 은 이미 삭제된 앱을 건너뛴다(중복 호출 방지).
            const targets = options.all
              ? (await svc.listApps(userId))
                  .filter((a) => !a.deletedAt)
                  .map((a) => ({ id: a.id, name: a.name }))
              : [{ id: options.app as number, name: undefined }];

            const done: { id: number; name?: string }[] = [];
            for (const t of targets) {
              await svc.deleteApp(userId, t.id);
              done.push(t);
            }
            return done;
          },
        );
        printJson({ deleted: deleted.length, apps: deleted }, true);
      },
    ),
    [
      'hansapi-cli app delete --app 4 --owner me@example.com',
      'hansapi-cli app delete --all --owner me@example.com',
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
      const { apiKey, plainKey } = await run(
        source,
        options.owner,
        (svc, userId) => svc.createApiKey(userId, options.app, options.name),
      );
      printJson(
        { id: apiKey.id, name: apiKey.name, keyPrefix: apiKey.keyPrefix },
        true,
      );
      printSecret('서비스 키', plainKey);
    }),
    ['hansapi-cli app key --app 10000 --name server-prod'],
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
        .option(
          '--origin <url>',
          '[web] 승인된 JavaScript 원본(반복 가능)',
          collect,
          [],
        )
        .option(
          '--redirect <url>',
          '[web] 승인된 리디렉션 URI(반복 가능)',
          collect,
          [],
        )
        .option('--bundle-id <id>', '[ios] Bundle ID')
        .option('--team-id <id>', '[ios] Apple Team ID')
        .option('--package <name>', '[android] 패키지명')
        .option(
          '--fingerprint <sha256>',
          '[android] SHA-256 지문(반복 가능)',
          collect,
          [],
        ),
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
          throw new Error(
            `알 수 없는 --type: ${options.type} (web|ios|android)`,
          );
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

        const { client, plainSecret } = await run(
          source,
          options.owner,
          (svc, userId) => svc.createClient(userId, options.app, input),
        );
        printJson(briefClient(client), true);
        if (plainSecret) {
          printSecret('Client Secret', plainSecret);
        }
      },
    ),
    [
      'hansapi-cli app client --app 10000 --name web \\',
      '    --origin https://medifinder.kr --redirect https://medifinder.kr/auth/callback',
    ],
  );

  addExamples(
    withOwner(
      app
        .command('client-delete')
        .description(
          '클라이언트를 삭제한다(하드 삭제 — 앱 삭제와 달리 행이 사라진다)',
        )
        .requiredOption('--app <id>', '앱 id', Number)
        .requiredOption(
          '--client <pk>',
          '클라이언트 id(내부 pk, app show 로 확인)',
          Number,
        ),
    ).action(
      async (options: OwnerOptions & { app: number; client: number }) => {
        await run(source, options.owner, (svc, userId) =>
          svc.deleteClient(userId, options.app, options.client),
        );
        printJson({ deleted: options.client }, true);
      },
    ),
    ['hansapi-cli app client-delete --app 10002 --client 100008'],
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
    ).action(
      async (
        options: OwnerOptions & { app: number; client: number; add: string[] },
      ) => {
        await appendToClient(
          source,
          options.owner,
          options.app,
          options.client,
          'origins',
          options.add,
        );
      },
    ),
    [
      'hansapi-cli app origin --app 10000 --client 100000 --add https://develop.medifinder.kr',
    ],
  );

  addExamples(
    withOwner(
      app
        .command('redirect')
        .description('웹 클라이언트에 승인된 리디렉션 URI 를 추가한다')
        .requiredOption('--app <id>', '앱 id', Number)
        .requiredOption('--client <pk>', '클라이언트 id(내부 pk)', Number)
        .option('--add <url>', '추가할 리디렉션 URI(반복 가능)', collect, []),
    ).action(
      async (
        options: OwnerOptions & { app: number; client: number; add: string[] },
      ) => {
        await appendToClient(
          source,
          options.owner,
          options.app,
          options.client,
          'redirectUris',
          options.add,
        );
      },
    ),
    [
      'hansapi-cli app redirect --app 10000 --client 100000 --add https://develop.medifinder.kr/auth/callback',
    ],
  );

  return app;
}
