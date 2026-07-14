import { searchStationsBySubwayLine } from './generated/subway';
import type { Station, StationListBody } from './generated/model';
import { SeoulDataConfig } from './http';
import { withSeoulDataConfig } from './mutator';

/**
 * 위치 기반 경로 파라미터를 건너뛸 때 넣는 값.
 *
 * 빈 문자열을 넣으면 세그먼트가 사라져 파라미터가 **한 칸씩 밀린다** — 호선 필터가
 * 역명 자리로 들어간다. 공식 예제도 공백 한 칸을 넣는다. fetch 가 %20 으로 인코딩한다.
 */
const SKIP = ' ';

/** 한 번에 받을 수 있는 최대 건수. 넘기면 ERROR-336. */
const MAX_PAGE_SIZE = 1000;

export interface SearchStationsParams {
  /** 요청 시작 위치. 1부터. */
  startIndex: number;
  /** 요청 종료 위치. startIndex 와의 간격이 1,000 을 넘으면 안 된다. */
  endIndex: number;

  /** 전철역코드 필터. 환승역은 노선마다 코드가 달라 역 식별자로는 못 쓴다. */
  stationCd?: string;
  /** 전철역명 필터. */
  stationNm?: string;
  /** 호선 필터. '1호선' / '신분당선'. */
  lineNum?: string;
}

/**
 * 서울열린데이터광장 지하철역 정보 클라이언트.
 *
 * API 응답을 그대로 반환한다. 필드명도 원본 그대로다(STATION_NM_JPN). 정제·dedup·표기 정규화는
 * **하지 않는다** — 그건 이 데이터를 사전으로 굽는 쪽(시드 생성 CLI)의 일이고, SDK 가 원본을
 * 손대기 시작하면 "원본이 뭐였는지" 를 아무도 모르게 된다.
 *
 * 예외는 listAllStations 하나다. 페이지네이션만 대신 돌려준다(값은 안 건드린다).
 */
export class SubwayClient {
  constructor(private readonly config: SeoulDataConfig) {}

  /** 역 목록 한 페이지. 필터를 주지 않은 자리는 공백으로 채운다. */
  async searchStations(params: SearchStationsParams): Promise<StationListBody> {
    const { data } = await searchStationsBySubwayLine(
      params.startIndex,
      params.endIndex,
      params.stationCd ?? SKIP,
      params.stationNm ?? SKIP,
      params.lineNum ?? SKIP,
      withSeoulDataConfig(this.config),
    );

    // 봉투는 언제나 서비스명이 키다. 없으면 mutator 가 이미 예외를 던졌어야 한다.
    return data.SearchSTNBySubwayLineInfo ?? {};
  }

  /**
   * 역을 전량 가져온다. (2026-07 기준 799건 — 1콜이면 끝나지만 늘어날 수 있다)
   *
   * **환승역은 노선마다 행이 따로 나온다.** 역 단위로 묶고 싶으면 STATION_NM 으로 dedup 하라.
   * 여기서 대신 해주지 않는다 — 어떤 호출부는 노선 정보가 필요하다.
   */
  async listAllStations(): Promise<Station[]> {
    const stations: Station[] = [];

    for (let start = 1; ; start += MAX_PAGE_SIZE) {
      const body = await this.searchStations({
        startIndex: start,
        endIndex: start + MAX_PAGE_SIZE - 1,
      });

      const rows = body.row ?? [];
      stations.push(...rows);

      const total = body.list_total_count ?? 0;
      // 받은 게 없으면(INFO-200 등) 총건수와 무관하게 멈춘다. 안 그러면 무한루프다.
      if (rows.length === 0 || stations.length >= total) {
        return stations;
      }
    }
  }
}
