import type { Env } from './env';
import type { Lang } from './routing';

/**
 * 넘기면 메타를 포기하고 껍데기를 그대로 내보낸다.
 *
 * **300ms 였다가 올렸다.** wrangler dev 로 재 보니 develop-api 응답이 210~418ms 였고,
 * 특히 연결이 새로 맺어지는 첫 요청이 TLS 까지 포함해 418ms 라 매번 걸렸다 —
 * 그런데 실패해도 화면은 멀쩡해서, 관측 헤더가 없었다면 못 봤을 종류의 고장이다.
 *
 * 사람이 이만큼 기다리는 건 **캐시 미스일 때뿐**이고, 그때도 첫 바이트만 늦는다.
 * 크롤러 입장에서는 메타가 없는 것보다 조금 늦는 편이 낫다.
 */
const API_TIMEOUT_MS = 1500;
/** 병원 정보는 자주 바뀌지 않는다. 엣지에 물려 두면 대부분의 요청이 API 까지 가지 않는다. */
const CACHE_TTL = 3600;

/** 지하철·버스·기타가 모두 같은 모양이다. kindName 이 '지하철'·'시내버스' 처럼 종류를 담는다. */
export type TransportRoute = {
  kindName?: string;
  line?: string;
  arrival?: string;
  distance?: string;
  dir?: string;
  note?: string;
};

/**
 * 단일 조회 응답에서 **우리가 쓰는 부분만** 적는다. 생성된 전체 DTO 타입을 끌어오지 않는
 * 이유는, 그러면 그 파일이 딸고 있는 것들까지 워커 번들로 따라 들어오기 때문이다.
 * 서버가 필드를 늘려도 여기는 안 바뀌어도 된다.
 */
export type Hospital = {
  name: string;
  tel?: string;
  emergency?: boolean;
  baby?: boolean;
  intro?: string;
  establishedAt?: string;
  category?: { code?: string; name?: string };
  tier?: { code?: string; name?: string };
  location?: {
    address?: string;
    postNo?: string;
    lat?: number;
    lon?: number;
    region?: { name?: string; sido?: { name?: string } };
  };
  directions?: string;
  transport?: {
    subway?: TransportRoute[];
    bus?: TransportRoute[];
    etc?: TransportRoute[];
  };
  subjects?: { name?: string; specialistCount?: number }[];
  hours?: { kind?: string; day: number; open?: string; close?: string }[];
  staff?: { doctorTotal?: number; specialist?: number };
  beds?: { total?: number; icu?: number };
  equipments?: { name?: string; count?: number }[];
  capabilities?: { name?: string }[];
  assessment?: { groups?: { items?: { name?: string; grade?: string }[] }[] };
};

/**
 * 병원 하나를 받아온다. 실패하면 null — 부르는 쪽이 껍데기를 그대로 내보낸다.
 *
 * **여기서만 API 를 부른다.** 홈·검색·약관은 번역 파일에서 문자열만 꺼내므로 왕복이 없다.
 *
 * **전역 변수에 캐시하지 않는다.** 워커는 아이솔레이트라 요청 사이에 메모리가 남는다는
 * 보장이 없다(람다에서 컨테이너 재사용을 노리고 전역에 담아 두는 관행이 여기선 안 통한다).
 * 대신 엣지 캐시에 넣는다.
 */
export async function fetchHospital(
  id: string,
  lang: Lang,
  env: Env,
  ctx: ExecutionContext,
): Promise<Hospital | null> {
  const url = `${env.VITE_HANSAPP_BASE_URL}/healthcare/hospitals/${id}`;

  // 캐시 키에 언어를 넣는다. 같은 URL 이 언어마다 다른 응답을 주므로,
  // 안 넣으면 먼저 채운 언어가 모든 언어에 나간다. 실제 요청은 원래 URL 로 나간다.
  const key = new Request(`${url}?_lang=${lang}`);
  const cache = caches.default;

  // **캐시 조회도 try 안에 둔다.** 예전엔 밖에 있었는데, 캐시 계층이 던지면 그게 그대로
  // 500 이 되어 페이지가 통째로 죽었다(로컬에서 캐시 저장소를 건드렸을 때 실제로 났다).
  // 이건 제목을 붙이는 부속이다 — 여기서 무슨 일이 나든 화면은 떠야 한다.
  try {
    const hit = await cache.match(key);
    if (hit) return (await hit.json()) as Hospital;

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
    });
    if (!res.ok) return null;

    const body = await res.text();
    ctx.waitUntil(
      cache.put(
        key,
        new Response(body, {
          headers: {
            'content-type': 'application/json',
            'cache-control': `public, max-age=${CACHE_TTL}`,
          },
        }),
      ),
    );
    return JSON.parse(body) as Hospital;
  } catch {
    return null; // 타임아웃·네트워크 오류 — 조용히 껍데기로 돌아간다
  }
}
