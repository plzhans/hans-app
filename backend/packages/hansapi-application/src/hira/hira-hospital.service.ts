import { Injectable } from '@nestjs/common';
import { PrismaService } from '@hansapi/data';

import type {
  ClinicTop5Item,
  ClinicTop5Response,
  HospitalItem,
  HospitalListResponse,
  NonPaymentDetailItem,
  NonPaymentDetailResponse,
} from '@krdata/hira';

import { toKrDataEnvelope } from '../common/krdata-envelope';
import { MirrorListCommand } from '../common/mirror.result';

/**
 * HIRA 원본 미러 조회.
 *
 * **원본 API 와 똑같은 구조로 응답한다.** DB 의 JSON 이 곧 원본 item 이므로,
 * 그것을 item 타입으로 읽어 원본 봉투에 담아 돌려준다.
 *
 * 통합 병원 조회는 여기가 아니라 HealthcareHospitalService 다 — 그쪽은 우리 스키마로,
 * 여기는 원본 그대로. 두 관심사를 한 서비스에 섞지 않는다.
 */
@Injectable()
export class HiraHospitalService {
  constructor(private readonly prisma: PrismaService) {}

  async listHospitals(
    command: MirrorListCommand,
  ): Promise<HospitalListResponse> {
    const [rows, totalCount] = await Promise.all([
      this.prisma.hira_hospital.findMany({
        orderBy: { ykiho: 'asc' },
        skip: (command.page - 1) * command.size,
        take: command.size,
      }),
      this.prisma.hira_hospital.count(),
    ]);

    return toKrDataEnvelope<HospitalItem>({
      items: rows.map((row) => row.data as HospitalItem),
      pageNo: command.page,
      numOfRows: command.size,
      totalCount,
    });
  }

  /** 1건 조회. 없으면 items 가 빈 배열이고 totalCount 가 0 이다 (원본 API 와 같은 규칙). */
  async getHospital(ykiho: string): Promise<HospitalListResponse> {
    const row = await this.prisma.hira_hospital.findUnique({
      where: { ykiho },
    });

    return toKrDataEnvelope<HospitalItem>({
      items: row ? [row.data as HospitalItem] : [],
      pageNo: 1,
      numOfRows: row ? 1 : 0,
      totalCount: row ? 1 : 0,
    });
  }

  /**
   * 기관별 비급여 진료비.
   *
   * **한 기관에 수백 행이다**(인천세종병원 459건). 그래서 1건 조회(getHospital)가 아니라
   * 목록 조회(listHospitals)와 같은 페이지 봉투다.
   *
   * **병원급 이상만 있다.** 의원(clCd=31)은 원본 API 에 통째로 없어서 늘 빈 배열이다 —
   * 없는 게 오류가 아니므로 404 를 만들지 않는다(원본 API 와 같은 규칙).
   *
   * 정렬은 sno 다. 원본이 매긴 순번이고 연속이 아니지만(1, 7, 8 …), 그 순서가 곧 병원이
   * 신고한 게시 순서라 화면에 그대로 쓸 수 있다.
   */
  async getNonPayments(
    ykiho: string,
    command: MirrorListCommand,
  ): Promise<NonPaymentDetailResponse> {
    const [rows, totalCount] = await Promise.all([
      this.prisma.hira_hospital_npay.findMany({
        where: { ykiho },
        orderBy: { sno: 'asc' },
        skip: (command.page - 1) * command.size,
        take: command.size,
      }),
      this.prisma.hira_hospital_npay.count({ where: { ykiho } }),
    ]);

    return toKrDataEnvelope<NonPaymentDetailItem>({
      items: rows.map((row) => row.data as NonPaymentDetailItem),
      pageNo: command.page,
      numOfRows: command.size,
      totalCount,
    });
  }

  /**
   * 의원 진료 상위질병 5개.
   *
   * **적재를 돌리지 않으므로 사실상 늘 빈 배열이다.** 원본을 신뢰할 수 없어 top5 를
   * HIRA_EXTRA_OPS 에서 뺐다(근거: clients/README.md). 과거에 받아둔 행이 남아 있으면
   * 그것만 나온다. 라우트는 원본이 정상화될 때를 위해 남겨둔 것이다.
   *
   * **의원(clCd=31) 전용이라 없는 게 정상인 경우가 많다.** 의원이 아니거나, 적재된 적이
   * 없거나, 원본이 0건이거나 — 셋 다 items 가 빈 배열이다. 원본 API 도 없는 것을
   * 오류로 주지 않으므로 여기서도 404 를 만들지 않는다.
   */
  async getClinicTop5(ykiho: string): Promise<ClinicTop5Response> {
    const row = await this.prisma.hira_hospital_detail.findUnique({
      where: { ykiho_op: { ykiho, op: 'top5' } },
    });

    // 적재는 0건 응답도 행으로 남긴다(재조회를 막으려고). 그때 data 는 객체가 아니라 []다.
    const item =
      row && !Array.isArray(row.data) ? (row.data as ClinicTop5Item) : null;

    return toKrDataEnvelope<ClinicTop5Item>({
      items: item ? [item] : [],
      pageNo: 1,
      numOfRows: item ? 1 : 0,
      totalCount: item ? 1 : 0,
    });
  }
}
