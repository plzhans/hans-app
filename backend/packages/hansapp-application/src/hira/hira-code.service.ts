import { Injectable } from '@nestjs/common';

import { toKrDataEnvelope } from '../common/krdata-envelope';
import { HiraCodeRepository } from './hira-code.repository';
import {
  HIRA_CODE_TYPE_DEFS,
  type HiraCodeResponse,
  type HiraCodeType,
} from './hira-code.types';

export interface HiraCodeListCommand {
  /** 코드 종류. 원본이 엔드포인트로 갈라 놓은 것을 우리는 이 파라미터로 받는다. */
  tp: HiraCodeType;
  page: number;
  size: number;
}

/**
 * HIRA 코드 조회 유스케이스. 로컬 DB(hira_code)만 읽는다.
 *
 * 저장은 tp/cd/cd_nm/cd_cmt 로 통일해 두고, 응답은 **원본 API 와 같은 필드명**으로 되돌린다.
 * (tp=class → clCd/clCdNm, tp=subject → dgsbjtCd/dgsbjtCdNm/dgsbjtCdCmmt)
 * 그래서 엔드포인트는 하나지만 응답 구조는 원본과 구분되지 않는다.
 */
@Injectable()
export class HiraCodeService {
  constructor(private readonly repo: HiraCodeRepository) {}

  async listCodes(command: HiraCodeListCommand): Promise<HiraCodeResponse> {
    const [rows, totalCount] = await Promise.all([
      this.repo.list(command.tp, command.page, command.size),
      this.repo.count(command.tp),
    ]);

    const { toItem } = HIRA_CODE_TYPE_DEFS[command.tp];

    // item 타입은 tp 로 런타임에 갈리므로(AddressCodeItem | ... ) 봉투를 합집합으로 되돌린다.
    // 필드명 자체는 HIRA_CODE_TYPE_DEFS 의 toItem 에서 생성 타입으로 검증된다.
    return toKrDataEnvelope({
      items: rows.map(toItem),
      pageNo: command.page,
      numOfRows: command.size,
      totalCount,
    }) as HiraCodeResponse;
  }
}
