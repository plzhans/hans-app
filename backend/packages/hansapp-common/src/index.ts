export const APP_NAME = 'hansapp';

export * from './localization/lang-text';
export * from './localization/accept-language';
export * from './location';
export * from './time-range';
export * from './env';
export * from './app-config';
export * from './config-source';
export * from './connection-url';
export * from './config-summary';
export * from './build-info';
// 되돌릴 수 없게 굳히는 단방향 해시와 토큰 조립. 인증 계층(공개·admin)이 함께 쓴다.
export * from './token-crypto';

/**
 * 목록 조회 공통 페이지 결과. 응용 계층 서비스가 반환하고,
 * server 계층은 이를 응답 DTO 형태로 매핑한다.
 */
export class Page<T> {
  readonly totalPages: number;

  constructor(
    readonly items: T[],
    readonly page: number,
    readonly size: number,
    readonly totalCount: number,
  ) {
    this.totalPages = size > 0 ? Math.ceil(totalCount / size) : 0;
  }
}

// 되돌릴 수 있게 잠그는 비밀 상자(AES-256-GCM). 남의 업체 키처럼 원문이 필요한 값에 쓴다.
export {
  seal,
  open,
  sealedVersion,
  suffixOf,
  secretEquals,
  parseSecretBoxKeys,
  SecretBoxError,
} from './secret-box';
export type { SecretBoxKeys } from './secret-box';

/*
  서비스 설정 카탈로그. **어떤 설정이 존재하는지는 코드가 소유하고, 그 코드는 여기 있다.**
  값은 DB(env_setting)에, 저장소는 @hansapp/data 에, 읽고 쓰는 구현체는 각 응용 계층에 있다.
  이 파일에는 그 셋이 공유하는 표와 타입만 둔다 — nest 도 prisma 도 필요 없다.
*/
export {
  LLM_DEFAULTS,
  SETTING_GROUPS,
  SETTING_KEYS,
  findSettingField,
  findSettingGroup,
} from './setting-catalog';
export type {
  SettingField,
  SettingFieldType,
  SettingGroup,
  SettingCategory,
  SettingConsole,
  SettingSource,
  SettingFieldView,
  SettingGroupView,
  SettingInput,
  SettingReader,
} from './setting-catalog';
export { SETTING_KEYRING, buildSettingKeyring } from './setting-keyring';
