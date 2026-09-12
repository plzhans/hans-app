import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { Injectable, Logger } from '@nestjs/common';

import { InjectConfig, type MedifinderConfig } from '../config';
import { outputDir } from '../sitemap/output-dir';
import { MANIFEST_FILE, fetchDeployedManifest } from '../sitemap/sitemap-manifest';

/**
 * wrangler 버전. 프론트(frontend/ci-deploy.sh)와 같은 메이저를 쓴다.
 * 둘이 갈리면 같은 계정에 서로 다른 도구가 배포하게 된다.
 */
const WRANGLER_VERSION = '4';

/**
 * 런타임 동작 기준일. **값이 필요해서 적는 것이지 고를 여지가 있어서가 아니다.**
 *
 * wrangler 가 업로드에 이 값을 요구한다. 이 워커에는 코드가 없고 정적 자산만 있어서
 * 런타임 동작이 달라질 자리가 없지만, 없으면 배포 자체가 거부된다.
 *
 * medifinder-web(wrangler.jsonc)과 같은 날짜로 둔다. 한 사이트를 이루는 두 워커가 서로
 * 다른 기준일을 갖고 있으면, 나중에 코드가 생겼을 때 어느 쪽이 무슨 동작인지 헷갈린다.
 */
const COMPATIBILITY_DATE = '2026-09-08';

/** 워커 이름의 환경 약칭. frontend/ci-lib.sh 의 env_short 와 같은 표다. */
const ENV_SHORT: Record<string, string> = { develop: 'dev', production: 'prod' };

/**
 * 사이트맵을 Cloudflare Workers 로 올린다.
 *
 * **정적 자산만 있는 워커다** — 코드가 없다. `--assets` 로 준 디렉터리가 그대로 경로가
 * 되므로 `sitemap.xml` 이 루트에서 뜬다. R2 를 쓰면 버킷·액세스 키가 새로 필요하고
 * 웹 워커에 바인딩과 분기를 넣어야 하는데, 이쪽은 그게 전부 없다.
 *
 * 자격증명(CLOUDFLARE_API_TOKEN)은 우리가 읽지 않는다 — wrangler 가 환경변수에서 직접
 * 가져간다. 우리 손을 거치면 로그에 흘릴 자리가 하나 더 생긴다.
 */
@Injectable()
export class WorkerDeployService {
  private readonly logger = new Logger(WorkerDeployService.name);

  constructor(@InjectConfig() private readonly config: MedifinderConfig) {}

  /** `<환경약칭>-medifinder-sitemap`. 프론트의 워커 이름 규칙과 같다. */
  workerName(): string {
    const short = ENV_SHORT[this.config.appEnv] ?? this.config.appEnv;
    return `${short}-medifinder-sitemap`;
  }

  /**
   * 지금 만든 것이 이미 올라가 있는 것과 같은지 본다.
   *
   * 산출물이 결정적이라(내용이 같으면 바이트도 같다) 지문 하나로 판정된다. 읽지 못하면
   * undefined 를 받고 그냥 올린다 — 판단이 안 서면 올리는 쪽이 안전하다.
   */
  async isUnchanged(dir: string): Promise<boolean> {
    const local = await readFile(
      path.join(outputDir(dir, this.config.appEnv), MANIFEST_FILE),
      'utf8',
    )
      .then((raw: string) => JSON.parse(raw) as { digest?: string })
      .catch(() => undefined);
    if (!local?.digest) return false;

    const deployed = await fetchDeployedManifest(this.config.siteUrl);
    if (!deployed) {
      this.logger.log('배포된 매니페스트를 읽지 못했다. 비교 없이 올린다');
      return false;
    }
    return deployed.digest === local.digest;
  }

  async deploy(dir: string): Promise<string> {
    const assets = outputDir(dir, this.config.appEnv);
    const name = this.workerName();

    if (!process.env.CLOUDFLARE_API_TOKEN) {
      throw new Error('CLOUDFLARE_API_TOKEN is required to deploy.');
    }

    this.logger.log(`${name} ← ${assets}`);
    await this.run([
      // --allow-build 가 없으면 pnpm 이 빌드 스크립트 실행을 대화형으로 묻고 거기서 멈춘다.
      // dlx 는 임시 스토어를 쓰므로 워크스페이스의 allowBuilds 설정이 닿지 않는다.
      '--allow-build=esbuild,workerd',
      'dlx',
      `wrangler@${WRANGLER_VERSION}`,
      'deploy',
      '--name',
      name,
      '--assets',
      assets,
      '--compatibility-date',
      COMPATIBILITY_DATE,
    ]);

    return name;
  }

  /** wrangler 출력을 그대로 흘려보낸다 — 실패 원인이 거기 적혀 있다. */
  private run(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn('pnpm', args, {
        stdio: ['ignore', 'inherit', 'inherit'],
        env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' },
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`wrangler deploy exited with code ${String(code)}.`));
      });
    });
  }
}
