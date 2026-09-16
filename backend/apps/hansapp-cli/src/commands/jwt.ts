import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { Command } from 'commander';
import { ConfigSource } from '@hansapp/common';
import {
  generateAccessKeyPair,
  jwkThumbprint,
  publicJwkFromPem,
  publicPemFromPem,
  type AccessAlg,
} from '@hansapp/jwt';

import { addExamples } from '../help';

/**
 * access token 서명 키 관리(ES256, 파일 기반).
 *
 * 대상 디렉터리는 repo 의 config/<env>/jwt 다 — 여기서 생성/로테이션하고 env-encrypt.sh 로
 * .key.enc 를 커밋한다. 배포는 env-decrypt.sh 로 복호화한 뒤 AUTH_JWT_KEY_DIR 로 읽는다.
 *   <kid>_<alg>.key      활성 개인키(최상위)
 *   retired/<kid>_<alg>.pub  검증 전용 공개키(로테이션 overlap 중)
 */

const ALGS: AccessAlg[] = ['ES256', 'ES384', 'ES512'];

/**
 * 어느 앱의 서명 키인가. **키 디렉터리가 곧 배포 경계다.**
 *
 * compose 가 앱마다 자기 것만 마운트하므로, 여기서 고른 디렉터리가 그대로 "그 키를 어느
 * 컨테이너가 보느냐" 가 된다. api 것을 admin 자리에 만들면 admin 이 사용자 토큰을 찍을 수 있다.
 */
const APPS = {
  /** 사용자 access token. api 가 서명하고 JWKS 로 공개한다. 공용 번들 안이다. */
  api: {
    dir: (env: string) => join('config', env, 'jwt'),
    /**
     * 라벨에 앱 글자를 안 붙인다. **이쪽이 기본이라서다** — 배포 번들도 이름도 공용이
     * 무표시이고 따로 도는 것만 표시를 얻는다. 기존 키(D001·P001)와도 그대로 이어진다.
     */
    label: '',
  },
  /**
   * 관리자 access token. admin 이 서명하고, 배치가 그 공개키로 실행 요청을 검증한다.
   *
   * **공용 번들 밖이다.** 배포가 `config/<환경>` 만 훑으므로 기본으로는 나가지 않고,
   * admin 을 띄우는 배포 라인이 DEPLOY_ADMIN_SECRETS 로 명시할 때만 나른다.
   */
  admin: {
    dir: (env: string) => join('config', 'admin', env, 'jwt'),
    /** 라벨에 A 를 넣는다. 경로 없이 이름만 보고도 공용 키와 구별되게. */
    label: 'A',
  },
} as const;

type AppName = keyof typeof APPS;

function assertApp(app: string): AppName {
  if (!(app in APPS)) {
    throw new Error(`Unknown app: ${app} (${Object.keys(APPS).join(' | ')})`);
  }
  return app as AppName;
}

function keyDir(source: ConfigSource, app: AppName): string {
  return APPS[app].dir(source.env);
}

function assertAlg(alg: string): AccessAlg {
  if (!(ALGS as string[]).includes(alg)) {
    throw new Error(`Unknown alg: ${alg} (${ALGS.join(' | ')})`);
  }
  return alg as AccessAlg;
}

interface KeyInfo {
  file: string;
  /** 파일 이름에 적힌 번호(D001). **사람이 읽는 라벨이고 kid 가 아니다.** */
  label: string;
  /** 키 내용에서 계산한 실제 kid. 토큰 헤더와 JWKS 에 실리는 값이다. */
  kid: string;
  alg: string;
  role: 'active' | 'retired';
}

