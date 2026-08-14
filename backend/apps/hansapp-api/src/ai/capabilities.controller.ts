import { Get, Req, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiController } from '@hansapp/http-common';
import type { Request } from 'express';

import { AiModelService, HealthcareAiSearchService } from '@hansapp/application';

import { Auth } from '../auth/auth.decorator';
import { AuthType } from '../auth/auth-type.enum';
import { CapabilitiesResponseDto } from './dto/capabilities.dto';

/**
 * 가드가 요청에 얹어 둔 신원. **둘 중 하나만 채워진다** —
 * access token 이면 user, 클라이언트 앱·서비스 키면 apiAccess 다.
 */
type AuthedRequest = Request & {
  user?: { userId?: number };
  apiAccess?: { appId: number };
};

/**
 * AI 로 지금 무엇을 할 수 있나.
 *
 * **`/healthcare` 아래가 아니다.** 지금 이 몫을 쓰는 곳이 병원 검색뿐이라 거기 두고
 * 싶어지지만, 재는 대상은 병원이 아니라 **부른 사람**이다 — 같은 잔액을 다른 기능이
 * 쓰기 시작해도 URL 은 그대로여야 하고, 화면 입장에서도 "내 잔액" 은 도메인을 안 탄다.
 * **`llm` 이 아니라 `ai` 인 것은 URL 이 계약이기 때문이다.** 설정은 `llm.*` 로 두는 것이
 * 맞지만(그건 구현을 가리킨다) 경로는 밖과 맺는 약속이라, 나중에 모델을 안 쓰는 방식으로
 * 바꿔도 안 깨져야 한다.
 *
 * **인증 종류를 나누지 않는다**(하나의 엔드포인트다). 자원은 "내 사용량" 하나이고
 * *누구*인지는 자격증명이 정한다 — 경로가 정할 일이 아니다. 나누면 화면이 "지금 로그인
 * 상태인가" 를 먼저 판단해 경로를 골라야 하는데, 그건 서버가 이미 하는 일이라
 * 토큰이 만료되는 경계에서 어긋나면 엉뚱한 통을 조회하게 된다.
 *
 * 로그인이 붙어도 화면은 안 고친다 — 같은 호출이 앱 몫에서 개인 잔액으로 알아서 넘어가고,
 * `kind` 가 어느 쪽인지 말해 준다.
 */
@ApiTags('ai')
@Auth(AuthType.Jwt, AuthType.ApiKey)
@ApiController('ai')
export class AiCapabilitiesController {
  constructor(
    private readonly aiSearch: HealthcareAiSearchService,
    private readonly models: AiModelService,
  ) {}

  @Get('capabilities')
  @ApiOperation({
    summary: 'AI 사용량 · 모델 목록',
    description:
      '남은 사용량과 선택할 수 있는 모델을 반환한다. **사용량을 소모하지 않는다.**\n\n' +
      'AI 기능을 **열 때 한 번** 호출한다. 이후 값은 검색 응답(`quota`)에 실려 오므로 ' +
      '주기적으로 호출하지 않는다.\n\n' +
      '누구의 사용량인지는 자격증명이 정한다 — access token 이면 사용자, ' +
      '클라이언트 키면 해당 앱의 몫이다.\n\n' +
      '`quota` 가 비어 오면 걸린 한도가 없다는 뜻이다. ' +
      '사용량을 확인할 수 없는 상태면 **503** 이며, 이때는 검색도 거절되므로 ' +
      'AI 기능을 비활성화하는 것이 맞다.',
  })
  // 반환 타입만으로는 스펙에 안 실린다 — 없으면 생성 SDK 가 응답을 `void` 로 본다.
  @ApiOkResponse({ type: CapabilitiesResponseDto })
  async capabilities(@Req() req: Request): Promise<CapabilitiesResponseDto> {
    const authed = req as AuthedRequest;
    /*
      **AI 검색 서비스에서 읽는다.** 계수기의 scope 가 기능별로 갈려 있어서
      (`ai-search:app:7`) 어느 통을 볼지는 기능이 안다 — 여기서 scope 문자열을 다시
      조립하면 규칙이 두 군데로 갈려, 한쪽만 고쳤을 때 조용히 다른 통을 읽는다.

      기능이 둘 이상이 되면 그때 통을 합칠지 나눌지를 정하고, 이 자리는 그 결과를
      모아 주는 곳이 된다.
    */
    const snapshot = await this.aiSearch.getQuota({
      userId: authed.user?.userId,
      appId: authed.apiAccess?.appId,
    });
    /*
      **못 읽었으면 200 으로 감싸 보내지 않는다.** 빈 몸통으로 내려보내면 화면은 그것을
      "한도 없음" 으로 읽고 평소처럼 질문을 받는데, 정작 질문은 계수기가 죽어서 막힌다
      (fail-closed). 물어보고 나서야 알게 되는 셈이라, 여기서 미리 실패로 알린다.
    */
    if (!snapshot.available) {
      throw new ServiceUnavailableException('Usage counter is unavailable');
    }
    /*
      **모델 목록도 서버가 정한다.** 화면이 들고 있으면 설정이 바뀌는 순간 거짓말이 된다 —
      "Haiku 로 보냅니다" 라고 적혀 있는데 서버는 다른 것을 부르는 식이다.

      **자격은 신원이 정한다.** 클라이언트 키만으로 온 요청은 서버가 실제로 부르는 하나만
      열린다. 로그인한 사람은 다 열린다 — 지금은 결제가 없어 로그인 여부로 대신 본다.
    */
    return new CapabilitiesResponseDto(
      snapshot.quota,
      // 모델 목록도 설정(DB)에서 온다 — 그래서 비동기다.
      await this.models.list(Boolean(authed.user?.userId)),
    );
  }
}
