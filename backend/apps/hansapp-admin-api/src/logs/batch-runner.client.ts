import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  BATCH_RUN_AUDIENCE,
  BATCH_RUN_TOKEN_TTL_SEC,
  type BatchRunTarget,
  type BatchRunTokenClaims,
} from '@hansapp/common';
import { AdminJwtService } from '@hansapp/admin-application/auth';

/**
 * 배치가 답할 때까지 기다리는 시간.
 *
 * **짧아도 된다.** 저쪽은 잡을 띄우기만 하고 바로 답한다 — 적재가 끝날 때까지 붙들고 있지
 * 않는다. 여기서 길게 잡으면 배치가 죽어 있을 때 관리자 화면이 그만큼 멎는다.
 */
const REQUEST_TIMEOUT_MS = 5_000;

/**
 * 배치 프로세스를 부르는 쪽.
 *
 * **잡을 여기서 돌리지 않는다.** 적재 코드는 배치 컨테이너에 있고 콘솔은 그것을 깨울 뿐이다 —
 * 관리자 API 가 직접 돌리면 8만 건짜리 적재가 콘솔을 쓰는 사람의 요청과 같은 프로세스에서
 * 돈다. 크론으로 도는 것과 완전히 같은 코드를 지나야 이력도 겹침 판정도 한 벌로 남는다.
 *
 * 붙는 곳은 배치가 선언한 주소다(apps-batch.externalUrl).
 *
 * ## 배치가 우리를 어떻게 믿나
 *
 * 우리 개인키로 서명한 짧은 토큰을 싣고, 배치는 우리 JWKS 의 공개키로 검증한다.
 *
 * **대칭 비밀을 나눠 갖지 않는다.** 같은 문자열을 양쪽에 두면 배치 쪽에서 한 번 새는 순간
 * 위조가 가능해진다. 저쪽에는 공개키밖에 없어서 새어도 아무것도 못 만든다.
 *
 * **관리자 access token 을 그대로 넘기지도 않는다.** 그건 이 API 를 대상으로 발급된 것이고
 * 수명도 길다. aud 를 배치로 못박고 30초로 끊은 별도 토큰을 매번 찍는다.
 */
@Injectable()
export class BatchRunnerClient {
  private readonly logger = new Logger(BatchRunnerClient.name);

  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly jwt: AdminJwtService,
  ) {
    // 설정에 끝 슬래시를 붙여 적어도 경로가 `//jobs` 로 겹치지 않게 한다.
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  /**
   * 지금 돌리라고 배치에 전한다. **받아들여지면 바로 돌아온다.**
   *
   * @param kind 잡 전체(`job`)인가 단계 하나(`stage`)인가. 경로도 토큰도 이 값으로 갈린다.
   * @param job 잡 이름(`hira`) 또는 단계 키(`hira.7`).
   * @param force 이미 받은 것도 다시 받는다(신선도 판정 무시 + 받아 둔 병원 재조회).
   *   원본 호출을 크게 쓴다. **꺼진 단계를 뚫는 것과는 다르다** —
   *   관리자 화면에서 부른 실행은 이 값과 무관하게 꺼진 단계도 돈다.
   */
  async run(kind: BatchRunTarget, job: string, force: boolean, adminId: number): Promise<void> {
    if (!this.baseUrl) {
      throw new ServiceUnavailableException(
        'No batch address is configured (apps-batch.externalUrl)',
      );
    }

    /*
      **비대칭으로 서명하고 있을 때만 배치가 검증할 수 있다.** 대칭키(HS256)로 떨어져 있으면
      나눠 줄 공개키가 없어 저쪽이 무조건 거절한다 — 여기서 먼저 걸러 이유를 제대로 말해 준다.
      이 상태에서도 관리자 로그인은 멀쩡히 돈다.
    */
    if (!this.jwt.isAsymmetric) {
      throw new ServiceUnavailableException(
        'Admin tokens are signed with a symmetric key, so the batch process cannot verify this' +
          ' request — set admin.jwt.keyDir',
      );
    }

    const claims: BatchRunTokenClaims = { sub: String(adminId), kind, job, force };
    const token = this.jwt.signServiceToken(BATCH_RUN_AUDIENCE, claims, BATCH_RUN_TOKEN_TTL_SEC);

    const path = kind === 'stage' ? 'stages' : 'jobs';
    const url = `${this.baseUrl}/${path}/${encodeURIComponent(job)}/run`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        // **본문이 없다.** 무엇을 돌릴지·전부 다시 받을지가 서명된 토큰 안에 있다.
        // **표준 헤더를 쓴다** — 커스텀 이름은 Sentry·프록시의 기본 가림 목록에 없어
        // 값이 그대로 로그에 찍힌다.
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      /*
        붙지 못한 것은 대개 배치가 안 떠 있다는 뜻이다. **그 사실을 그대로 올린다** —
        여기서 성공처럼 삼키면 관리자는 돌기를 기다리다 아무 일도 없었다는 것을 나중에 안다.
      */
      this.logger.warn(`Could not reach the batch process at ${url}`, error);
      throw new ServiceUnavailableException(
        'The batch process did not respond — check that it is running',
      );
    }

    if (response.ok) {
      return;
    }

    const message = await readMessage(response);

    // 저쪽이 내린 판단은 그대로 전한다. 상태 코드를 뭉개면 화면이 겹침과 오타를 구별 못 한다.
    if (response.status === 409) {
      throw new ConflictException(message ?? `${job} is already running`);
    }
    if (response.status === 404) {
      throw new NotFoundException(message ?? `Unknown ${kind}: ${job}`);
    }
    if (response.status === 401) {
      /*
        저쪽이 우리를 못 믿었다. 대개 공개키를 아직 못 받았거나(관리자 키를 방금 바꿨다)
        배치가 우리 JWKS 에 닿지 못하는 경우다. 다시 눌러 보면 저쪽이 키를 받아 온다.
      */
      this.logger.error(`Batch rejected our token for ${job}: ${message ?? '(no message)'}`);
      throw new ServiceUnavailableException(
        'The batch process could not verify this request — check that it can reach this API',
      );
    }

    this.logger.error(`Batch refused to run ${job}: HTTP ${response.status} ${message ?? ''}`);
    throw new ServiceUnavailableException(
      `The batch process refused the request (HTTP ${response.status})`,
    );
  }
}

/** 오류 본문에서 한 줄만 꺼낸다. 본문이 없거나 JSON 이 아니어도 요청 처리는 이어져야 한다. */
async function readMessage(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { message?: unknown };
    return typeof body.message === 'string' ? body.message : undefined;
  } catch {
    return undefined;
  }
}
