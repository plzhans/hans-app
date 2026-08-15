import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService } from '@hansapp/application';

import { Public } from '../auth/public.decorator';

/** 프로세스가 뜬 시각. uptime 계산의 기준점이다. */
const STARTED_AT = Date.now();

/** readiness 응답의 점검 항목 한 줄. 실패 이유는 밖으로 내보내지 않는다(아래 주석 참고). */
interface CheckView {
  readonly name: string;
  readonly status: 'ok' | 'skipped' | 'failed';
}

/**
 * 헬스 체크.
 *
 * **살아 있나(liveness)와 일할 수 있나(readiness)를 나눈다.** 한 엔드포인트로 합치면
 * 흔한 사고가 난다 — 오케스트레이터는 liveness 실패를 "컨테이너를 재시작하라" 로 읽는데,
 * 거기에 인프라 점검을 섞어 두면 **DB 가 잠깐 흔들릴 때 멀쩡한 컨테이너가 전부 재시작된다.**
 * 재시작해도 DB 는 안 살아나므로 재시작 폭풍만 남는다.
 *
 *   GET /health        프로세스가 응답하나. 의존성을 안 본다. → 재시작 판단용
 *   GET /health/ready  MySQL·Redis·ES 까지 닿나. 못 닿으면 503. → 트래픽 투입 판단용
 *
 * **스펙에 싣지 않는다.** 인프라가 부르는 자리이지 연동하는 쪽이 쓰는 API 가 아니다.
 * `@ApiController` 를 달지 않는 것으로 빠진다 — 루트(`GET /`)도 같은 이유다.
 *
 * 점검 자체는 [`HealthService`](@hansapp/application)가 한다 — 부팅 때 같은 것을 보고,
 * CLI 도 같은 것을 본다. 여기서 다시 구현하면 "부팅은 통과했는데 readiness 는 실패" 같은
 * 어긋남이 생긴다.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @Public()
  liveness(): { status: 'ok'; uptimeSec: number } {
    return {
      status: 'ok',
      uptimeSec: Math.floor((Date.now() - STARTED_AT) / 1000),
    };
  }

  /*
    **점검표는 오류 응답이 아니라 상태 보고다.** 그래서 예외로 올리지 않고 상태 코드만
    직접 정한다 — 예외로 올리면 전역 필터가 `{ code, message }` 로 바꿔 버려서, 무엇이
    실패했는지 담은 checks 가 통째로 사라진다. 그 목록을 보려고 부르는 자리다.

    passthrough 를 켜서 직렬화는 Nest 에 그대로 맡긴다(res.json 을 직접 부르면 인터셉터가 빠진다).
  */
  @Get('ready')
  @Public()
  async readiness(@Res({ passthrough: true }) res: Response): Promise<{
    status: 'ok' | 'unavailable';
    checks: CheckView[];
    latencyMs: number;
  }> {
    const startedAt = Date.now();
    const results = await this.health.checkAll();
    const latencyMs = Date.now() - startedAt;

    /*
      **실패 이유(reason)는 응답에 담지 않는다.** 이 경로는 인증이 없어 누구나 부를 수 있는데,
      드라이버 예외 문자열에는 호스트·포트·계정명·DB 이름이 섞여 나온다.
      무엇이 실패했는지(name)까지만 알리고, 왜인지는 로그에서 본다.
    */
    const checks: CheckView[] = results.map((r) => ({
      name: r.name,
      status: r.status,
    }));

    // skipped 는 실패가 아니다 — 설정하지 않은 선택 의존성(예: Redis 미설정)이다.
    const failed = results.filter((r) => r.status === 'failed');
    if (failed.length > 0) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return { status: 'unavailable', checks, latencyMs };
    }

    return { status: 'ok', checks, latencyMs };
  }
}
