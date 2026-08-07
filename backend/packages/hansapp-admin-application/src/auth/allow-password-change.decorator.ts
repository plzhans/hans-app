import { SetMetadata } from '@nestjs/common';

export const ALLOW_DURING_PASSWORD_CHANGE_KEY = 'allowDuringPasswordChange';

/**
 * 비밀번호를 바꿔야 하는 상태에서도 부를 수 있는 라우트로 표시한다.
 *
 * 이 표시가 없는 라우트는 `mustChangePassword` 인 동안 가드가 403 으로 막는다.
 * **최소한만 열어야 한다** — 자기 정보 조회, 비밀번호 변경, 로그아웃 정도다.
 * 여기에 업무 API 를 하나라도 열면 "강제" 가 아니게 된다.
 */
export const AllowDuringPasswordChange = () =>
  SetMetadata(ALLOW_DURING_PASSWORD_CHANGE_KEY, true);
