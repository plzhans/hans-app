import { UserTier } from '@hansapi/data';

/**
 * 등급별 앱 생성 한도. null 은 무제한.
 * 신규 사용자는 BASIC. 운영자 계정은 수동으로 UNLIMITED 로 올린다.
 */
export const APP_LIMIT_BY_TIER: Record<UserTier, number | null> = {
  [UserTier.BASIC]: 3,
  [UserTier.PRO]: 10,
  [UserTier.UNLIMITED]: null,
};

/**
 * 앱당 서비스(API) 키 발급 한도의 **기본값**. 실제 상한은 App.apiKeyLimit 컬럼을 쓴다
 * (앱별로 값을 올려 늘릴 수 있게). 이 상수는 신규 앱 생성 시 컬럼 기본값 참고용.
 */
export const DEFAULT_API_KEY_LIMIT = 3;
