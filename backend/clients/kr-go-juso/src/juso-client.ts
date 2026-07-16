import { searchEngAddress } from './generated/juso';
import type { AddrEng, AddrEngResults } from './generated/model';
import { JusoConfig } from './http';
import { withJusoConfig } from './mutator';

/** 한 페이지에 받을 수 있는 최대 건수. 넘기면 100 으로 잘린다. */
const MAX_COUNT_PER_PAGE = 100;

export interface SearchAddressParams {
  /** 현재 페이지 번호. 1 부터. 기본 1. */
  currentPage?: number;
  /** 페이지당 결과 수. 1~100. 기본 10. */
  countPerPage?: number;
}

/**
 * 도로명주소 개발자센터(business.juso.go.kr) 영문주소 검색 클라이언트.
 *
 * API 응답을 그대로 반환한다. 필드명도 원본 그대로다(roadAddr/korAddr). 값 정규화·표기 정제는
 * **하지 않는다** — 원본이 뭐였는지를 호출부가 알 수 있어야 한다.
 * errorCode 가 '0' 이 아니면 mutator 가 JusoError 로 바꿔 던지므로, 성공 응답만 여기로 온다.
 *
 * 예외는 listAllAddresses 하나다. 페이지네이션만 대신 돌려준다(값은 안 건드린다).
 */
export class JusoClient {
  constructor(private readonly config: JusoConfig) {}

  /**
   * 한글 검색어로 영문주소를 한 페이지 조회한다.
   *
   * 결과가 없어도 에러가 아니다 — common.errorCode 는 '0', juso 는 null/빈 배열로 온다.
   */
  async searchAddresses(
    keyword: string,
    params: SearchAddressParams = {},
  ): Promise<AddrEngResults> {
    const { data } = await searchEngAddress(
      {
        keyword,
        currentPage: params.currentPage ?? 1,
        countPerPage: params.countPerPage ?? 10,
      },
      withJusoConfig(this.config),
    );

    // 봉투는 언제나 results 다. 없으면 mutator 가 이미 예외를 던졌어야 한다.
    return data.results ?? {};
  }

  /**
   * 검색어에 매칭되는 주소를 전량 가져온다.
   *
   * **9,000 건이 넘는 검색은 API 가 E0015 로 막는다.** 넓은 검색어를 전량 순회하지 마라 —
   * 병원명·상세주소처럼 결과가 적은 검색어에 쓰는 용도다.
   */
  async listAllAddresses(keyword: string): Promise<AddrEng[]> {
    const addresses: AddrEng[] = [];

    for (let page = 1; ; page += 1) {
      const results = await this.searchAddresses(keyword, {
        currentPage: page,
        countPerPage: MAX_COUNT_PER_PAGE,
      });

      const rows = results.juso ?? [];
      addresses.push(...rows);

      const total = Number(results.common?.totalCount ?? 0);
      // 받은 게 없으면(빈 결과) 총건수와 무관하게 멈춘다. 안 그러면 무한루프다.
      if (rows.length === 0 || addresses.length >= total) {
        return addresses;
      }
    }
  }
}
