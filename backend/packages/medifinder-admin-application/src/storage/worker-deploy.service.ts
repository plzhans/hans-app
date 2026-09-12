import { spawn } from 'node:child_process';

import { Injectable, Logger } from '@nestjs/common';

import { InjectConfig, type MedifinderConfig } from '../config';
import { outputDir } from '../sitemap/output-dir';

/**
 * wrangler 버전. 프론트(frontend/ci-deploy.sh)와 같은 메이저를 쓴다.
 * 둘이 갈리면 같은 계정에 서로 다른 도구가 배포하게 된다.
 */
const WRANGLER_VERSION = '4';

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
