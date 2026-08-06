/**
 * 조회 실패를 사용자에게 보여줄 문구(i18n 키)로 바꾼다.
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
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status !== 'number') {
    // 네트워크가 끊겼거나 요청 자체가 못 나갔다. 상태 코드가 아예 없다.
    return 'common.error.offline';
  }
  if (status === 401 || status === 403) return 'common.error.unauthorized';
  if (status === 429) return 'common.error.tooManyRequests';
  if (status >= 500) return 'common.error.server';
  return 'common.loadError';
}
