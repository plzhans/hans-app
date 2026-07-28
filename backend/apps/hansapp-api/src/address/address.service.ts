import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { JusoClient, JusoError } from '@kr-go/juso';
import type { AddrEng } from '@kr-go/juso';
import { Page } from '@hansapp/common';

import { AddressDto } from './dto/address.dto';

/** 주소 검색 명령. 컨트롤러가 DTO 에서 뽑아 넘긴다. */
export interface AddressSearchCommand {
  keyword: string;
  page: number;
  size: number;
}

/**
 * 검색어가 잘못됐다고 도로명주소 API 가 판정하는 errorCode 들 → 400 으로 돌린다.
 * (시도명 단독·너무 짧음·숫자만·특수문자·9천건 초과 등)
 */
const INPUT_ERROR_CODES = new Set([
  'E0005',
  'E0006',
  'E0008',
  'E0009',
  'E0010',
  'E0011',
  'E0012',
  'E0013',
  'E0015',
]);

/**
 * 주소 영문 번역 서비스.
 *
 * 도로명주소 개발자센터(juso.go.kr)를 조회한다. **국세청 API 와 함께 이 서버에서 외부 API 를
 * 직접 호출하는 소수의 API 중 하나다.** 원본 응답(snake_case·영문/한글 혼재)을 우리 DTO 로
 * 변환해서 돌려준다.
 */
@Injectable()
export class AddressService {
  constructor(private readonly juso: JusoClient) {}

  /** 한글 검색어로 영문 주소를 검색한다. 결과가 없으면 빈 페이지를 돌려준다. */
  async search(command: AddressSearchCommand): Promise<Page<AddressDto>> {
    const results = await this.call(() =>
      this.juso.searchAddresses(command.keyword, {
        currentPage: command.page,
        countPerPage: command.size,
      }),
    );

    const items = (results.juso ?? []).map(toAddressDto);
    const totalCount = Number(results.common?.totalCount);

    return new Page(
      items,
      command.page,
      command.size,
      Number.isFinite(totalCount) ? totalCount : items.length,
    );
  }

  /**
   * 도로명주소 호출을 감싸 JusoError 를 HTTP 예외로 바꾼다.
   * - 검색어 문제(너무 짧음·시도명 단독 등) → 400
   * - 그 외(승인키·시스템·네트워크) → 503
   */
  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof JusoError) {
        if (INPUT_ERROR_CODES.has(error.errorCode)) {
          throw new BadRequestException(
            error.message || 'Invalid search keyword.',
          );
        }
        throw new ServiceUnavailableException(
          'The address search service is temporarily unavailable.',
        );
      }
      throw error;
    }
  }
}

/** 도로명주소 항목(snake_case)을 우리 DTO 로 변환한다. 빈 문자열은 undefined 로 접는다. */
function toAddressDto(a: AddrEng): AddressDto {
  return {
    korAddr: a.korAddr ?? '',
    roadAddr: a.roadAddr ?? '',
    jibunAddr: blankToUndef(a.jibunAddr),
    zipNo: blankToUndef(a.zipNo),
    sido: blankToUndef(a.siNm),
    sigungu: blankToUndef(a.sggNm),
    eupmyeondong: blankToUndef(a.emdNm),
    roadName: blankToUndef(a.rn),
  };
}

function blankToUndef(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
