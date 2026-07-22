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

/** 앱당 서비스(API) 키 발급 한도. 1개(발급/재발급으로 교체). */
export const API_KEY_LIMIT_PER_APP = 1;

/** 앱당 클라이언트 한도. 1개(더 필요하면 앱을 분리). */
export const CLIENT_LIMIT_PER_APP = 1;
