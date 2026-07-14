import { Injectable } from '@nestjs/common';
import { PrismaService } from '@hansapi/data';
import type { CodeInfoItem, CodeInfoResponse } from '@krdata/nmc';

import { toKrDataEnvelope } from '../common/krdata-envelope';

export interface NmcCodeListCommand {
  /** 대분류코드로 좁힌다. 원본 API 의 CM_MID 파라미터에 대응한다. */
  cmMid?: string;
  page: number;
  size: number;
}

/**
 * NMC 코드마스터 조회 유스케이스. 로컬 DB(nmc_code)만 읽는다.
 *
 * NMC 는 코드 체계가 하나뿐이라(cmMid/cmSid) 원본 필드명을 그대로 컬럼으로 쓴다.
 * 응답은 원본 API(CodeMast/info)와 같은 구조다.
 */
@Injectable()
export class NmcCodeService {
  constructor(private readonly prisma: PrismaService) {}

  async listCodes(command: NmcCodeListCommand): Promise<CodeInfoResponse> {
    const where = command.cmMid === undefined ? {} : { cm_mid: command.cmMid };

    const [rows, totalCount] = await Promise.all([
      this.prisma.nmc_code.findMany({
        where,
        orderBy: [{ cm_mid: 'asc' }, { cm_sid: 'asc' }],
        skip: (command.page - 1) * command.size,
        take: command.size,
      }),
      this.prisma.nmc_code.count({ where }),
    ]);

    // 필드명은 생성 타입으로 검증한다. 스펙이 바뀌면 여기서 컴파일 에러가 난다.
    const items: CodeInfoItem[] = rows.map((row) => ({
      cmMid: row.cm_mid,
      cmMnm: row.cm_mnm ?? undefined,
      cmSid: row.cm_sid,
      cmSnm: row.cm_snm ?? undefined,
    }));

    return toKrDataEnvelope({
      items,
      pageNo: command.page,
      numOfRows: command.size,
      totalCount,
    });
  }
}
