import {
  Body,
  Controller,
  GatewayTimeoutException,
  HttpException,
  Logger,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import type { RequestWithId } from '../common/request-id.middleware';

/**
 * 가드가 요청에 얹어 둔 신원. **둘 중 하나만 채워진다** —
 * access token 이면 user, 클라이언트 앱·서비스 키면 apiAccess 다.
 */
type AuthedRequest = Request & {
  user?: { userId?: number };
  apiAccess?: { appId: number };
};
import {
  AiSearchQuotaError,
  HealthcareAiSearchService,
  LlmConfigError,
  LlmError,
  LlmInvalidCallError,
} from '@hansapp/application';

import { Auth } from '../auth/auth.decorator';
import { AuthType } from '../auth/auth-type.enum';
import type { SupportedLang } from '@hansapp/common';
import { Lang } from '../common/lang.decorator';
import { AiSearchRequestDto, AiSearchResponseDto } from './dto/ai-search.dto';

/**
 * 자연어 병원 검색.
 *
 * **병원 목록을 주지 않는다 — 검색 조건을 준다.** 화면은 받은 조건을 칩으로 보여주고
 * (사용자가 고칠 수 있게) 그대로 `GET /healthcare/hospitals` 로 실제 목록을 받는다.
 * 그렇게 나눈 이유는 HealthcareAiSearchService 주석에 있다.
 *
 * **GET 이 아니라 POST 다.** 질문이 URL 에 남으면 접근 로그·리퍼러·브라우저 히스토리에
 * 그대로 쌓이는데, 건강 관련 질문이라 그러면 안 된다(위치 좌표를 URL 에 안 싣는 것과 같은 이유).
 * 캐시 가능한 조회도 아니라 GET 으로 얻을 것도 없다.
 *
 * **전역 한도보다 세게 조인다**(IP 당 60초에 10회). 호출 한 번이 외부 LLM 요금이라,
 * 폭주하면 응답이 느려지는 게 아니라 돈이 나간다.
 */
@ApiTags('healthcare')
@Auth(AuthType.Jwt, AuthType.ApiKey)
@Controller('healthcare/ai-search')
export class HealthcareAiSearchController {
  private readonly logger = new Logger(HealthcareAiSearchController.name);

  constructor(private readonly service: HealthcareAiSearchService) {}

  @Post()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({
    summary: '자연어 질문 → 실행할 툴',
    description:
      '질문을 **화면이 실행할 지시**로 옮긴다. 검색 결과가 아니다 — ' +
      '`tool` 로 갈리고 `params` 를 그대로 실어 기존 조회 API 를 부른다.\n\n' +
      '- `search_hospitals` `params.filter`(+`regionCd`)로 `GET /healthcare/hospitals`\n' +
      '- `search_nearby` 측위한 뒤 같은 조회에 `sort=distance`·좌표를 얹는다\n' +
      '- `ask_location` 지역을 되묻는다(장소를 말했는데 코드로 못 옮김). 조건은 살아 있다\n' +
      '- `reject` 검색하지 않는다. `explain` 을 보여준다\n\n' +
      '**좌표는 주지도 받지도 않는다** — 측위는 화면 몫이고 서버는 쓸지 말지만 정한다.\n' +
      '진단·치료 조언은 하지 않는다(병원을 고르는 조건만 만든다).',
  })
  async search(
    @Body() request: AiSearchRequestDto,
    @Req() req: Request,
    @Lang() lang: SupportedLang,
  ): Promise<AiSearchResponseDto> {
    try {
      /*
        업체·모델은 안 넘긴다(설정이 정한다). 넘기는 것은 **누가 물었나** 뿐이고,
        그건 하루 몫을 누구 통에서 깎을지 정하는 데만 쓴다.

        가드가 둘 중 하나를 채워 놓는다:
          user      access token 으로 사람이 식별됐다 (로그인 붙은 뒤)
          apiAccess 클라이언트 앱·서비스 키로 들어왔다 (지금은 이쪽뿐이다)

        **숫자 id(appId)로 센다. clientId 문자열은 쓰지 않는다** — 그건 추측 불가한 40자라
        사실상 자격증명이고, Redis 키에 평문으로 두면 KEYS 한 번에 다 보인다(질문을 해시로
        넣은 것과 같은 이유). appId 는 짧고 비밀도 아니다.

        브라우저로 왔든 서버 키로 왔든 같은 앱이면 한 통이다 — 정산 주체가 앱이라
        부르는 경로가 달라도 몫은 하나다.
      */
      const authed = req as AuthedRequest;
      const userId = authed.user?.userId;
      const appId = authed.apiAccess?.appId;

      // 추적 id 는 미들웨어가 이미 붙여 놨다(요청 헤더를 다시 읽지 않는다).
      const { requestId } = req as RequestWithId;
      const result = await this.service.extractFilter(request.q, {
        userId,
        appId,
        requestId,
        // 조건 이름을 사용자 언어로 풀어 오게 한다(코드는 언어가 없다).
        lang,
      });
      return new AiSearchResponseDto(result);
    } catch (cause) {
      throw this.toHttpException(cause);
    }
  }

  /**
   * LLM 실패를 상태코드로 옮긴다.
   *
   * **업체의 상태코드를 그대로 흘리지 않는다.** 우리 키가 틀려서 난 401 을 클라이언트에게
   * 401 로 주면 사용자는 자기가 로그인을 안 한 줄 안다 — 원인은 우리 설정이므로 5xx 가 맞다.
   * 429 만 그대로 넘긴다(클라이언트가 물러설 수 있는 유일한 신호다).
   */
  private toHttpException(cause: unknown): HttpException {
    /*
      **몫 소진.** 클라이언트 잘못이 아니라 429(너무 자주 불렀다)가 아니고, 잠시 뒤 다시
      해도 안 되니 504 도 아니다. 창이 바뀌어야 풀리는 상태라 503 이 맞다.
      로그인 전에는 남이 다 썼어도 여기로 오므로, 메시지도 "네가 많이 썼다" 로 쓰지 않는다.

      **어느 쪽 몫이 찼는지에 따라 말이 다르다** — 앱 하루치는 내일 풀리지만 월치는 다음
      달까지고, 개인 잔액은 시간이 지나도 안 풀린다(충전해야 한다).
    */
    if (cause instanceof AiSearchQuotaError) {
      this.logger.error(cause.message);
      return new ServiceUnavailableException(
        QUOTA_MESSAGE[`${cause.owner ?? ''}:${cause.window ?? ''}`] ??
          QUOTA_MESSAGE[''],
      );
    }
    if (!(cause instanceof LlmError)) {
      // 프롬프트 파일 없음 등. 그대로 올려 500 이 되게 두되 원인은 남긴다.
      this.logger.error(`ai search failed: ${String(cause)}`);
      return new ServiceUnavailableException('AI search is not available');
    }

    // **어느 모델로 부르다 실패했는지가 로그에 있어야 한다.** provider 만으로는 부족하다 —
    // 같은 anthropic 이라도 모델마다 되는 것과 안 되는 것이 다르다. 없으면 "무엇을 불렀나"
    // 부터 추측해야 하고, 그 추측이 틀리면 엉뚱한 데를 고치게 된다.
    this.logger.error(
      `llm call failed (provider=${cause.provider} ` +
        `requestModel=${cause.requestModel ?? '-'} status=${cause.status ?? '-'}): ` +
        `${cause.message}${cause.body ? ` body=${cause.body}` : ''}`,
    );

    // **보내기 전에 실패한 것들을 먼저 걸러낸다.** 둘 다 status 가 없어서(왕복을 안 했으니)
    // 아래 타임아웃 분기에 그대로 떨어졌었다 — 키가 없는데 "잠시 뒤 다시" 라고 안내하면
    // 사람이 고치기 전에는 영원히 안 되는 일을 기다리게 된다.
    if (cause instanceof LlmConfigError) {
      return new ServiceUnavailableException('AI search is not configured');
    }
    // 조립이 덜 된 호출 = 우리 코드 버그다. 밖으로는 같은 503 이지만 로그에 이름이 남아
    // "설정을 고쳐야 하나" 를 헷갈리지 않는다.
    if (cause instanceof LlmInvalidCallError) {
      return new ServiceUnavailableException('AI search failed');
    }
    if (cause.status === undefined) {
      // 타임아웃·네트워크 실패. 잠시 뒤 다시 하면 될 수 있다.
      return new GatewayTimeoutException('AI provider did not respond in time');
    }
    if (cause.status === 429) {
      return new HttpException('AI provider rate limit exceeded', 429);
    }
    return new ServiceUnavailableException('AI provider request failed');
  }
}

/**
 * 몫이 찼을 때의 안내. **언제 다시 되는지가 창마다 다르다.**
 * 빈 키는 계수기를 못 읽어 막은 경우(fail-closed)다 — 우리 쪽 문제라 기간을 말하지 않는다.
 */
const QUOTA_MESSAGE: Record<string, string> = {
  // 앱 예산. **사용자 잘못이 아니다** — 남이 다 썼어도 여기로 온다.
  'app:day': 'AI search is unavailable for today',
  'app:month': 'AI search is unavailable for this month',
  // 개인 잔액. 시간이 지나도 안 풀린다(충전해야 한다).
  'user:balance': 'Not enough tokens remaining',
  // 계수기를 못 읽어 막은 경우(fail-closed). 우리 쪽 문제라 기간을 말하지 않는다.
  '': 'AI search is not available',
};
