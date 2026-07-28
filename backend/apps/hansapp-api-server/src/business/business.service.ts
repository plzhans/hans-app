import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { NtsClient, NtsError } from '@kr-go/nts';
import type { BusinessStatus } from '@kr-go/nts';

import { BusinessStatusDto, BusinessVerificationDto } from './dto/business.dto';

/** 진위확인 명령. 컨트롤러가 경로(bno)와 본문 DTO 에서 뽑아 넘긴다. */
export interface VerifyBusinessCommand {
  bno: string;
  startDate: string;
  name: string;
  name2?: string;
  companyName?: string;
  corpNo?: string;
  address?: string;
}

/** 요청한 값이 잘못됐다고 국세청이 판정하는 status_code 들 → 400 으로 돌린다. */
const CLIENT_ERROR_CODES = new Set([
  'TOO_LARGE_REQUEST',
  'BAD_JSON_REQUEST',
  'REQUEST_DATA_MALFORMED',
]);

/**
 * 사업자등록 진위확인·상태조회 서비스.
 *
 * **이 서버에서 유일하게 외부 API(국세청)를 실시간으로 호출하는 곳이다.** 나머지 API 는 전부
 * 로컬 DB 미러를 읽는다. 진위확인은 캐싱할 수 없는(입력마다 다른) 실시간 조회라 예외로 둔다.
 * 국세청 원본 응답을 우리 DTO 로 변환해서 돌려준다 — snake_case·코드값을 그대로 노출하지 않는다.
 */
@Injectable()
export class BusinessService {
  constructor(private readonly nts: NtsClient) {}

  /** 사업자번호로 상태(계속/휴업/폐업)·과세유형을 조회한다. */
  async getStatus(bno: string): Promise<BusinessStatusDto> {
    const item = await this.call(() => this.nts.getStatusOne(bno));
    // 국세청은 요청한 번호마다 항목을 준다(미등록이어도). 없으면 우리 매핑이 어긋난 것이다.
    return toStatusDto(item ?? { b_no: bno });
  }

  /** 사업자번호+개업일자+대표자성명이 국세청 등록정보와 일치하는지 확인한다. */
  async verify(
    command: VerifyBusinessCommand,
  ): Promise<BusinessVerificationDto> {
    const result = await this.call(() =>
      this.nts.validateOne({
        b_no: command.bno,
        start_dt: command.startDate,
        p_nm: command.name,
        p_nm2: command.name2,
        b_nm: command.companyName,
        corp_no: command.corpNo,
        b_adr: command.address,
      }),
    );

    return {
      bno: command.bno,
      valid: result?.valid === '01',
      message: result?.valid_msg || undefined,
      status: result?.status ? toStatusDto(result.status) : undefined,
    };
  }

  /**
   * 국세청 호출을 감싸 NtsError 를 HTTP 예외로 바꾼다.
   * - 입력 문제(TOO_LARGE_REQUEST 등) → 400
   * - 그 외(점검·5xx·네트워크) → 503. 국세청 점검 중이면 여기로 온다.
   */
  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof NtsError) {
        if (CLIENT_ERROR_CODES.has(error.errorCode)) {
          throw new BadRequestException(
            `Invalid business lookup request (${error.errorCode}).`,
          );
        }
        throw new ServiceUnavailableException(
          'The NTS business registration service is temporarily unavailable.',
        );
      }
      throw error;
    }
  }
}

/** 국세청 상태 항목(snake_case)을 우리 DTO 로 변환한다. 빈 문자열은 undefined 로 접는다. */
function toStatusDto(s: BusinessStatus): BusinessStatusDto {
  return {
    bno: s.b_no ?? '',
    registered: Boolean(s.b_stt_cd && s.b_stt_cd.trim()),
    statusCode: blankToUndef(s.b_stt_cd),
    status: blankToUndef(s.b_stt),
    taxTypeCode: blankToUndef(s.tax_type_cd),
    taxType: blankToUndef(s.tax_type),
    closedAt: blankToUndef(s.end_dt),
  };
}

function blankToUndef(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
