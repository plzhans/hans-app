import { Injectable, Logger } from '@nestjs/common';
import { HIRA_CODE_TYPES } from '@hansapp/application';
import { HIRA_CODES } from '@hansapp/data/seed';

import { HiraCodeSeedRepository } from './hira-code-seed.repository';

export interface HiraCodeSeedResult {
  seeded: number;

  /** 시드에서 빠져 지운 코드 수. */
  removed: number;
}

/**
 * HIRA 코드 시드 (hira_code 중 API 가 코드표를 안 주는 것).
 *
 * 시드 파일이 **유일한 원본**이다. 병원평가 항목(tp='asm01'~'asm09')이 여기 해당한다 —
 * API 는 asmGrd01 같은 필드명으로만 주고, 그게 급성기뇌졸중인지는 메뉴얼·홈페이지에만 있다.
 * tp 가 곧 그룹이다(급성질환·만성질환…). hira_code 의 tp → cd 2단 계층을 그대로 쓴다.
 *
 * **소유가 tp 로 갈린다.** sync(HiraCodeSyncService)가 HIRA_CODE_TYPES(6종)를 소유하고,
 * 시드는 **그 6종이 아닌 나머지 전부**를 소유한다. 서로의 행에 손대지 않는다.
 */
@Injectable()
export class HiraCodeSeedService {
  private readonly logger = new Logger(HiraCodeSeedService.name);

  constructor(private readonly repo: HiraCodeSeedRepository) {}

  async seed(): Promise<HiraCodeSeedResult> {
    await this.repo.upsertSeed(HIRA_CODES);

    const removed = await this.removeStale();

    return { seeded: HIRA_CODES.length, removed };
  }

  /**
   * 시드에서 빠진 코드를 지운다. 시드가 원본이므로 DB 에만 있는 코드는 유령이다.
   *
   * **소유 범위를 "sync 6종이 아닌 것" 으로 잡는다.** 시드에 있는 tp 목록으로 잡으면 안 된다 —
   * tp 이름을 바꾸거나 그룹을 없앤 순간 옛 tp 가 목록에서 빠져, 그 행들이 영영 안 지워지고
   * 유령으로 남는다(asm→asm01 로 바꿨을 때 실제로 그랬다). "우리 것이 아닌 건 sync 것뿐" 이
   * 진짜 불변식이다.
   *
   * 반대로 한정 자체를 빼면 sync 가 채운 6종이 시드에 없다는 이유로 전부 지워진다.
   */
  private async removeStale(): Promise<number> {
    const keep = new Set(HIRA_CODES.map((c) => `${c.tp}|${c.cd}`));

    const existing = await this.repo.findManagedCodes([...HIRA_CODE_TYPES]);
    const stale = existing.filter((row) => !keep.has(`${row.tp}|${row.cd}`));

    for (const row of stale) {
      await this.repo.deleteCode(row.tp, row.cd);
      this.logger.log(`Removed a code that is no longer in the seed: ${row.tp}/${row.cd}`);
    }

    return stale.length;
  }
}
