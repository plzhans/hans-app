import {
  Controller,
  Get,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { HealthcareAiSearchService } from '@hansapp/application';

import { Auth } from '../auth/auth.decorator';
import { AuthType } from '../auth/auth-type.enum';
import { QuotaResponseDto } from './dto/quota.dto';

/**
 * 가드가 요청에 얹어 둔 신원. **둘 중 하나만 채워진다** —
 * access token 이면 user, 클라이언트 앱·서비스 키면 apiAccess 다.
 */
type AuthedRequest = Request & {
  user?: { userId?: number };
  apiAccess?: { appId: number };
};

/**
 * AI 사용량.
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
@Controller('ai')
export class AiQuotaController {
  constructor(private readonly aiSearch: HealthcareAiSearchService) {}

  @Get('quota')
  @ApiOperation({
    summary: '내 사용량',
    description:
      '지금까지 쓴 몫. **아무것도 깎지 않는다.**\n\n' +
      '화면이 채팅창을 **열 때 한 번** 부르는 용도다 — 첫 질문을 하기 전에도 얼마나 ' +
      '남았는지는 보여야 하는데, 답변에 실려 오는 `quota` 는 물어봐야 생긴다.\n\n' +
      '**주기적으로 부르지 마라.** 값이 바뀌는 계기는 이 사람이 질문하는 순간뿐이고 ' +
      '그때는 답변이 새 값을 싣고 온다. 폴링하면 안 바뀐 값을 계속 받는다.\n\n' +
      '**누구 몫인지는 자격증명이 정한다** — access token 이면 그 사람 잔액, ' +
      '클라이언트 키뿐이면 그 앱의 하루·이번 달 몫이다. 둘 다 걸려 있으면 둘 다 온다.\n\n' +
      '**계수기를 못 읽으면 503 이다** — 몸통이 비어 오는 것과 다르다. 빈 몸통은 ' +
      '"걸린 한도가 없다"(한도 0, 또는 Redis 를 안 쓰는 구성)이고, 503 은 "모른다" 다. ' +
      '모르는 상태에서는 질문도 막히므로(fail-closed) 화면은 AI 기능을 꺼야 한다.',
  })
  async quota(@Req() req: Request): Promise<QuotaResponseDto> {
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
    return new QuotaResponseDto(snapshot.quota);
  }
}