/** 디렉터리의 키를 훑어 kid(내용 기준)·alg·역할을 뽑는다. 파일명 kid 와 일치하는지도 본다. */
function scan(dir: string): KeyInfo[] {
  const out: KeyInfo[] = [];
  const read = (d: string, ext: string, role: 'active' | 'retired', isPrivate: boolean) => {
    if (!existsSync(d)) return;
    for (const f of readdirSync(d)) {
      if (!f.endsWith(ext)) continue;
      const stem = f.slice(0, f.length - ext.length);
      const sep = stem.lastIndexOf('_');
      const label = sep > 0 ? stem.slice(0, sep) : stem;
      const alg = sep > 0 ? stem.slice(sep + 1) : '?';
      let kid = '?';
      try {
        kid = jwkThumbprint(publicJwkFromPem(readFileSync(join(d, f), 'utf8'), isPrivate));
      } catch {
        // 파싱 실패는 kid='?' 로 표시만 하고 넘어간다.
      }
      out.push({ file: join(d, f), label, kid, alg, role });
    }
  };
  read(dir, '.key', 'active', true);
  read(join(dir, 'retired'), '.pub', 'retired', false);
  return out;
}

/**
 * 파일 이름(라벨)을 짓는다. **환경 머리글자 + 앱 표식 + 일련번호**다(D001 · DA001).
 *
 * **파일명은 라벨일 뿐 kid 가 아니다.** 실제 kid 는 키 내용의 thumbprint 이고 로드할 때
 * 다시 계산한다(JwtKeyStore). 그래서 여기 이름은 사람이 "몇 번째 키인가" 를 읽는 용도다 —
 * thumbprint 를 그대로 파일명에 박으면 16자 난수라 눈으로 세대를 구분할 수 없다.
 *
 * 같은 디렉터리의 가장 큰 번호 다음을 쓴다. 활성·퇴역을 함께 보므로 번호가 재사용되지 않는다.
 */
