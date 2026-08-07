import { Controller, Get, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthcareMetaService } from '@hansapp/application';

import { Auth } from '../auth/auth.decorator';
import { AuthType } from '../auth/auth-type.enum';
import type { Response } from 'express';

import { SubwayStationListDto } from './dto/transport.dto';

/**
 * 교통정보 API.
 *
 * **헬스케어 밑이 아니다.** 지역(/address/regions)과 같은 이유다 — 지하철역은 병원만 쓰는 데이터가
 * 아니다. 병원 전용인 것처럼 /healthcare 밑에 두면 다음 도메인이 붙는 순간 같은 사전을
 * 두 군데서 내게 된다.
 *
 * 코드 목록(/healthcare/meta)과도 성격이 다르다 — 저건 **검색 조건**으로 쓰는 코드이고,
 * 이건 **표시할 때 이름을 붙이는** 사전이다.
 *
 * 지금은 지하철역 목록뿐이다. 역 상세나 버스 정류장이 붙는다면 여기다 —
 * 버스도 같은 문제를 안고 있다(원문이 한국어 자유 텍스트다).
 */
@ApiTags('transport')
@Auth(AuthType.Jwt, AuthType.ApiKey)
@Controller('transport')
export class TransportController {
  constructor(private readonly service: HealthcareMetaService) {}

  /**
   * **Accept-Language 를 보지 않는다. 언어를 한꺼번에 다 내린다.**
   *
   * 다른 API 는 서버가 언어를 골라 평문으로 준다(공통 문서의 다국어 절 참고). 여기만 다르다.
   * **쓰는 방식이 다르기 때문이다** — 화면에 뿌리는 목록이 아니라, 클라이언트가 통째로 받아
   * 맵으로 들고 역이 나올 때마다 **찾아 바꾸는** 데 쓴다. 언어별로 내려주면 언어를 바꿀 때마다
   * 전량을 다시 받아야 한다. 세 언어를 다 담아도 gzip 십수 KB 라 그게 더 싸다.
   *
   * 부수 효과로 응답이 언어에 따르지 않으므로 **`Vary: Accept-Language` 가 필요 없다.**
   * 캐시 항목이 언어별로 쪼개지지도 않는다.
   *
   * **`private` 다 — CDN·프록시에 저장을 금지한다.** 인증이 걸린 엔드포인트라서다.
   * 공유 캐시가 이 응답을 들고 있으면 캐시 히트 시 origin 에 요청이 가지 않아 **아무도 토큰을
   * 검증하지 않는다.** 그러면 인증이 도는 것처럼 보이지만 실제로는 안 돈다. 그 상태가
   * 인증이 아예 없는 것보다 나쁘다 — 막고 있다고 착각하게 만든다.
   * (CDN 캐싱을 켜려면 이 엔드포인트를 @Public() 으로 여는 것이 정직하다.)
   */
  @Get('subway-stations')
  @ApiOperation({
    // 요약에 건수를 적지 않는다. 원본이 갱신되면 어긋나는데, 어긋난 숫자는 없는 것보다 나쁘다.
    summary: '지하철역 목록',
    description:
      '병원 상세의 교통정보(`transport.subway[].arrival`)에 나오는 하차역명을 화면에서 ' +
      '다국어로 보여줄 때 쓴다.\n\n' +
      '**세 언어를 한 번에 반환한다.** 다른 API 와 달리 `Accept-Language` 를 보지 않는다 — ' +
      '역명을 찾아 바꾸는 용도라 클라이언트가 전체를 받아 두고 쓰기 때문이며, 화면 언어를 ' +
      '바꿔도 다시 받을 필요가 없다.\n\n' +
      '**필터도 페이징도 없다.** 전체를 한 번에 받는다.\n\n' +
      '`Cache-Control: private, max-age=3600` 이 붙는다. 브라우저가 한 시간 캐시한다.\n\n' +
      '**응답의 `version` 과 `ETag` 에 원본 데이터의 배포일자가 담긴다.** ' +
      '`If-None-Match` 로 재검증하면 바뀐 게 없을 때 **304** 가 오고 본문은 안 내려온다. ' +
      '원본 갱신 주기가 길어(연 1~2회) 대부분의 재검증이 304 로 끝난다.\n\n' +
      '출처: 국가철도공단 전국 도시광역철도 역사정보 (표준데이터). 전국 도시철도를 모두 덮는다 ' +
      '— 수도권·부산·대구·대전·광주.',
  })
  @ApiOkResponse({ type: SubwayStationListDto })
  subwayStations(
    @Res({ passthrough: true }) res: Response,
  ): SubwayStationListDto {
    // **본문 해시가 아니라 데이터 버전으로 ETag 를 만든다.**
    // Express 기본 ETag 는 응답 본문을 매 요청 직렬화·해시해서 만든다 — 916역을 매번 그러는 건
    // 낭비이고, 무엇보다 "무엇이 바뀌면 값이 바뀌는가" 가 불분명하다. 우리는 안다:
    // 원본 엑셀이 갱신될 때, 그리고 응답 모양을 바꿀 때다. 그 둘만 담는다.
    //
    // Express 는 ETag 가 이미 있으면 자기 값을 덮어쓰지 않는다. 그래서 여기서 먼저 박는다.
    res.setHeader('ETag', this.service.subwayStationEtag());
    res.setHeader('Cache-Control', 'private, max-age=3600');

    return new SubwayStationListDto(
      this.service.subwayStationVersion(),
      this.service.listSubwayStations(),
    );
  }
}
