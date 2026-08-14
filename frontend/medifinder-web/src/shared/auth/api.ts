import type { MeResponseDto } from '@/shared/api/generated/model';
import { authClient } from './authClient';

/**
 * 로그인한 사용자 정보. 생성된 모델을 쓴다 — 서버 DTO 가 바뀌면 여기서 타입이 깨진다.
 *
 * **name 만 덮어쓴다.** 서버 DTO 의 `@ApiPropertyOptional` 에 `type: String` 이 없어
 * 스키마에 타입이 안 실리고, orval 이 그걸 `{ [key: string]: unknown }` 으로 뽑는다
 * (같은 이유로 timeZone 에는 `type: String` 이 붙어 있다). 서버를 고쳐 스펙을 다시
 * 만들면 이 줄은 지워도 된다.
 */
export type Me = Omit<MeResponseDto, 'name'> & {
  name?: string | null;
  /**
   * 회원 등급(BASIC·PRO·UNLIMITED).
   *
   * 서버 DTO 에는 있는데 생성된 모델에는 아직 없다 — 스펙을 다시 만들면(`pnpm api:sync`)
   * 따라 들어오므로 그때 이 줄을 지운다. 옛 서버가 응답하면 없을 수 있어 선택값이다.
   */
  tier?: string | null;
};

/**
 * `GET /users/me`.
 *
 * **생성된 훅(useUserControllerMe)을 쓰지 않는다.** 그쪽 mutator 는 X-Client-Id 만 붙이고
 * access token 을 모른다. 이 호출은 SDK 를 타야 Bearer 가 실리고, 401 이면 refresh 를
 * 한 번 돌린 뒤 재시도된다.
 */
export async function getMe(): Promise<Me> {
  const res = await authClient.fetchWithAuth('/users/me');
  if (!res.ok) {
    throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  }
  return (await res.json()) as Me;
}

/** 헤더에 보일 이름. 이름을 안 넣은 계정은 이메일 앞부분으로 대신한다. */
export function displayName(me: Me | null): string {
  return me?.name || me?.email?.split('@')[0] || '';
}
