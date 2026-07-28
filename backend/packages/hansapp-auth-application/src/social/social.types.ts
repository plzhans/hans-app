import { OAuthProvider } from '@hansapp/data';

/** provider 전략이 정규화해 반환하는 공통 소셜 프로필. */
export interface SocialProfile {
  readonly provider: OAuthProvider;
  /** provider 고유 식별자(subject / user id) */
  readonly providerId: string;
  /** provider 가 준 이메일(없을 수 있음) */
  readonly email: string | null;
  /** 표시 이름 */
  readonly name: string | null;
  /** provider 기준 이메일 검증 여부 */
  readonly emailVerified: boolean;
}

/** 라우트 파라미터(:provider, 소문자) → OAuthProvider enum */
export function toOAuthProvider(param: string): OAuthProvider | null {
  switch (param.toLowerCase()) {
    case 'google':
      return OAuthProvider.GOOGLE;
    case 'naver':
      return OAuthProvider.NAVER;
    case 'kakao':
      return OAuthProvider.KAKAO;
    case 'line':
      return OAuthProvider.LINE;
    default:
      return null;
  }
}

/** OAuthProvider enum → passport 전략 이름(소문자) */
export function toStrategyName(provider: OAuthProvider): string {
  return provider.toLowerCase();
}
