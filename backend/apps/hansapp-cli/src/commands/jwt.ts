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
} from '@hansapp/auth-application';

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

function keyDir(source: ConfigSource): string {
  return join('config', source.env, 'jwt');
}

function assertAlg(alg: string): AccessAlg {
  if (!(ALGS as string[]).includes(alg)) {
    throw new Error(`Unknown alg: ${alg} (${ALGS.join(' | ')})`);
  }
  return alg as AccessAlg;
}

interface KeyInfo {
  file: string;
  kid: string;
  alg: string;
  role: 'active' | 'retired';
  match: boolean;
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
      const nameKid = sep > 0 ? stem.slice(0, sep) : stem;
      const alg = sep > 0 ? stem.slice(sep + 1) : '?';
      let kid = '?';
      try {
        kid = jwkThumbprint(publicJwkFromPem(readFileSync(join(d, f), 'utf8'), isPrivate));
      } catch {
        // 파싱 실패는 kid='?' 로 표시만 하고 넘어간다.
      }
      out.push({ file: join(d, f), kid, alg, role, match: kid === nameKid });
    }
  };
  read(dir, '.key', 'active', true);
  read(join(dir, 'retired'), '.pub', 'retired', false);
  return out;
}

function printNextSteps(dir: string): void {
  console.log('다음:');
  console.log('  1) sh env-encrypt.sh                 # .key → .key.enc (커밋 대상)');
  console.log(`  2) env: AUTH_JWT_KEY_DIR=${dir}  (+ AUTH_ISSUER)`);
}

export function jwtCommand(source: ConfigSource): Command {
  const jwt = new Command('jwt').description('access token 서명 키 관리 (ES256, 파일 기반)');

  addExamples(
    jwt
      .command('gen')
      .description('새 서명 키페어 생성 → <kid>_<alg>.key (활성)')
      .option('--alg <alg>', ALGS.join(' | '), 'ES256')
      .action((opts: { alg: string }) => {
        const alg = assertAlg(opts.alg);
        const dir = keyDir(source);
        mkdirSync(dir, { recursive: true });
        const actives = scan(dir).filter((k) => k.role === 'active');
        if (actives.length > 0) {
          console.warn(
            `⚠ 이미 활성 키가 있다(${actives.map((k) => k.kid).join(', ')}). 교체하려면 'jwt rotate' 를 써라.`,
          );
        }
        const key = generateAccessKeyPair(alg);
        const file = join(dir, `${key.kid}_${key.alg}.key`);
        writeFileSync(file, key.privatePem, { mode: 0o600 });
        console.log(`생성: ${file}`);
        console.log(`kid : ${key.kid}   alg: ${key.alg}`);
        printNextSteps(dir);
      }),
    ['hansapp-cli jwt gen --env develop'],
  );

  addExamples(
    jwt
      .command('list')
      .description('키 디렉터리의 키 나열(kid·alg·역할)')
      .action(() => {
        const dir = keyDir(source);
        const keys = scan(dir);
        if (keys.length === 0) {
          console.log(`(키 없음) ${dir}  — 'jwt gen' 또는 env-decrypt.sh 먼저`);
          return;
        }
        for (const k of keys) {
          const flag = k.match ? '' : '   [!] 파일명 kid ≠ thumbprint';
          console.log(`${k.role.padEnd(7)} kid=${k.kid}  alg=${k.alg}  ${k.file}${flag}`);
        }
      }),
    ['hansapp-cli jwt list --env develop'],
  );

  addExamples(
    jwt
      .command('rotate')
      .description('새 키 활성화 + 기존 활성 키를 retired 공개키로 강등')
      .option('--alg <alg>', ALGS.join(' | '), 'ES256')
      .action((opts: { alg: string }) => {
        const alg = assertAlg(opts.alg);
        const dir = keyDir(source);
        mkdirSync(dir, { recursive: true });
        const actives = scan(dir).filter((k) => k.role === 'active');

        const key = generateAccessKeyPair(alg);
        const newFile = join(dir, `${key.kid}_${key.alg}.key`);
        writeFileSync(newFile, key.privatePem, { mode: 0o600 });
        console.log(`새 활성 키: ${newFile}  (kid=${key.kid})`);

        const retiredDir = join(dir, 'retired');
        mkdirSync(retiredDir, { recursive: true });
        for (const old of actives) {
          const pubPem = publicPemFromPem(readFileSync(old.file, 'utf8'), true);
          const pubFile = join(retiredDir, `${old.kid}_${old.alg}.pub`);
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
    ['hansapp-cli jwt rotate --env develop'],
  );

  return jwt;
}
