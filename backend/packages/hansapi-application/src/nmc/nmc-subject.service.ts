import { Injectable } from '@nestjs/common';

import { toKrDataEnvelope } from '../common/krdata-envelope';
import { NmcSubjectRepository } from './nmc-subject.repository';

/**
 * 병원의 진료과목 item.
 *
 * 원본에는 병원별 진료과목 API 가 따로 없다. basic 의 dgidIdName 이 쉼표로 이어 붙인
 * 과목명 문자열로 줄 뿐이다. 우리는 코드마스터(D000)의 코드로 정규화해 보관한다.
 */
export interface NmcSubjectItem {
  subjectCd: string;
  subjectNm?: string;
}

/**
 * NMC 병원의 진료과목 조회.
 *
 * 매핑은 병원 목록의 진료과목 필터(QD)를 과목별로 뒤집어 조회해 만들었다.
 * 병원별로 받으면 78,631콜인데 역조회는 ~50콜이다.
 */
@Injectable()
export class NmcSubjectService {
  constructor(private readonly repo: NmcSubjectRepository) {}

  async listByHospital(hpid: string) {
    const rows = await this.repo.listByHospital(hpid);

    const items: NmcSubjectItem[] = rows.map((row) => ({
      subjectCd: row.subjectCd,
      subjectNm: row.subjectNm ?? undefined,
    }));

    return toKrDataEnvelope({
      items,
      pageNo: 1,
      numOfRows: items.length,
      totalCount: items.length,
    });
  }
}
