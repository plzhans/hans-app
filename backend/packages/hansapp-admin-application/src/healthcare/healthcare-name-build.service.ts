import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@hansapp/data';
import { splitHospitalName } from '@hansapp/data/seed';

import { HospitalLocks } from './hospital-lock';
import {
  HealthcareNameBuildRepository,
  type NameUpdate,
} from './healthcare-name-build.repository';

export interface NameBuildResult {
  /** 검사한 행 수 */
  scanned: number;
  /** 실제로 바뀐 행 수 */
  changed: number;
  /** 법인명까지 갈라낸 행 수 */
  withCorp: number;
  /** 잠겨 있어 건너뛴 행 수 */
  locked: number;
  /** true 면 아무것도 쓰지 않았다 */
  dryRun: boolean;
  /** 바뀐 것 중 앞부분 몇 개 (눈으로 확인용) */
  samples: { id: number; before: string; after: string; corp: string | null }[];
  elapsedMs: number;
}

const SAMPLE_LIMIT = 20;

/**
 * 병원 이름 재계산. **legal_name 만 읽어 name·corp_name 을 다시 만든다.**
 *
 * 통합 빌드(healthcare build)도 같은 일을 하지만, 그건 원본 미러를 통째로 다시 읽어
 * 하위 테이블까지 만드느라 5분이 걸린다. 접미어 목록을 손볼 때마다 그걸 돌릴 수는 없다.
 * 이 명령은 이미 DB 에 있는 legal_name 만 보므로 미러가 없어도 돌고 몇 초면 끝난다.
 *
 * **원문을 건드리지 않는다.** legal_name 은 읽기만 한다 — 그래서 몇 번을 돌려도 결과가
 * 같고(멱등), 규칙이 잘못됐으면 규칙을 고쳐 다시 돌리면 된다. 되돌릴 원본이 항상 있다.
 *
 * 잠긴 병원(healthcare_hospital_lock, field='name')은 건너뛴다. 사람이 고친 이름을
 * 규칙이 덮으면 안 된다 — 빌드와 같은 규약이다.
 */
@Injectable()
export class HealthcareNameBuildService {
  private readonly logger = new Logger(HealthcareNameBuildService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: HealthcareNameBuildRepository,
  ) {}

  async run(options: { dryRun?: boolean } = {}): Promise<NameBuildResult> {
    const startedAt = Date.now();
    const dryRun = options.dryRun ?? false;

    const locks = await HospitalLocks.load(this.prisma);
    const lockedIds = locks.lockedHospitalsFor('healthcare_hospital', 'name');

    const rows = await this.repo.loadAll();

    const samples: NameBuildResult['samples'] = [];
    const updates: NameUpdate[] = [];
    let withCorp = 0;
    let locked = 0;

    for (const row of rows) {
      if (lockedIds.has(row.id)) {
        locked += 1;
        continue;
      }

      const parts = splitHospitalName(row.legalName);
      if (parts.corpName) {
        withCorp += 1;
      }

      // 값이 같으면 UPDATE 를 만들지 않는다. 8만 행을 매번 쓰면 updated_at 이 전부
      // 갱신되어 "이번에 무엇이 실제로 바뀌었나" 를 알 수 없게 된다.
      if (parts.name === row.name && parts.corpName === row.corpName) {
        continue;
      }

      updates.push({ id: row.id, name: parts.name, corpName: parts.corpName });
      if (samples.length < SAMPLE_LIMIT) {
        samples.push({
          id: row.id,
          before: row.name,
          after: parts.name,
          corp: parts.corpName,
        });
      }
    }

    if (!dryRun && updates.length > 0) {
      await this.repo.apply(updates);
    }

    const result: NameBuildResult = {
      scanned: rows.length,
      changed: updates.length,
      withCorp,
      locked,
      dryRun,
      samples,
      elapsedMs: Date.now() - startedAt,
    };

    this.logger.log(
      `이름 재계산${dryRun ? ' (dry-run)' : ''} — 검사 ${result.scanned.toLocaleString()} / ` +
        `변경 ${result.changed.toLocaleString()} / 법인 ${result.withCorp.toLocaleString()} / ` +
        `잠금 ${result.locked.toLocaleString()}`,
    );

    return result;
  }
}
