import { Injectable } from '@nestjs/common';
import type { SubjectInfoItem } from '@krdata/hira';

import { toKrDataEnvelope } from '../common/krdata-envelope';
import { HiraSubjectRepository } from './hira-subject.repository';

/**
 * HIRA 병원의 진료과목 조회.
 *
 * item 은 원본 API(getSubjectInfo)와 같은 필드명을 쓴다. 매핑 자체는 역조회(~94콜)로 만들었고,
 * 원본 단건 API(79,739콜)가 추가로 주는 것은 과목별 전문의수(dgsbjtPrSdrCnt) 하나뿐이다.
 * 아직 받지 않았으므로 그 필드는 비어 있다.
 */
@Injectable()
export class HiraSubjectService {
  constructor(private readonly repo: HiraSubjectRepository) {}

  async listByHospital(ykiho: string) {
    const rows = await this.repo.listByHospital(ykiho);

    const items: SubjectInfoItem[] = rows.map((row) => ({
      dgsbjtCd: row.dgsbjtCd,
      dgsbjtCdNm: row.dgsbjtNm ?? undefined,
      dgsbjtPrSdrCnt: row.sdrCnt ?? undefined,
      cdiagDrCnt: row.cdiagCnt ?? undefined,
    }));

    return toKrDataEnvelope({
      items,
      pageNo: 1,
      numOfRows: items.length,
      totalCount: items.length,
    });
  }
}
