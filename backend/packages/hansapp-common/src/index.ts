export const APP_NAME = 'hansapp';

export * from './localization/lang-text';
export * from './localization/accept-language';
export * from './localization/time-zone';
export * from './localization/user-locale';
export * from './location';
export * from './time-range';
export * from './env';
export * from './app-config';
export * from './config-defaults';
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

  /**
   * 항목만 바꾼 같은 페이지. `Page<엔티티>` → `Page<DTO>`.
   *
   * **조회한 자리에 변환을 매단다.** 그러지 않으면 부르는 쪽이 items 를 꺼내 옮기고 쪽수
   * 정보를 따로 챙겨 다시 조립해야 하는데, 그 과정에서 총 개수는 이 페이지 것이고 항목은
   * 저 페이지 것인 물건이 만들어질 수 있다. 여기서는 쪽수가 그대로 따라온다.
   *
   * (Spring Data 의 Page.map 과 같은 자리다.)
   */
  map<U>(toItem: (item: T) => U): Page<U> {
    return new Page<U>(this.items.map(toItem), this.page, this.size, this.totalCount);
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
  SettingDerived,
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
export { SETTING_ORIGINS, buildSettingOrigins, trimTrailingSlash } from './setting-origins';
export type { SettingOrigins } from './setting-origins';

// 커뮤니티(게시판·글·댓글). **enum 값이 곧 DB 값이다** — 이름으로 바꾸는 것은 HTTP 경계의
// @EnumField 가 한다(board-codes.ts 주석 참고).
export { AuthorType, PostStatus, CommentStatus, BoardWriteRole, BoardStatus } from './board-codes';
