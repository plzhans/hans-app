import type { ConfigSource } from './config-source';

/** 표시 전용 값(리디렉션 주소)을 만들 외부 주소 주입 토큰. */
export const SETTING_ORIGINS = Symbol('SETTING_ORIGINS');

/**
 * 브라우저가 실제로 닿는 주소. **경로 없이 `{scheme}://{host}` 까지다** — 뒤에 콜백 경로가 붙는다.
 *
 * 빈 문자열이면 그 오리진의 값은 만들지 않는다(화면이 "주소가 없다" 고 말한다). 설정이 비었는데
 * 아무 주소나 지어 보여 주면, 그것을 콘솔에 등록한 뒤 로그인이 막히는 자리에서야 드러난다.
 */
export interface SettingOrigins {
  /** 서비스 API. 소셜 로그인 콜백이 이리로 돌아온다. */
  readonly service: string;
  /** 관리자 API. 설정 주소일 뿐이라 요청 오리진이 있으면 그쪽이 우선한다(SettingAdminService). */
  readonly admin: string;
}

export function buildSettingOrigins(source: ConfigSource): SettingOrigins {
  return {
    service: trimTrailingSlash(source.getStringOrDefault('apps-api.externalUrl')),
    admin: trimTrailingSlash(source.getStringOrDefault('apps-admin-api.externalUrl')),
  };
}

/** 설정에 `https://example.com/` 로 적혀 있어도 `//auth/...` 가 되지 않게 한다. */
export function trimTrailingSlash(url: string | undefined): string {
  return (url ?? '').replace(/\/+$/, '');
}
