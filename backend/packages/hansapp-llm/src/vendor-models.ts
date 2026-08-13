import type { LlmEndpointSettings } from './llm-settings.source';

/**
 * 업체가 실제로 갖고 있는 모델 목록.
 *
 * **SDK 가 안 준다.** `@ai-sdk/*` 는 텍스트 생성 어댑터라 계정 관리 API(모델 목록·사용량)를
 * 다루지 않는다 — `createAnthropic()` 이 만드는 것은 LanguageModel 하나뿐이다. 셋 다 GET
 * 한 번이라 어댑터 없이 fetch 로 붙인다.
 *
 * **화면을 돕는 수단이지 관문이 아니다.** 키가 틀렸거나 로컬 서버가 꺼져 있으면 목록이 안
 * 오는데, 그때도 사람이 모델 이름을 직접 적을 수 있어야 한다 — 조회에 기대면 업체가 잠깐
 * 흔들릴 때 등록 자체가 막힌다. 그래서 던지되 부르는 쪽이 삼킬 수 있게 둔다.
 */
export async function fetchVendorModels(
  endpoint: LlmEndpointSettings,
  timeoutMs = 10_000,
): Promise<string[]> {
  const { url, headers } = hostedRequest(endpoint);
  const raw =
    endpoint.provider === 'local'
      ? await fetchLocalModels(endpoint, timeoutMs)
      : parse(await getJson(url, headers, timeoutMs));
  return toAliases(raw);
}

/**
 * 스냅샷 ID 를 **날짜 없는 별칭으로 접는다.** `claude-haiku-4-5-20251001` → `claude-haiku-4-5`
 *
 * [왜 서버가 접나]
 * 업체 목록에는 둘이 섞여 온다 — 최신은 별칭으로, 오래된 것은 스냅샷으로 나온다. 그대로
 * 보여 주면 화면에서 고른 값이 **스냅샷 ID 가 되는데 그건 은퇴한다** — 은퇴하는 날 아무도
 * 설정을 안 건드린 배포가 조용히 404 를 맞는다. 접는 규칙을 화면마다 다시 적을 이유도 없다.
 *
 * [남는 위험]
 * 접어 만든 별칭이 실재하는지는 목록만 봐서 알 수 없다. 업체가 별칭을 안 두는 모델이라면
 * 호출 때 404 다 — 그때는 화면에서 스냅샷 ID 를 직접 적으면 된다(입력칸은 늘 열려 있다).
 *
 * 순서는 업체가 준 순서를 지킨다. 같은 별칭으로 접히면 먼저 온 것만 남는다.
 */
function toAliases(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    // 꼬리의 -YYYYMMDD 만 뗀다. 버전 숫자(-4-5)는 이름의 일부라 건드리면 안 된다.
    const alias = id.replace(/-\d{8}$/, '');
    if (seen.has(alias)) continue;
    seen.add(alias);
    out.push(alias);
  }
  return out;
}

/**
 * 로컬은 두 갈래다. ollama 는 제 규격(`/api/tags`)이고 vLLM·LM Studio 는 OpenAI 호환
 * (`/v1/models`)이다. 어느 쪽인지 물어볼 방법이 없어 흔한 쪽부터 시도한다.
 */
async function fetchLocalModels(
  endpoint: LlmEndpointSettings,
  timeoutMs: number,
): Promise<string[]> {
  const base = trimEnd(endpoint.baseUrl);
  // 사내에 띄운 것은 대개 인증이 없다. 키가 있으면 붙여 준다.
  const headers: Record<string, string> = endpoint.secret
    ? { Authorization: `Bearer ${endpoint.secret}` }
    : {};
  try {
    return parse(await getJson(`${base}/api/tags`, headers, timeoutMs));
  } catch {
    return parse(await getJson(`${base}/v1/models`, headers, timeoutMs));
  }
}

function hostedRequest(endpoint: LlmEndpointSettings): {
  url: string;
  headers: Record<string, string>;
} {
  const base = trimEnd(endpoint.baseUrl);
  const secret = endpoint.secret ?? '';

  if (endpoint.provider === 'anthropic') {
    return {
      url: `${base}/v1/models?limit=100`,
      headers: {
        // 생성 호출과 같은 규칙이다 — 유형이 헤더를 정한다.
        ...(endpoint.keyType === 'authToken'
          ? {
              Authorization: `Bearer ${secret}`,
              'anthropic-beta': 'oauth-2025-04-20',
            }
          : { 'x-api-key': secret }),
        // 없으면 400 이다. 생성 호출은 SDK 가 붙여 주지만 여기는 우리가 붙인다.
        'anthropic-version': '2023-06-01',
      },
    };
  }
  return {
    url: `${base}/v1/models`,
    headers: { Authorization: `Bearer ${secret}` },
  };
}

async function getJson(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Model listing failed (HTTP ${res.status}) — ${await preview(res)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** 업체마다 응답 모양이 다르다. 아는 모양을 순서대로 본다. */
function parse(body: unknown): string[] {
  const json = body as {
    data?: { id?: string }[];
    models?: { name?: string; model?: string }[];
  };
  // anthropic · openai · OpenAI 호환
  if (Array.isArray(json.data)) {
    return json.data.map((m) => m.id ?? '').filter(Boolean);
  }
  // ollama
  if (Array.isArray(json.models)) {
    return json.models.map((m) => m.name ?? m.model ?? '').filter(Boolean);
  }
  return [];
}

function trimEnd(url: string): string {
  return url.replace(/\/+$/, '');
}

/** 오류 본문 앞부분. 통째로 실으면 로그가 업체 HTML 로 덮인다. */
async function preview(res: Response): Promise<string> {
  try {
    const body = await res.text();
    return body.slice(0, 200);
  } catch {
    return '(본문 없음)';
  }
}