function nextKeyName(dir: string, env: string, app: AppName): string {
  const prefix = `${(env[0] ?? 'X').toUpperCase()}${APPS[app].label}`;
  let max = 0;
  for (const key of scan(dir)) {
    const matched = /^([A-Z]+)(\d+)$/.exec(key.label);
    if (matched && matched[1] === prefix) {
      max = Math.max(max, Number(matched[2]));
    }
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

/** 컨테이너 안에서 이 키를 가리키는 설정 경로. 이미지의 ENV 가 이 값을 갖고 있다. */
const KEY_DIR_SETTING: Record<AppName, string> = {
  api: 'auth.jwt.keyDir (AUTH_JWT_KEY_DIR)',
  admin: 'admin.jwt.keyDir (ADMIN_JWT_KEY_DIR)',
};

function printNextSteps(app: AppName): void {
  console.log('다음:');
  console.log('  1) sh env-encrypt.sh        # .key → .key.enc (커밋 대상)');
  console.log(`  2) ${KEY_DIR_SETTING[app]} 가 컨테이너 안 경로를 가리키는지 확인`);
  console.log('     (운영은 이미지 ENV 에 박혀 있다. 로컬만 config.<환경>.local.yaml 에 적는다)');
}

export function jwtCommand(source: ConfigSource): Command {
  const jwt = new Command('jwt').description('access token 서명 키 관리 (ES256, 파일 기반)');

  addExamples(
    jwt
      .command('gen')
      .description('새 서명 키페어 생성 → <번호>_<alg>.key (활성)')
      .option('--alg <alg>', ALGS.join(' | '), 'ES256')
      .option('--app <app>', Object.keys(APPS).join(' | '), 'api')
      .option('--name <name>', '파일 이름(라벨). 기본은 환경 머리글자 + 다음 번호(D001)')
      .action((opts: { alg: string; app: string; name?: string }) => {
        const alg = assertAlg(opts.alg);
        const app = assertApp(opts.app);
        const dir = keyDir(source, app);
        mkdirSync(dir, { recursive: true });
        const actives = scan(dir).filter((k) => k.role === 'active');
        if (actives.length > 0) {
          console.warn(
            `⚠ 이미 활성 키가 있다(${actives.map((k) => k.kid).join(', ')}). 교체하려면 'jwt rotate' 를 써라.`,
          );
        }
        const key = generateAccessKeyPair(alg);
        const name = opts.name ?? nextKeyName(dir, source.env, app);
        const file = join(dir, `${name}_${key.alg}.key`);
        writeFileSync(file, key.privatePem, { mode: 0o600 });
        console.log(`생성: ${file}`);
        console.log(`kid : ${key.kid}   alg: ${key.alg}   (kid 는 내용에서 계산한다)`);
        printNextSteps(app);
      }),
    ['hansapp-cli jwt gen --env develop', 'hansapp-cli jwt gen --env develop --app admin'],
  );

  addExamples(
    jwt
      .command('list')
      .description('키 디렉터리의 키 나열(kid·alg·역할)')
      .option('--app <app>', Object.keys(APPS).join(' | '), 'api')
      .action((opts: { app: string }) => {
        const dir = keyDir(source, assertApp(opts.app));
        const keys = scan(dir);
        if (keys.length === 0) {
          console.log(`(키 없음) ${dir}  — 'jwt gen' 또는 env-decrypt.sh 먼저`);
          return;
        }
        /*
          **파일명과 kid 가 다른 것은 정상이다.** 파일명은 사람이 세대를 세는 라벨(D001)이고
          kid 는 키 내용의 thumbprint 다 — 로드할 때 다시 계산하므로 파일명은 아무 데도 안 쓰인다.
          예전에는 둘이 다르면 경고를 찍었는데, 이 레포의 모든 키가 늘 그 상태라 경고가
          늘 떠 있었다. 늘 뜨는 경고는 아무도 안 본다.
        */
        for (const k of keys) {
          console.log(
            `${k.role.padEnd(7)} ${k.label.padEnd(6)} kid=${k.kid}  alg=${k.alg}  ${k.file}`,
          );
        }
      }),
    ['hansapp-cli jwt list --env develop --app admin'],
  );

  addExamples(
    jwt
      .command('rotate')
      .description('새 키 활성화 + 기존 활성 키를 retired 공개키로 강등')
      .option('--alg <alg>', ALGS.join(' | '), 'ES256')
      .option('--app <app>', Object.keys(APPS).join(' | '), 'api')
      .option('--name <name>', '새 키의 파일 이름(라벨). 기본은 다음 번호')
      .action((opts: { alg: string; app: string; name?: string }) => {
        const alg = assertAlg(opts.alg);
        const app = assertApp(opts.app);
        const dir = keyDir(source, app);
        mkdirSync(dir, { recursive: true });
        const actives = scan(dir).filter((k) => k.role === 'active');

        const key = generateAccessKeyPair(alg);
        const label = opts.name ?? nextKeyName(dir, source.env, app);
        const newFile = join(dir, `${label}_${key.alg}.key`);
        writeFileSync(newFile, key.privatePem, { mode: 0o600 });
        console.log(`새 활성 키: ${newFile}  (kid=${key.kid})`);

        const retiredDir = join(dir, 'retired');
        mkdirSync(retiredDir, { recursive: true });
        for (const old of actives) {
          const pubPem = publicPemFromPem(readFileSync(old.file, 'utf8'), true);
          // **퇴역해도 이름은 그대로 둔다.** 라벨이 바뀌면 이력에서 같은 키를 못 알아본다.
          const pubFile = join(retiredDir, `${old.label}_${old.alg}.pub`);
          writeFileSync(pubFile, pubPem);
          rmSync(old.file);
          console.log(
            `retired: ${old.file} → ${pubFile}  (개인키 삭제; 암호화본은 git 이력에 남음)`,
          );
        }
        console.log(
          '다음: sh env-encrypt.sh 로 새 키 암호화·커밋 → overlap(access TTL) 경과 후 retired/*.pub 정리·재시작',
        );
      }),
    ['hansapp-cli jwt rotate --env develop --app admin'],
  );

  return jwt;
}
