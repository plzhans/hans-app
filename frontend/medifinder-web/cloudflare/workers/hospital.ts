import type { Env } from './env';
import type { Lang } from './routing';
import type {
  HospitalDetailDto,
  HospitalNearbyResponseDto,
  TransportRouteDto,
} from '../../src/shared/api/generated/model';

/**
 * 넘기면 그 데이터를 포기한다.
 *
 * 1500ms 인 것은 API 응답이 210~418ms 이고 연결이 새로 맺어지는 첫 요청이 TLS 까지
 * 418ms 라서다. 300ms 로 좁히면 그 첫 요청이 매번 걸린다.
 * 걸려도 화면은 멀쩡해서 눈으로는 안 보이는 종류의 고장이다.
 */
const API_TIMEOUT_MS = 1500;

/** 병원 정보는 자주 바뀌지 않는다. 엣지에 물려 두면 대부분의 요청이 API 까지 가지 않는다. */
const FRESH_TTL = 3600;

/**
 * API 가 죽었을 때만 쓰는 사본의 수명.
 *
 * 오래된 병원 정보가 빈 페이지보다 낫다. 진료시간이 하루 이틀 어긋나는 것과 크롤러가
 * 내용 없는 껍데기를 긁어 가는 것은 손해의 크기가 다르다.
 */
const FALLBACK_TTL = 604800; // 7일

/**
 * 화면과 같은 타입을 쓴다. 생성된 DTO 라 서버 스펙이 바뀌면 `pnpm api:sync` 한 번에 따라온다.
 * import type 이라 번들에는 아무것도 들어가지 않는다.
 */
export type Hospital = HospitalDetailDto;
export type Nearby = HospitalNearbyResponseDto;
export type TransportRoute = TransportRouteDto;

/** GET /healthcare/hospitals/{id} */
export function fetchHospital(id: string, lang: Lang, env: Env, ctx: ExecutionContext) {
  return apiGet<Hospital>(`/healthcare/hospitals/${id}`, lang, env, ctx);
}

/**
 * GET /healthcare/hospitals/{id}/nearby — 근처의 비슷한 병원.
 *
 * 상세 응답에 없는 별개 호출이다. 반경이 기준 병원의 등급에 따라 달라서 조회 맥락에서
 * 계산되는 값이기 때문이다. 그래도 서버에서 받아 오는 것은, 여기서 나오는 병원 링크 여섯 개가
 * 상세끼리를 잇는 유일한 통로라서다. 없으면 크롤러에게 8만 개 상세가 서로 끊긴 섬이다.
 *
 * size 는 화면이 정한 값을 받아 쓴다. 어긋나면 react-query 키가 달라져서 브라우저가
 * 조용히 같은 것을 다시 부른다.
 */
export function fetchNearby(
  id: string,
  size: number,
  lang: Lang,
  env: Env,
  ctx: ExecutionContext,
) {
  return apiGet<Nearby>(`/healthcare/hospitals/${id}/nearby?size=${size}`, lang, env, ctx);
}

/**
 * API 를 한 번 부른다. 실패하면 오래된 사본, 그것도 없으면 null.
 *
 * 캐시가 두 겹이다.
 *
 *   1. Cloudflare 엣지(cf.cacheTtl) — 정상 경로. Tiered Cache 가 여기 걸려서
 *      데이터센터마다 따로 미스가 나지 않는다. caches.default.put() 으로 넣은 것은
 *      Tiered Cache 대상이 되지 않으므로 이 방식을 쓴다.
 *   2. caches.default 의 장기 사본 — 1번이 못 가져올 때만 읽는다.
 *
 * 언어를 URL 쿼리에 붙인다. 엣지 캐시는 URL 로 키를 만드는데 같은 URL 이 Accept-Language 에
 * 따라 다른 응답을 주므로, 안 붙이면 먼저 채운 언어가 모든 언어에 나간다. cf.cacheKey 로
 * 구분하는 방법은 Enterprise 전용이라 못 쓴다. 서버는 모르는 파라미터를 무시한다.
 *
 * 전역 변수에 담아 두지 않는다. 워커는 아이솔레이트라 요청 사이에 메모리가 남는다는
 * 보장이 없다(람다에서 컨테이너 재사용을 노리고 전역에 담아 두는 관행이 여기선 안 통한다).
 */
async function apiGet<T>(
  path: string,
  lang: Lang,
  env: Env,
  ctx: ExecutionContext,
): Promise<T | null> {
  const url = `${env.VITE_HANSAPP_BASE_URL}${path}${path.includes('?') ? '&' : '?'}_lang=${lang}`;
  const fallbackKey = new Request(`${url}&_fallback=1`);
  const cache = caches.default;

  try {
    const res = await fetch(url, {
      headers: {
        // 서버는 (client id, Origin) 쌍을 본다. Origin 이 없으면 client id 가 맞아도 401 이다.
        // 브라우저가 아니라 우리가 직접 붙인다.
        Origin: env.VITE_SITE_URL,
        'X-Client-Id': env.VITE_HANSAPP_CLIENT_ID,
        // 화면(shared/api/mutator.ts)이 보내는 것과 같은 값. 종별·진료과목·장비 같은
        // 코드표가 이 언어로 온다. 안 보내면 일본어 화면에 한국어 진료과목이 실린다.
        'Accept-Language': lang,
      },
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
      cf: { cacheTtl: FRESH_TTL, cacheEverything: true },
    });
    if (!res.ok) throw new Error(`api ${res.status}`);

    const body = await res.text();
    const parsed = JSON.parse(body) as T;
    ctx.waitUntil(
      cache.put(
        fallbackKey,
        new Response(body, {
          headers: {
            'content-type': 'application/json',
            'cache-control': `public, max-age=${FALLBACK_TTL}`,
          },
        }),
      ),
    );
    return parsed;
  } catch {
    // 타임아웃·네트워크 오류·5xx. 여기까지 왔으면 API 를 못 쓰는 상태다.
    //
    // 캐시 조회도 try 안에 둔다. 캐시 계층이 던지면 그게 그대로 500 이 되어 페이지가 통째로
    // 죽는다(로컬에서 캐시 저장소를 건드렸을 때 실제로 났다). 이건 페이지를 채우는 부속이라,
    // 여기서 무슨 일이 나든 화면은 떠야 한다.
    try {
      const stale = await cache.match(fallbackKey);
      if (stale) return (await stale.json()) as T;
    } catch {
      /* 사본까지 못 읽으면 포기한다 */
    }
    return null;
  }
}
