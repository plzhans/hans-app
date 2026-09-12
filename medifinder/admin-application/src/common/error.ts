import { HansApiError } from '@hans-api/sdk';

/**
 * 에러를 사람이 읽을 한 줄로 옮긴다.
 *
 * CLI 가 실패를 출력할 때 쓴다. 스택 트레이스를 내지 않는 이유는, 여기서 나는 실패가
 * 대부분 프로그램 오류가 아니라 **바깥 사정**(자격증명 없음·API 가 4xx·R2 거절)이라
 * 스택을 봐야 알 수 있는 것이 없기 때문이다.
 */
export function describeError(error: unknown): string {
  if (error instanceof HansApiError) {
    // **상태 코드만으로는 못 고친다.** 401 이 잘못된 키인지 정지된 앱인지, 400 이 어느
    // 파라미터인지는 서버가 본문에 적어 보낸다. SDK 는 그걸 담아만 두므로 여기서 편다.
    const detail = describeBody(error.body);
    return detail ? `HTTP ${error.status} ${error.statusText} — ${detail}` : error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/** 서버 오류 본문에서 읽을 만한 한 줄을 뽑는다. 모양이 낯설면 통째로 줄여서 낸다. */
function describeBody(body: unknown): string | undefined {
  if (typeof body === 'string') {
    return body.slice(0, 300) || undefined;
  }
  if (body && typeof body === 'object') {
    const { message, error } = body as { message?: unknown; error?: unknown };
    if (typeof message === 'string') return message;
    if (typeof error === 'string') return error;
    return JSON.stringify(body).slice(0, 300);
  }
  return undefined;
}
