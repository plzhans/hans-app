/**
 * 오류 번호별 i18n 키. 여기 없는 번호는 아래 status 단계로 떨어진다.
 *
 * **아직 비어 있다.** 이 앱이 만나는 실패는 status 만으로 안내가 갈린다 — 못 붙었나,
 * 너무 많이 불렀나, 서버가 깨졌나. 그보다 잘게 말해야 할 사유가 생기면 여기 한 줄을
 * 더한다(키는 locales 네 파일에 모두 넣어야 한다).
 *
 *   [16004]: 'common.error.aiQuota',   // AI_SEARCH_QUOTA_EXCEEDED
 *
 * 번호가 키인 이유는 문장이 아니라 번호가 계약이기 때문이다 — 서버가 문구를 다듬어도
 * 여기가 조용히 틀려지지 않는다. 번호표는
 * 백엔드의 계층별 번호표에 있다
 * (`hansapp-application/src/error/service-error-code.ts` 등).
 */
const KEYS: Record<number, string> = {};

/**
 * 조회 실패를 사용자에게 보여줄 문구(i18n 키)로 바꾼다.
 *
 * **좁은 것부터 본다** — errorCode(사유) → status(계열) → 기본값. 다른 앱의 errorMessage 와
 * 같은 순서다. status 와 errorCode 가 정하는 것이 다르기 때문인데, **status 는 동작**
 * (다시 시도할까·기다릴까), **errorCode 는 문구**(뭐라고 말할까)다.
 *
 * **상태 코드마다 사용자가 할 일이 다를 때만 문구를 가른다.** 화면에 "HTTP 500" 을 띄우는
 * 것도, 모든 실패를 한 문장으로 뭉개는 것도 도움이 안 된다 — 다시 시도하면 되는 것인지,
 * 기다려야 하는 것인지, 우리가 고쳐야 하는 것인지가 갈려야 한다.
 *
 * 401 은 **이용자의 로그인 문제가 아니다.** 이 앱의 조회는 로그인 없이 되고, 401 은 앱이
 * 서버에 자신을 증명하지 못했다는 뜻이다(클라이언트 등록·오리진 설정). 이용자가 할 수 있는
 * 일이 없으므로 "권한이 없습니다" 같은 말로 겁주지 않고, 연결 문제로 알린다.
 *
 * 나중에 로그인이 붙으면 401 이 "세션이 만료됐다" 를 뜻하는 경우가 생긴다. 그때는 여기서
 * 갈라야 한다 — 그 경우에만 "다시 로그인해 주세요" 가 맞는 안내다.
 */
export function loadErrorKey(error: unknown): string {
  const failure = error as { status?: unknown; body?: { errorCode?: number } } | null;

  // 1. 번호로 아는 안내
  const code = failure?.body?.errorCode;
  if (code !== undefined) {
    const known = KEYS[code];
    if (known) return known;
  }

  // 2. status 로 뭉뚱그린 안내
  const status = failure?.status;
  if (typeof status !== 'number') {
    // 네트워크가 끊겼거나 요청 자체가 못 나갔다. 상태 코드가 아예 없다.
    return 'common.error.offline';
  }
  if (status === 401 || status === 403) return 'common.error.unauthorized';
  if (status === 429) return 'common.error.tooManyRequests';
  if (status >= 500) return 'common.error.server';

  // 3. 그래도 없으면 기본값
  return 'common.loadError';
}

